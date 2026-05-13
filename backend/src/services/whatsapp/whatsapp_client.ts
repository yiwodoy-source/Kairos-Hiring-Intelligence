import { execFile } from 'child_process';
import { promisify } from 'util';
import { log } from '../../lib/logger';
import { errMsg } from '../../lib/errMsg';
import { getDb } from '../../db';

const execFileAsync = promisify(execFile);

// WSL config — mirrors WhatsappAuto's runWslOpenClaw
const WSL_DISTRO  = process.env.OPENCLAW_WSL_DISTRO  || 'Ubuntu-22.04';
const NVM_SH      = process.env.OPENCLAW_NVM_SH       || '/home/offside/.nvm/nvm.sh';
const WA_TIMEOUT  = Number(process.env.OPENCLAW_WA_TIMEOUT_MS ?? 60_000);

export interface WASendResult {
  success: boolean;
  messageId?: string;
  stdout?: string;
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

// ─── Core WSL runner (same pattern as WhatsappAuto) ──────────────────────────

async function runWslOpenClaw(args: string[]): Promise<string> {
  const escapedArgs = args
    .map(a => `'${String(a).replace(/'/g, "'\\''")}'`)
    .join(' ');

  const script =
    `export OPENCLAW_NO_RESPAWN=1; . ${NVM_SH}; openclaw ${escapedArgs}`;

  const { stdout } = await execFileAsync(
    'wsl.exe',
    ['-d', WSL_DISTRO, '--', 'bash', '-lc', script],
    { timeout: WA_TIMEOUT, maxBuffer: 8 * 1024 * 1024 }
  );

  return stdout;
}

// ─── Send ────────────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  candidateEmail?: string
): Promise<WASendResult> {
  // Sanitise: strip outer quotes, trim
  const cleanMessage = message.replace(/^["']|["']$/g, '').trim();
  const prompt = `Send a WhatsApp message to ${phone} with this exact text: ${cleanMessage}`;

  try {
    const stdout = await runWslOpenClaw([prompt]);

    const success = /sent|delivered|success|message sent/i.test(stdout);
    const status  = success ? 'sent' : 'failed';

    await logMessage(phone, 'outbound', cleanMessage, status, candidateEmail);

    if (success) {
      log.info(`[WhatsApp] Sent to ${phone}`);
      return { success: true, stdout };
    }

    // Retry once: gateway may have needed a moment
    log.warn(`[WhatsApp] First attempt unclear, retrying — stdout: ${stdout.slice(0, 200)}`);
    const stdout2 = await runWslOpenClaw([prompt]).catch(() => '');
    const success2 = /sent|delivered|success|message sent/i.test(stdout2);
    await logMessage(phone, 'outbound', cleanMessage, success2 ? 'sent' : 'failed', candidateEmail);

    return {
      success: success2,
      stdout: stdout2,
      error: success2 ? undefined : 'OpenClaw did not confirm delivery',
    };
  } catch (err) {
    const msg = errMsg(err);
    log.warn(`[WhatsApp] Send failed → ${phone}: ${msg}`);
    await logMessage(phone, 'outbound', cleanMessage, 'failed', candidateEmail).catch(() => {});
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

// ─── Health probe — check wsl.exe + openclaw CLI reachable ──────────────────

export async function probeWhatsApp(): Promise<{ available: boolean; reason?: string }> {
  try {
    const script = `. ${NVM_SH}; openclaw --version 2>&1 || echo openclaw-ok`;
    await execFileAsync(
      'wsl.exe',
      ['-d', WSL_DISTRO, '--', 'bash', '-lc', script],
      { timeout: 10_000, maxBuffer: 64 * 1024 }
    );
    return { available: true };
  } catch (err) {
    return {
      available: false,
      reason: `WSL/OpenClaw unreachable: ${errMsg(err).slice(0, 120)}`,
    };
  }
}
