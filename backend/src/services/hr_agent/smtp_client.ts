import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { errMsg } from '../../lib/errMsg';

function getEncryptionKey(): Buffer {
    const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET must be configured to encrypt credentials.');
    return crypto.scryptSync(secret, 'nexus-hr-salt-v1', 32);
}

function encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted credential format');
    const [ivHex, tagHex, encHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

export interface GmailCredentials {
    user: string;
    password: string;
}

let _cache: GmailCredentials | null = null;

export function invalidateGmailCredentialCache(): void {
    _cache = null;
}

export async function loadGmailCredentials(): Promise<GmailCredentials | null> {
    if (_cache) return _cache;

    try {
        const { getDb } = await import('../../db');
        const db = await getDb();
        const userRow = await db.get<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', ['gmail_user']);
        const passRow = await db.get<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', ['gmail_app_password']);
        if (userRow?.value && passRow?.value) {
            _cache = { user: decrypt(userRow.value), password: decrypt(passRow.value) };
            return _cache;
        }
    } catch (err) {
        console.warn('[SMTP] DB credential load failed:', errMsg(err));
    }

    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        _cache = { user: process.env.GMAIL_USER.trim(), password: process.env.GMAIL_APP_PASSWORD.trim() };
        return _cache;
    }

    return null;
}

export async function saveGmailCredentials(user: string, password: string): Promise<void> {
    const { getDb } = await import('../../db');
    const db = await getDb();
    await db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        ['gmail_user', encrypt(user.trim())]
    );
    await db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        ['gmail_app_password', encrypt(password.trim())]
    );
    invalidateGmailCredentialCache();
}

export async function createSMTPTransporter(): Promise<nodemailer.Transporter> {
    const creds = await loadGmailCredentials();
    if (!creds) throw new Error('Gmail credentials not configured. Enter email + App Password in Settings.');

    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: creds.user, pass: creds.password },
    });
}

export async function testSMTPConnection(): Promise<{ success: boolean; user?: string; error?: string }> {
    try {
        const creds = await loadGmailCredentials();
        if (!creds) return { success: false, error: 'No credentials configured' };
        const transporter = await createSMTPTransporter();
        await transporter.verify();
        return { success: true, user: creds.user };
    } catch (err: unknown) {
        return { success: false, error: errMsg(err) };
    }
}
