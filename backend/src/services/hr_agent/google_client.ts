import crypto from 'crypto';
import { google } from 'googleapis';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[GOOGLE AUTH] WARNING: Google OAuth credentials are not configured. Some features will be disabled.');
}

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || '',
    process.env.GOOGLE_CLIENT_SECRET || '',
    process.env.OAUTH_CALLBACK_URL || 'http://localhost:3001/api/hr-agent/auth/callback'
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    console.log('[GOOGLE AUTH] Loaded refresh token from environment');
}

// ── Token encryption (AES-256-GCM) ────────────────────────────────────────────
// Key is derived from JWT_SECRET so no extra env var is needed.

function getEncryptionKey(): Buffer {
    const secret = process.env.JWT_SECRET || 'nexus-hr-dev-encryption-key';
    return crypto.scryptSync(secret, 'nexus-hr-salt-v1', 32);
}

export function encryptToken(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted token format');
    const [ivHex, tagHex, encHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

// ── DB token loading ───────────────────────────────────────────────────────────

let _tokenLoadedFromDb = false;

export async function loadTokenFromDb(): Promise<void> {
    if (_tokenLoadedFromDb) return;
    _tokenLoadedFromDb = true;
    try {
        const { getDb } = await import('../../db');
        const db = await getDb();
        const row = await db.get<{ value: string }>(
            'SELECT value FROM system_settings WHERE key = ?',
            ['google_refresh_token']
        );
        if (row?.value) {
            const refreshToken = decryptToken(row.value);
            oauth2Client.setCredentials({ refresh_token: refreshToken });
            console.log('[GOOGLE AUTH] Loaded refresh token from database');
        }
    } catch (err: any) {
        console.warn('[GOOGLE AUTH] Could not load refresh token from database:', err.message);
    }
}

// ── Credential helpers ─────────────────────────────────────────────────────────

export function setGoogleCredentials(refreshToken: string) {
    if (!refreshToken) {
        throw new Error('Refresh token is required');
    }
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    console.log('[GOOGLE AUTH] Credentials updated successfully');
}

export function getOAuth2Client() {
    return oauth2Client;
}

export function getGmailClient() {
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID.');
    }
    return google.gmail({ version: 'v1', auth: oauth2Client });
}

export function getDriveClient() {
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID.');
    }
    return google.drive({ version: 'v3', auth: oauth2Client });
}

export function getSheetsClient() {
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID.');
    }
    return google.sheets({ version: 'v4', auth: oauth2Client });
}

export function getCalendarClient() {
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID.');
    }
    return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Test connection function
export async function testGoogleConnection(): Promise<boolean> {
    try {
        const gmail = getGmailClient();
        await gmail.users.getProfile({ userId: 'me' });
        return true;
    } catch (err) {
        console.error('[GOOGLE AUTH] Connection test failed:', err);
        return false;
    }
}
