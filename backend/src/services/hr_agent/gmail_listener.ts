import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { loadGmailCredentials } from './smtp_client';
import { logAgentActivity } from './logger';
import { getDb } from '../../db';

export interface IncomingCV {
    email: string;
    senderName: string;
    attachmentBuffer: Buffer | null;
    fileName: string | null;
    messageId: string;
    subject: string;
    applicationContent: string;
    source: 'application-label' | 'unread-fallback' | 'unread-inbox';
}

const GMAIL_FETCH_LIMIT = Math.min(parseInt(process.env.GMAIL_FETCH_LIMIT || '15', 10), 50);

// Sender domains that are never real candidates
const BLOCKED_SENDER_DOMAINS = [
    'linkedin.com', 'indeed.com', 'naukri.com', 'glassdoor.com', 'monster.com',
    'shine.com', 'foundit.in', 'timesjobs.com', 'iimjobs.com', 'hirist.com',
    'instahyre.com', 'internshala.com', 'facebook.com', 'twitter.com',
    'google.com', 'youtube.com', 'amazon.com', 'flipkart.com',
    'notifications.google.com', 'accounts.google.com', 'facebookmail.com',
    'amazonses.com', 'sendgrid.net', 'mailchimp.com', 'constantcontact.com',
];
const BLOCKED_SENDER_PREFIXES = [
    'noreply', 'no-reply', 'donotreply', 'do-not-reply',
    'mailer-daemon', 'postmaster', 'bounce', 'notification', 'notify',
    'alert', 'support', 'newsletter', 'updates', 'info', 'admin',
    'automated', 'system', 'automailer',
];

// Subject must match ONE of these (plain-text emails with no PDF — strict)
const APPLICATION_SUBJECT_PATTERNS = [
    /\bappl(y|ying|ication)\b/i,
    /\bresume\b/i,
    /\bcurriculum vitae\b/i,
    /\b(my\s+)?cv\b/i,
    /\bjob\s+(application|enquiry|inquiry|interest)\b/i,
    /\bapplying\s+for\b/i,
    /\bcandidat(e|ure)\b/i,
];

// Subjects that indicate non-job emails even if they have a PDF
const NON_APPLICATION_SUBJECT_PATTERNS = [
    /\b(invoice|receipt|order|payment|statement|bill|transaction|confirmation|booking|ticket|delivery|shipment|tracking|otp|verification|password|reset|security|alert|notification|newsletter|unsubscribe|promo|offer|discount|sale|deal)\b/i,
];

function isBlockedSender(email: string): boolean {
    const emailLower = email.toLowerCase();
    if (BLOCKED_SENDER_DOMAINS.some(d => emailLower.endsWith('@' + d) || emailLower.includes('@' + d + '.'))) return true;
    const localPart = emailLower.split('@')[0] || '';
    if (BLOCKED_SENDER_PREFIXES.some(p => localPart === p || localPart.startsWith(p + '.') || localPart.startsWith(p + '_') || localPart.startsWith(p + '-'))) return true;
    return false;
}

// For plain-text emails (no PDF): subject MUST explicitly signal a job application
function subjectIsJobApplication(subject: string): boolean {
    return APPLICATION_SUBJECT_PATTERNS.some(p => p.test(subject));
}

// For PDF emails: reject if subject clearly indicates non-application content
function subjectIsNonApplication(subject: string): boolean {
    return NON_APPLICATION_SUBJECT_PATTERNS.some(p => p.test(subject));
}

async function createImapClient(): Promise<ImapFlow> {
    const creds = await loadGmailCredentials();
    if (!creds) throw new Error('Gmail credentials not configured. Enter email + App Password in Settings.');
    return new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: creds.user, pass: creds.password },
        logger: false,
    });
}

async function hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    const db = await getDb();
    const existing = await db.get('SELECT message_id FROM processed_email_messages WHERE message_id = ?', messageId);
    return Boolean(existing);
}

export async function checkNewEmails(): Promise<IncomingCV[]> {
    const client = await createImapClient();
    const cvs: IncomingCV[] = [];

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');

        try {
            const uids = await client.search({ seen: false }, { uid: true }) as number[];
            const toProcess = uids.slice(0, GMAIL_FETCH_LIMIT);

            for (const uid of toProcess) {
                const messageIdStr = String(uid);

                if (await hasMessageBeenProcessed(messageIdStr)) {
                    logAgentActivity(`Skipping already processed message: ${messageIdStr}`, 'WARN');
                    continue;
                }

                try {
                    const download = await client.download(String(uid), undefined, { uid: true });
                    if (!download) continue;

                    const parsed = await simpleParser(download.content);
                    const pdfAttachments = (parsed.attachments || []).filter(a =>
                        a.contentType === 'application/pdf' ||
                        (a.filename || '').toLowerCase().endsWith('.pdf')
                    );

                    const fromAddr = parsed.from?.value?.[0];
                    const email = fromAddr?.address || '';
                    const senderName = fromAddr?.name || email;
                    const subject = parsed.subject || 'Job Application';
                    const applicationContent = parsed.text?.replace(/\s+/g, ' ').trim() || '';

                    const skipAndMark = async (reason: string) => {
                        logAgentActivity(`Skipping email from ${email} — ${reason} (subject: "${subject}")`, 'WARN');
                        try {
                            await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
                            const db2 = await getDb();
                            await db2.run(
                                `INSERT OR IGNORE INTO processed_email_messages (message_id, sender_email, subject, status, processed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                [messageIdStr, email, subject, `skipped-${reason}`]
                            );
                        } catch {}
                    };

                    // Hard block: automated senders, platforms, noreply addresses
                    if (isBlockedSender(email)) {
                        await skipAndMark('blocked-sender');
                        continue;
                    }

                    if (pdfAttachments.length > 0) {
                        // PDF email — only skip if subject clearly indicates non-application (invoice, receipt, etc.)
                        if (subjectIsNonApplication(subject)) {
                            await skipAndMark('non-application-pdf');
                            continue;
                        }
                        for (const attachment of pdfAttachments) {
                            cvs.push({
                                email,
                                senderName,
                                attachmentBuffer: attachment.content,
                                fileName: attachment.filename || 'resume.pdf',
                                messageId: messageIdStr,
                                subject,
                                applicationContent,
                                source: 'unread-fallback',
                            });
                        }
                    } else {
                        // No PDF attachment — never reply, just mark read and skip
                        await skipAndMark('no-pdf');
                    }
                } catch (msgErr: any) {
                    logAgentActivity(`Failed to process IMAP message ${uid}: ${msgErr.message}`, 'ERROR');
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
    } catch (error: any) {
        logAgentActivity(`IMAP query failed: ${error.message}`, 'ERROR');
        try { await client.logout(); } catch {}
    }

    return cvs;
}

export async function markAsProcessed(messageId: string, senderEmail: string, subject: string, status: string): Promise<void> {
    const client = await createImapClient();

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            await client.messageFlagsAdd({ uid: Number(messageId) }, ['\\Seen'], { uid: true });
        } finally {
            lock.release();
        }
        await client.logout();
    } catch (error: any) {
        logAgentActivity(`Failed to mark IMAP message ${messageId} as read: ${error.message}`, 'ERROR');
        try { await client.logout(); } catch {}
    }

    try {
        const db = await getDb();
        await db.run(`
            INSERT INTO processed_email_messages (
                message_id, sender_email, subject, status, processed_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(message_id) DO UPDATE SET
                sender_email = EXCLUDED.sender_email,
                subject      = EXCLUDED.subject,
                status       = EXCLUDED.status,
                processed_at = CURRENT_TIMESTAMP
        `, [messageId, senderEmail, subject, status]);
    } catch (dbErr: any) {
        logAgentActivity(`Failed to record processed message ${messageId}: ${dbErr.message}`, 'ERROR');
    }
}

export const markAsRead = markAsProcessed;
