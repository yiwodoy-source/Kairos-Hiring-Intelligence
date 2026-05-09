import { getDriveClient } from './google_client';
import { logAgentActivity } from './logger';
import { Readable } from 'stream';

const DEFAULT_DRIVE_FOLDER_NAME = process.env.GOOGLE_DRIVE_FOLDER_NAME || 'NexusHR Candidates';
let resolvedFolderId: string | null | undefined;

function sanitizeFilename(filename: string): string {
    let sanitized = filename.replace(/\.\.[\/\\]/g, '');
    sanitized = sanitized.replace(/[^a-zA-Z0-9._\-]/g, '_');
    if (sanitized.length > 200) sanitized = sanitized.substring(0, 200);
    if (!sanitized.toLowerCase().endsWith('.pdf')) sanitized += '.pdf';
    return sanitized;
}

function escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function resolveTargetFolderId(): Promise<string | null> {
    if (resolvedFolderId !== undefined) {
        return resolvedFolderId;
    }

    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
        resolvedFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        return resolvedFolderId;
    }

    try {
        const drive = getDriveClient();
        const existing = await drive.files.list({
            q: `mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQueryValue(DEFAULT_DRIVE_FOLDER_NAME)}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        const folder = existing.data.files?.[0];
        if (folder?.id) {
            resolvedFolderId = folder.id;
            logAgentActivity(`Using existing Drive folder: ${DEFAULT_DRIVE_FOLDER_NAME} (${folder.id})`);
            return resolvedFolderId;
        }

        const created = await drive.files.create({
            requestBody: {
                name: DEFAULT_DRIVE_FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });

        resolvedFolderId = created.data.id || null;
        if (resolvedFolderId) {
            logAgentActivity(`Created Drive folder for candidate exports: ${DEFAULT_DRIVE_FOLDER_NAME} (${resolvedFolderId})`);
        }
        return resolvedFolderId;
    } catch (error: any) {
        logAgentActivity(`Failed to resolve Drive folder: ${error.message}`, 'WARN');
        resolvedFolderId = null;
        return null;
    }
}

export async function uploadCVToDrive(buffer: Buffer, fileName: string): Promise<string> {
    try {
        if (!buffer || buffer.length === 0) throw new Error('Buffer is empty');

        const drive = getDriveClient();
        const folderId = await resolveTargetFolderId();
        const safeFileName = sanitizeFilename(fileName);

        const fileMetadata = { name: safeFileName, parents: folderId ? [folderId] : [] };
        const media = { mimeType: 'application/pdf', body: Readable.from(buffer) };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media as any,
            fields: 'id, webViewLink'
        });

        // Files remain private to the Drive owner — no public sharing.
        // The webViewLink is accessible only to authenticated Google accounts
        // with explicit access; recruiters access it via their own Google session.
        logAgentActivity(`Uploaded CV to Drive: ${response.data.id}`);
        return response.data.webViewLink || '';
    } catch (error: any) {
        logAgentActivity(`Drive upload failed: ${error.message}`, 'ERROR');
        return '';
    }
}

export async function uploadTextFileToDrive(content: string, fileName: string): Promise<string> {
    try {
        if (!content.trim()) throw new Error('Text content is empty');

        const drive = getDriveClient();
        const folderId = await resolveTargetFolderId();
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200) || `candidate_${Date.now()}.txt`;
        const finalFileName = safeFileName.toLowerCase().endsWith('.txt') ? safeFileName : `${safeFileName}.txt`;

        const response = await drive.files.create({
            requestBody: { name: finalFileName, parents: folderId ? [folderId] : [] },
            media: {
                mimeType: 'text/plain',
                body: Readable.from(Buffer.from(content, 'utf8'))
            } as any,
            fields: 'id, webViewLink'
        });

        logAgentActivity(`Uploaded candidate summary to Drive: ${response.data.id}`);
        return response.data.webViewLink || '';
    } catch (error: any) {
        logAgentActivity(`Drive text upload failed: ${error.message}`, 'ERROR');
        return '';
    }
}
