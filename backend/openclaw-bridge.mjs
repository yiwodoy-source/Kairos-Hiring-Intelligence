/**
 * OpenClaw → Kairos bridge
 * Connects to OpenClaw gateway WebSocket, listens for inbound WhatsApp
 * messages, and POSTs them to the Kairos backend inbound webhook.
 *
 * Run inside Ubuntu-22.04 WSL:
 *   node /mnt/d/nexus_HR_Ai_extracted/nexus_HR_Ai/backend/openclaw-bridge.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const GW_URL   = process.env.OPENCLAW_BASE_URL?.replace('http', 'ws') ?? 'ws://127.0.0.1:18789';
const GW_TOKEN = process.env.OPENCLAW_AUTH_TOKEN ?? 'c8484aa6656feadd4522f76c5528672f52bce3094d20add4';
const KAIROS   = process.env.KAIROS_BACKEND ?? 'http://localhost:3001';

let reconnectDelay = 3000;

function connect() {
  const ws = new WebSocket(`${GW_URL}?token=${GW_TOKEN}`);

  ws.on('open', () => {
    reconnectDelay = 3000;
    console.log(`[Bridge] Connected to OpenClaw gateway at ${GW_URL}`);
    // Subscribe to channel events
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'whatsapp' }));
  });

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Handle various OpenClaw event formats
    const isInbound =
      msg.type === 'channel_message' ||
      msg.type === 'message' ||
      msg.type === 'whatsapp_message' ||
      msg.event === 'message';

    if (!isInbound) return;

    const phone  = msg.from || msg.phone || msg.sender || msg.data?.from;
    const body   = msg.text || msg.body || msg.message || msg.data?.text || msg.data?.body;

    if (!phone || !body) return;

    // Skip outbound echos
    if (msg.direction === 'outbound' || msg.data?.direction === 'outbound') return;

    console.log(`[Bridge] Inbound from ${phone}: "${String(body).slice(0, 80)}"`);

    try {
      const res = await fetch(`${KAIROS}/api/hr-agent/whatsapp/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, body }),
      });
      const json = await res.json();
      console.log(`[Bridge] Kairos ack:`, json);
    } catch (err) {
      console.error(`[Bridge] Failed to POST to Kairos:`, err.message);
    }
  });

  ws.on('error', err => {
    console.warn(`[Bridge] WS error: ${err.message}`);
  });

  ws.on('close', () => {
    console.log(`[Bridge] Connection closed. Reconnecting in ${reconnectDelay / 1000}s…`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });
}

connect();
