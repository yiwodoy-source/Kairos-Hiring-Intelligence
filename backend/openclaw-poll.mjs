/**
 * OpenClaw → Kairos polling bridge
 * Polls `openclaw message read --channel whatsapp --json` every N seconds,
 * forwards new inbound messages to Kairos backend.
 *
 * Run inside Ubuntu-22.04 WSL:
 *   node /mnt/d/nexus_HR_Ai_extracted/nexus_HR_Ai/backend/openclaw-poll.mjs
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

const KAIROS      = process.env.KAIROS_BACKEND  ?? 'http://localhost:3001';
const INTERVAL_MS = Number(process.env.POLL_MS) || 8000;
const LIMIT       = 20;

let lastSeenId = null;
let firstRun   = true;

async function poll() {
  const args = [
    'message', 'read',
    '--channel', 'whatsapp',
    '--json',
    '--limit', String(LIMIT),
  ];
  if (lastSeenId) args.push('--after', lastSeenId);

  let stdout;
  try {
    ({ stdout } = await exec('openclaw', args, { timeout: 15000 }));
  } catch (err) {
    console.warn('[Poll] openclaw read failed:', err.message?.slice(0, 120));
    return;
  }

  let result;
  try { result = JSON.parse(stdout); } catch { return; }

  const messages = Array.isArray(result) ? result
    : Array.isArray(result?.messages) ? result.messages
    : Array.isArray(result?.data)     ? result.data
    : [];

  if (!messages.length) return;

  // Track highest id seen
  for (const m of messages) {
    const id = m.id ?? m.messageId ?? m.message_id;
    if (id && id !== lastSeenId) lastSeenId = id;
  }

  // On first run just seed lastSeenId, don't replay history
  if (firstRun) { firstRun = false; return; }

  for (const m of messages) {
    const direction = m.direction ?? m.type;
    if (direction === 'outbound' || direction === 'sent') continue;

    const phone = m.from ?? m.phone ?? m.sender ?? m.contact;
    const body  = m.text ?? m.body  ?? m.message ?? m.content;
    if (!phone || !body) continue;

    console.log(`[Poll] Inbound from ${phone}: "${String(body).slice(0, 80)}"`);

    try {
      const res  = await fetch(`${KAIROS}/api/hr-agent/whatsapp/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, body }),
      });
      const json = await res.json();
      console.log('[Poll] Kairos ack:', json);
    } catch (err) {
      console.error('[Poll] Failed to POST to Kairos:', err.message);
    }
  }
}

console.log(`[Poll] Starting — polling every ${INTERVAL_MS / 1000}s → ${KAIROS}`);
poll();
setInterval(poll, INTERVAL_MS);
