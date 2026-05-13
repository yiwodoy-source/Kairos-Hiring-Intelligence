import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../../db';
import { sendWhatsAppMessage } from './whatsapp_client';
import { log } from '../../lib/logger';
import { errMsg } from '../../lib/errMsg';

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

export interface AutoReplySettings {
  enabled: boolean;
  candidateOnly: boolean;
  mode: 'immediate' | 'draft';
  customPrompt: string;
}

export interface AutoReplyResult {
  replied: boolean;
  draft?: string;
  candidateName?: string;
  candidateStatus?: string;
  reason?: string;
}

export async function getAutoReplySettings(): Promise<AutoReplySettings> {
  try {
    const db = await getDb();
    const row = await db.get<{
      enabled: number;
      candidate_only: number;
      mode: string;
      custom_prompt: string;
    }>(`SELECT enabled, candidate_only, mode, custom_prompt FROM wa_auto_reply_settings WHERE id = 1`);
    if (!row) return { enabled: false, candidateOnly: true, mode: 'immediate', customPrompt: '' };
    return {
      enabled: Boolean(row.enabled),
      candidateOnly: Boolean(row.candidate_only),
      mode: (row.mode as 'immediate' | 'draft') || 'immediate',
      customPrompt: row.custom_prompt || '',
    };
  } catch {
    return { enabled: false, candidateOnly: true, mode: 'immediate', customPrompt: '' };
  }
}

export async function saveAutoReplySettings(settings: Partial<AutoReplySettings>): Promise<void> {
  const db = await getDb();
  const current = await getAutoReplySettings();
  const merged = { ...current, ...settings };
  await db.run(
    `INSERT INTO wa_auto_reply_settings (id, enabled, candidate_only, mode, custom_prompt, updated_at)
     VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       enabled       = excluded.enabled,
       candidate_only = excluded.candidate_only,
       mode          = excluded.mode,
       custom_prompt = excluded.custom_prompt,
       updated_at    = excluded.updated_at`,
    [merged.enabled ? 1 : 0, merged.candidateOnly ? 1 : 0, merged.mode, merged.customPrompt]
  );
}

export async function handleInboundAutoReply(
  phone: string,
  body: string
): Promise<AutoReplyResult> {
  const settings = await getAutoReplySettings();
  if (!settings.enabled) return { replied: false, reason: 'auto-reply disabled' };

  const db = await getDb();
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);

  const candidate = await db.get<{
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    decision_status: string;
    applied_role: string;
    communication_status: string;
    interview_status: string;
    interview_scheduled_at: string | null;
    overall_score: number | null;
  }>(
    `SELECT id, first_name, last_name, email, decision_status, applied_role,
            communication_status, interview_status, interview_scheduled_at, overall_score
     FROM candidates
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', '') LIKE ?
     LIMIT 1`,
    [`%${last10}`]
  );

  if (!candidate && settings.candidateOnly) {
    return { replied: false, reason: 'not a registered candidate' };
  }

  const reply = await generateReply(body, candidate, settings.customPrompt);

  if (settings.mode === 'draft') {
    return {
      replied: false,
      draft: reply,
      candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}` : undefined,
      candidateStatus: candidate?.decision_status,
    };
  }

  const result = await sendWhatsAppMessage(phone, reply, candidate?.email);
  log.info('[AutoReply] sent', { phone, success: result.success });

  return {
    replied: result.success,
    candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}` : undefined,
    candidateStatus: candidate?.decision_status,
    reason: result.error,
  };
}

async function generateReply(
  inboundMessage: string,
  candidate: any,
  customPrompt: string
): Promise<string> {
  if (!genAI) return buildFallback(candidate);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const ctx = candidate
    ? `Candidate name: ${candidate.first_name} ${candidate.last_name}
Applied role: ${candidate.applied_role || 'General Application'}
Current pipeline status: ${candidate.decision_status || 'Under Review'}
Communication status: ${candidate.communication_status || 'Pending'}
Interview status: ${candidate.interview_status || 'Not scheduled'}${
        candidate.interview_scheduled_at
          ? `\nInterview scheduled at: ${new Date(candidate.interview_scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
          : ''
      }`
    : 'Contact not found in candidate database.';

  const prompt = `You are a professional HR assistant for Kairos Hiring Intelligence.
A person has messaged you on WhatsApp. Reply professionally in 2-3 short sentences max.
Be warm, helpful, and relevant to their hiring status.
${customPrompt ? `Additional instructions: ${customPrompt}\n` : ''}
Candidate context:
${ctx}

Their message: "${inboundMessage}"

Reply (plain text only, no markdown, conversational, max 80 words):`;

  try {
    const r = await model.generateContent(prompt);
    return r.response.text().trim();
  } catch (err) {
    log.warn('[AutoReply] Gemini error, using fallback', { error: errMsg(err) });
    return buildFallback(candidate);
  }
}

function buildFallback(candidate: any): string {
  if (!candidate) {
    return "Thank you for reaching out to Kairos HR. Please send your CV to our careers email for consideration. We'll be in touch soon!";
  }
  const name = candidate.first_name || 'there';
  const role = candidate.applied_role || 'the position';
  const status = candidate.decision_status || 'Under Review';

  if (status === 'Shortlisted') {
    return `Hi ${name}! Great news — you've been shortlisted for ${role}. Our team will reach out shortly to schedule the next step. Stay tuned! 🎉`;
  }
  if (status === 'Rejected') {
    return `Hi ${name}, thank you for your interest in ${role}. We've reviewed your application and will keep your profile on file for future opportunities.`;
  }
  if (candidate.interview_status === 'Scheduled') {
    return `Hi ${name}! Your interview for ${role} is confirmed. Please check your email for the meeting details and let us know if you need to reschedule.`;
  }
  return `Hi ${name}! Thank you for reaching out. Your application for ${role} is currently under review. We'll update you as soon as there's a decision. 🙏`;
}
