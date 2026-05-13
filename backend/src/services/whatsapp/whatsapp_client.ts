import axios from 'axios';
import { log } from '../../lib/logger';
import { errMsg } from '../../lib/errMsg';
import { getDb } from '../../db';

const BASE_URL   = process.env.OPENCLAW_BASE_URL   || 'http://127.0.0.1:18789';
const AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN  || '';
const MODEL      = process.env.OPENCLAW_MODEL        || 'openclaw/default';
const TOOL_NAME  = process.env.OPENCLAW_WA_TOOL_NAME || 'whatsapp_send_message';

export interface WASendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WAMessage {
  id: number;
  phone: string;
  direction: 'outbound' | 'inbound';
  body: string;
  status: string;
  candidate_email: string | null;
  created_at: string;
}

// ─── Send ────────────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  candidateEmail?: string
): Promise<WASendResult> {
  try {
    const response = await axios.post(
      `${BASE_URL}/v1/chat/completions`,
      {
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: `Send a WhatsApp message to ${phone}: "${message}"`,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: TOOL_NAME,
              description: 'Send a WhatsApp message to a phone number',
              parameters: {
                type: 'object',
                properties: {
                  phone:   { type: 'string', description: 'E.164 phone number e.g. +919876543210' },
                  message: { type: 'string', description: 'Message body text' },
                },
                required: ['phone', 'message'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: TOOL_NAME } },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
        timeout: 30_000,
      }
    );

    const choice   = response.data?.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    const success  = toolCall?.function?.name === TOOL_NAME;

    await logMessage(phone, 'outbound', message, success ? 'sent' : 'failed', candidateEmail);

    if (success) {
      log.info(`[WhatsApp] Sent to ${phone}`);
      return { success: true, messageId: toolCall.id };
    }

    // Fallback: natural-language confirmation in content
    const content = choice?.message?.content || '';
    if (/sent|delivered|success/i.test(content)) {
      await logMessage(phone, 'outbound', message, 'sent', candidateEmail);
      return { success: true };
    }

    return { success: false, error: 'Tool call not confirmed by OpenClaw' };
  } catch (err) {
    const msg = errMsg(err);
    log.warn(`[WhatsApp] Send failed → ${phone}: ${msg}`);
    await logMessage(phone, 'outbound', message, 'failed', candidateEmail).catch(() => {});
    return { success: false, error: msg };
  }
}

// ─── Inbound logging (called by webhook handler) ─────────────────────────────

export async function recordInbound(
  phone: string,
  body: string,
  candidateEmail?: string
): Promise<void> {
  await logMessage(phone, 'inbound', body, 'received', candidateEmail);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function logMessage(
  phone: string,
  direction: 'outbound' | 'inbound',
  body: string,
  status: string,
  candidateEmail?: string
): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO whatsapp_messages (phone, direction, body, status, candidate_email)
       VALUES (?, ?, ?, ?, ?)`,
      [phone, direction, body, status, candidateEmail ?? null]
    );
  } catch (err) {
    log.warn(`[WhatsApp] DB log failed: ${errMsg(err)}`);
  }
}

export async function getConversation(phone: string, limit = 50): Promise<WAMessage[]> {
  const db = await getDb();
  return db.all<WAMessage>(
    `SELECT * FROM whatsapp_messages WHERE phone = ? ORDER BY created_at DESC LIMIT ?`,
    [phone, limit]
  );
}

export async function getRecentMessages(limit = 30): Promise<WAMessage[]> {
  const db = await getDb();
  return db.all<WAMessage>(
    `SELECT * FROM whatsapp_messages ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

// ─── Health probe ─────────────────────────────────────────────────────────────

export async function probeWhatsApp(): Promise<{ available: boolean; reason?: string }> {
  try {
    await axios.get(`${BASE_URL}/health`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      timeout: 5_000,
    });
    return { available: true };
  } catch {
    // Try chat/completions ping
    try {
      await axios.post(
        `${BASE_URL}/v1/chat/completions`,
        { model: MODEL, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}` }, timeout: 5_000 }
      );
      return { available: true };
    } catch {
      return { available: false, reason: 'OpenClaw unreachable at ' + BASE_URL };
    }
  }
}
