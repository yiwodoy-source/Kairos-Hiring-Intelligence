/**
 * OpenAI-compatible proxy for OpenClaw
 *
 * Configure OpenClaw to use this instead of real OpenAI:
 *   openclaw config set model.openai.baseUrl "http://localhost:3001/api/v1"
 *   openclaw config set model.openai.apiKey "kairos"
 *
 * OpenClaw sends chat/completions requests here.
 * We extract the user message + phone context, look up candidate, generate Kairos reply.
 */
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../db';
import { log } from '../lib/logger';
import { errMsg } from '../lib/errMsg';

const router = express.Router();

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// OpenClaw model discovery
router.get('/models', (_req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'kairos-hr', object: 'model', created: 1715000000, owned_by: 'kairos' },
      { id: 'gpt-4.1-mini', object: 'model', created: 1715000000, owned_by: 'kairos' },
      { id: 'gpt-4o-mini', object: 'model', created: 1715000000, owned_by: 'kairos' },
    ],
  });
});

// OpenClaw completions
router.post('/chat/completions', async (req, res) => {
  try {
    const { messages = [], stream = false } = req.body as {
      messages: { role: string; content: string }[];
      stream?: boolean;
    };

    // Extract user message (last user role)
    const userMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';

    // Try to extract phone from system message (OpenClaw includes channel context)
    const systemMsg = messages.find(m => m.role === 'system')?.content ?? '';
    const phoneMatch = systemMsg.match(/\+\d{10,15}/) ?? userMsg.match(/\+\d{10,15}/);
    const phone = phoneMatch?.[0];

    const reply = await generateKairosReply(userMsg, phone ?? null, systemMsg);

    const response = {
      id: `chatcmpl-kairos-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'kairos-hr',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: reply },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
    };

    if (stream) {
      // SSE stream format
      res.setHeader('Content-Type', 'text/event-stream');
      const chunk = {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: 'kairos-hr',
        choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } else {
      res.json(response);
    }

    log.info('[KairosProxy] served', { phone, userMsg: userMsg.slice(0, 60) });
  } catch (err: unknown) {
    log.error('[KairosProxy] error', { error: errMsg(err) });
    res.status(500).json({ error: { message: errMsg(err), type: 'server_error' } });
  }
});

async function generateKairosReply(
  userMessage: string,
  phone: string | null,
  systemContext: string
): Promise<string> {
  let candidateCtx = '';

  if (phone) {
    try {
      const db = await getDb();
      const digits = phone.replace(/\D/g, '').slice(-10);
      const c = await db.get<{
        first_name: string; last_name: string;
        decision_status: string; applied_role: string;
        interview_status: string; interview_scheduled_at: string | null;
      }>(
        `SELECT first_name, last_name, decision_status, applied_role, interview_status, interview_scheduled_at
         FROM candidates
         WHERE REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') LIKE ?
         LIMIT 1`,
        [`%${digits}`]
      );
      if (c) {
        candidateCtx = `
Candidate: ${c.first_name} ${c.last_name}
Applied for: ${c.applied_role || 'General Application'}
Status: ${c.decision_status || 'Under Review'}
Interview: ${c.interview_status || 'Not scheduled'}${
          c.interview_scheduled_at
            ? ` on ${new Date(c.interview_scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
            : ''
        }`;
      }
    } catch { /* DB lookup is best-effort */ }
  }

  if (!genAI) return buildFallback(userMessage, candidateCtx);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are Kairos HR Assistant — a professional, warm HR AI for Kairos Hiring Intelligence.
Reply to the candidate's WhatsApp message in 2-3 sentences max (under 80 words).
Only answer HR and hiring related questions. Be helpful and specific to their status.
Do NOT use markdown, asterisks, or formatting — plain text only.
${candidateCtx ? `\nCandidate context:\n${candidateCtx}` : '\nCandidate not found in database.'}

Candidate message: "${userMessage}"

Reply:`;

  try {
    const r = await model.generateContent(prompt);
    return r.response.text().trim();
  } catch {
    return buildFallback(userMessage, candidateCtx);
  }
}

function buildFallback(msg: string, ctx: string): string {
  if (ctx) {
    const nameMatch = ctx.match(/Candidate: (.+)/);
    const statusMatch = ctx.match(/Status: (.+)/);
    const name = nameMatch?.[1]?.split(' ')[0] ?? 'there';
    const status = statusMatch?.[1] ?? 'under review';
    return `Hi ${name}! Your application is currently ${status.toLowerCase()}. Our team will reach out to you shortly with updates. Thank you for your patience! 🙏`;
  }
  return "Thank you for reaching out to Kairos HR! Please share your registered email so we can look up your application status. We'll be happy to help!";
}

export default router;
