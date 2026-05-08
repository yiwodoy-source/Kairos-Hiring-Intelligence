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
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    console.log('[GOOGLE AUTH] Loaded refresh token from environment');
}

// We need a way to set the refresh token
export function setGoogleCredentials(refreshToken: string) {
    if (!refreshToken) {
        throw new Error('Refresh token is required');
    }
    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });
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
