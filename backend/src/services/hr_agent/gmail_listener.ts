import { getGmailClient } from './google_client';
import { logAgentActivity } from './logger';
import { getDb } from '../../db';

export interface IncomingCV {
    email: string;
    senderName: string;
    attachmentBuffer: Buffer;
    fileName: string;
    messageId: string;
    subject: string;
    applicationContent: string;
    source: 'application-label' | 'unread-fallback';
}

const APPLICATION_LABEL_NAME = process.env.GMAIL_APPLICATION_LABEL || 'NexusHR/Application';
const PROCESSED_LABEL_NAME = process.env.GMAIL_PROCESSED_LABEL || 'NexusHR/Processed';

function normalizeHeaderName(name?: string | null): string {
    return (name || '').toLowerCase();
}

function extractEmail(fromHeader: string): { email: string; senderName: string } {
    const emailMatch = fromHeader.match(/<([^>]+)>/);
    const email = (emailMatch ? emailMatch[1] : fromHeader).trim().replace(/^"|"$/g, '');
    const senderName = fromHeader.replace(/<.+>/, '').trim().replace(/^"|"$/g, '') || email;
    return { email, senderName };
}

function decodeBase64Url(data?: string | null): string {
    if (!data) return '';
    const base64Data = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64Data, 'base64').toString('utf8');
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function collectParts(part: any, parts: any[] = []): any[] {
    parts.push(part);
    for (const child of part.parts || []) {
        collectParts(child, parts);
    }
    return parts;
}

function extractApplicationContent(payload: any): string {
    const parts = collectParts(payload);
    const textPart = parts.find(part => part.mimeType === 'text/plain' && part.body?.data);
    if (textPart) {
        return decodeBase64Url(textPart.body.data).replace(/\s+/g, ' ').trim();
    }

    const htmlPart = parts.find(part => part.mimeType === 'text/html' && part.body?.data);
    if (htmlPart) {
        return stripHtml(decodeBase64Url(htmlPart.body.data));
    }

    return '';
}

async function findLabelId(labelName: string): Promise<string | null> {
    const gmail = getGmailClient();
    const labels = await gmail.users.labels.list({ userId: 'me' });
    return labels.data.labels?.find(label => label.name === labelName)?.id || null;
}

async function getOrCreateLabelId(labelName: string): Promise<string> {
    const existingLabelId = await findLabelId(labelName);
    if (existingLabelId) {
        return existingLabelId;
    }

    const gmail = getGmailClient();
    const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show'
        }
    });

    if (!created.data.id) {
        throw new Error(`Gmail label ${labelName} was created without an id`);
    }

    logAgentActivity(`Created Gmail label: ${labelName}`);
    return created.data.id;
}

async function hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    const db = await getDb();
    const existing = await db.get(
        'SELECT message_id FROM processed_email_messages WHERE message_id = ?',
        messageId
    );
    return Boolean(existing);
}

async function listCandidateMessages(applicationLabelId: string) {
    const gmail = getGmailClient();
    const messagesById = new Map<string, 'application-label' | 'unread-fallback'>();

    const labeled = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [applicationLabelId],
        q: 'has:attachment filename:pdf'
    });

    for (const message of labeled.data.messages || []) {
        if (message.id) messagesById.set(message.id, 'application-label');
    }

    const unreadFallback = await gmail.users.messages.list({
        userId: 'me',
        q: 'has:attachment filename:pdf is:unread'
    });

    for (const message of unreadFallback.data.messages || []) {
        if (message.id && !messagesById.has(message.id)) {
            messagesById.set(message.id, 'unread-fallback');
        }
    }

    return messagesById;
}

export async function checkNewEmails(): Promise<IncomingCV[]> {
    try {
        const gmail = getGmailClient();
        const applicationLabelId = await getOrCreateLabelId(APPLICATION_LABEL_NAME);
        const processedLabelId = await getOrCreateLabelId(PROCESSED_LABEL_NAME);
        const messagesById = await listCandidateMessages(applicationLabelId);

        if (messagesById.size === 0) {
            return [];
        }

        const cvs: IncomingCV[] = [];

        for (const [messageId, source] of messagesById) {
            if (await hasMessageBeenProcessed(messageId)) {
                logAgentActivity(`Skipping already processed Gmail message: ${messageId}`, 'WARN');
                continue;
            }

            const fullMsg = await gmail.users.messages.get({
                userId: 'me',
                id: messageId
            });

            if (fullMsg.data.labelIds?.includes(processedLabelId)) {
                logAgentActivity(`Skipping Gmail message already labeled processed: ${messageId}`, 'WARN');
                continue;
            }

            const payload = fullMsg.data.payload;
            if (!payload || !payload.parts) continue;

            const headers = payload.headers || [];
            const fromHeader = headers.find(h => normalizeHeaderName(h.name) === 'from')?.value || '';
            const subject = headers.find(h => normalizeHeaderName(h.name) === 'subject')?.value || 'Job Application';
            const { email, senderName } = extractEmail(fromHeader);
            const applicationContent = extractApplicationContent(payload);

            for (const part of collectParts(payload)) {
                if (part.mimeType === 'application/pdf' && part.body?.attachmentId) {
                    const attachment = await gmail.users.messages.attachments.get({
                        userId: 'me',
                        messageId,
                        id: part.body.attachmentId
                    });

                    if (attachment.data.data) {
                        const base64Data = attachment.data.data.replace(/-/g, '+').replace(/_/g, '/');
                        const buffer = Buffer.from(base64Data, 'base64');
                        cvs.push({
                            email,
                            senderName,
                            attachmentBuffer: buffer,
                            fileName: part.filename || 'resume.pdf',
                            messageId,
                            subject,
                            applicationContent,
                            source
                        });
                    }
                }
            }
        }

        return cvs;
    } catch (error: any) {
        logAgentActivity(`Gmail query failed: ${error.message}`, 'ERROR');
        return [];
    }
}

export async function markAsProcessed(messageId: string, senderEmail: string, subject: string, status: string): Promise<void> {
    try {
        const gmail = getGmailClient();
        const processedLabelId = await getOrCreateLabelId(PROCESSED_LABEL_NAME);
        await gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
                ids: [messageId],
                addLabelIds: [processedLabelId],
                removeLabelIds: ['UNREAD']
            }
        });

        const db = await getDb();
        await db.run(`
            INSERT OR REPLACE INTO processed_email_messages (
                message_id, sender_email, subject, status, processed_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [messageId, senderEmail, subject, status]);
    } catch (error: any) {
        logAgentActivity(`Failed to mark email ${messageId} as processed: ${error.message}`, 'ERROR');
    }
}

export const markAsRead = markAsProcessed;
