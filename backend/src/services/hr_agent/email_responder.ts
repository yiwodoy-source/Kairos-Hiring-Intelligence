import crypto from 'crypto';
import { createSMTPTransporter, loadGmailCredentials } from './smtp_client';
import { logAgentActivity } from './logger';
import { withRetry } from '../../lib/retry';
import { errMsg } from '../../lib/errMsg';

function buildUnsubscribeToken(email: string): string {
    const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET;
    if (!secret) throw new Error('JWT_SECRET or UNSUBSCRIBE_SECRET must be configured');
    return crypto.createHmac('sha256', secret).update(email.toLowerCase().trim()).digest('hex');
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
    const expected = buildUnsubscribeToken(email);
    try {
        return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
    } catch {
        return false;
    }
}

function buildUnsubscribeFooter(to: string): string {
    try {
        const token = buildUnsubscribeToken(to);
        const backendUrl = (process.env.APP_URL || process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
        const params = new URLSearchParams({ email: to, token });
        const unsubscribeUrl = `${backendUrl}/api/hr-agent/unsubscribe?${params.toString()}`;
        return `<a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from recruitment communications`;
    } catch {
        return '';
    }
}

function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ---------------------------------------------------------------------------
// Modern email shell — matches the polished design standard
// ---------------------------------------------------------------------------
function buildShell(accentColor: string, body: string, recipientEmail = ''): string {
    const companyName = process.env.COMPANY_NAME || 'K. Girdharlal International';
    const senderName = process.env.HR_SENDER_NAME || 'The Hiring Team';
    const careersUrl = process.env.CAREERS_URL || '';
    const linkedInUrl = process.env.LINKEDIN_URL || '';

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e8ecef;">

      <!-- Accent bar -->
      <div style="height:8px;background:${accentColor};"></div>

      <!-- Body -->
      <div style="padding:40px 40px 32px 40px;color:#333;font-size:16px;line-height:1.7;">
        ${body}

        <!-- Signature -->
        <p style="margin-top:36px;margin-bottom:0;">Thank you again for your time and interest.</p>
        <p style="margin-top:24px;margin-bottom:0;">With appreciation,</p>
        <p style="margin:4px 0 0 0;"><strong>${senderName}</strong><br>${companyName}</p>
      </div>

      <!-- Footer -->
      <div style="background-color:#f8fafb;padding:20px 40px;text-align:center;font-size:12px;color:#999;border-top:1px solid #eef1f3;">
        ${companyName} | Building the Future of Work
        ${recipientEmail ? `<br style="margin-top:8px;">${buildUnsubscribeFooter(recipientEmail)}` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function buildReceivedEmail(name: string, role: string, company: string): string {
    return `
<p>Dear ${name},</p>
<p>Thank you for taking the time to apply for <strong>${role}</strong> at ${company} and for your interest in joining our team.</p>
<p>We have received your application and our hiring team is currently reviewing it. We carefully evaluate every candidate to ensure the best fit for both sides.</p>
<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;margin:24px 0;border-radius:4px;">
  <p style="margin:0;color:#15803d;font-weight:600;">What happens next?</p>
  <ul style="margin:8px 0 0 0;padding-left:20px;color:#555;">
    <li>Our team will review your qualifications within <strong>3-5 business days</strong></li>
    <li>If your profile matches our requirements, we will reach out to schedule an interview</li>
    <li>You will receive an update on your application status either way</li>
  </ul>
</div>
<p>We genuinely appreciate your interest in ${company}, and we encourage you to:</p>
<ul style="color:#555;padding-left:20px;">
  <li>Keep an eye on your inbox for updates from us</li>
  ${process.env.CAREERS_URL ? `<li>Browse other openings on our <a href="${escapeHtml(process.env.CAREERS_URL)}" style="color:#3b82f6;font-weight:600;">careers page</a></li>` : ''}
  ${process.env.LINKEDIN_URL ? `<li>Connect with us on <a href="${escapeHtml(process.env.LINKEDIN_URL)}" style="color:#3b82f6;font-weight:600;">LinkedIn</a> to stay updated</li>` : ''}
</ul>`;
}

function buildShortlistedEmail(name: string, role: string, company: string, calendlyUrl: string): string {
    const calendlyBlock = calendlyUrl
        ? `<p>Please pick a time that works best for you using our scheduling link:<br>
           <a href="${escapeHtml(calendlyUrl)}" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#3b82f6;color:#fff;font-weight:700;border-radius:8px;text-decoration:none;">Schedule Your Interview</a></p>`
        : `<p>Our team will reach out shortly to schedule a convenient time for the interview.</p>`;

    return `
<p>Dear ${name},</p>
<p>Thank you for taking the time to apply for <strong>${role}</strong> at ${company} and for your interest in joining our team.</p>
<p>We carefully reviewed your application and are impressed with your background and experience.</p>
<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 20px;margin:24px 0;border-radius:4px;">
  <p style="margin:0;color:#1d4ed8;font-weight:700;font-size:17px;">You've been shortlisted!</p>
  <p style="margin:8px 0 0 0;color:#555;">We would love to invite you to a brief introductory interview to learn more about your experience and discuss how you could contribute to our team.</p>
</div>
${calendlyBlock}
<p>Here is what to expect:</p>
<ul style="color:#555;padding-left:20px;">
  <li>A <strong>30-minute</strong> introductory conversation with our hiring team</li>
  <li>Discussion about the role, your experience, and mutual fit</li>
  <li>Opportunity to ask questions about the team and company culture</li>
</ul>
<p>We are looking forward to speaking with you!</p>`;
}

function buildRejectedEmail(name: string, role: string, company: string): string {
    return `
<p>Dear ${name},</p>
<p>Thank you for taking the time to apply for <strong>${role}</strong> at ${company} and for your interest in joining our team.</p>
<p>We carefully reviewed your application and appreciate the opportunity to learn about your background and experience.</p>
<div style="background:#f8fafc;border-left:4px solid #94a3b8;padding:16px 20px;margin:24px 0;border-radius:4px;">
  <p style="margin:0;color:#334155;font-weight:600;">After careful consideration, we've decided not to move forward with your application at this time.</p>
  <p style="margin:8px 0 0 0;color:#555;">This decision is not a reflection of your abilities or potential. We received many strong applications, and the selection process was highly competitive.</p>
</div>
<p>We genuinely appreciate your interest in ${company}, and we encourage you to:</p>
<ul style="color:#555;padding-left:20px;">
  <li>Apply for future opportunities that match your skills</li>
  ${process.env.CAREERS_URL ? `<li>Keep an eye on our <a href="${escapeHtml(process.env.CAREERS_URL)}" style="color:#3b82f6;font-weight:600;">careers page</a> for new openings</li>` : ''}
  ${process.env.LINKEDIN_URL ? `<li>Connect with us on <a href="${escapeHtml(process.env.LINKEDIN_URL)}" style="color:#3b82f6;font-weight:600;">LinkedIn</a> to stay updated</li>` : ''}
  <li>Continue developing your skills and expertise</li>
</ul>
<p>We wish you the very best in your career journey and hope our paths may cross again in the future. Your professional growth matters, and we hope you find an opportunity that aligns perfectly with your goals.</p>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendAutomatedReply(
    to: string,
    candidateName: string,
    status: string,
    role: string = 'Position Applied'
): Promise<void> {
    try {
        if (!to || !candidateName || !status) {
            throw new Error('Missing required parameters');
        }

        const safeTo = to.trim().substring(0, 320);
        const safeCandidateName = escapeHtml(candidateName.trim().substring(0, 200));
        const safeRole = escapeHtml(role.trim().substring(0, 200));

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(safeTo)) {
            throw new Error('Invalid email address');
        }

        const companyName = process.env.COMPANY_NAME || 'K. Girdharlal International';
        const calendlyUrl = process.env.CALENDLY_URL || process.env.INTERVIEW_CALENDAR_URL || '';

        let subject: string;
        let innerBody: string;
        let accent: string;

        if (status === 'Shortlisted') {
            subject = `Interview Invitation — ${safeRole} at ${companyName}`;
            accent = 'linear-gradient(135deg, #3b82f6, #6366f1)';
            innerBody = buildShortlistedEmail(safeCandidateName, safeRole, companyName, calendlyUrl);
        } else if (status === 'Rejected') {
            subject = `Your Application for ${safeRole} at ${companyName}`;
            accent = 'linear-gradient(135deg, #64748b, #475569)';
            innerBody = buildRejectedEmail(safeCandidateName, safeRole, companyName);
        } else {
            subject = `Application Received — ${safeRole} at ${companyName}`;
            accent = 'linear-gradient(135deg, #00a8cc, #0f766e)';
            innerBody = buildReceivedEmail(safeCandidateName, safeRole, companyName);
        }

        const htmlBody = buildShell(accent, innerBody, safeTo);

        const creds = await loadGmailCredentials();
        const fromAddress = creds?.user || 'noreply@nexushr.ai';

        const transporter = await createSMTPTransporter();
        await withRetry(
            () => transporter.sendMail({
                from: `"${companyName} Hiring" <${fromAddress}>`,
                to: safeTo,
                subject,
                html: htmlBody,
            }),
            { label: 'smtp-send-reply', maxAttempts: 3, baseDelayMs: 1000 }
        );

        logAgentActivity(`Sent automated reply to ${safeTo} (Status: ${status})`);
    } catch (error: unknown) {
        logAgentActivity(`Email responder failed for ${to}: ${errMsg(error)}`, 'ERROR');
    }
}

export async function sendInterviewConfirmation(
    to: string,
    candidateName: string,
    role: string,
    startTime: string,
    meetLink: string
): Promise<void> {
    try {
        const safeTo = to.trim().substring(0, 320);
        const safeCandidateName = escapeHtml(candidateName.trim().substring(0, 200));
        const safeRole = escapeHtml(role.trim().substring(0, 200));
        const safeMeetLink = escapeHtml(meetLink.trim());
        const scheduleDate = new Date(startTime);
        const formattedTime = scheduleDate.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: process.env.INTERVIEW_TIMEZONE || 'Asia/Kolkata'
        });

        const companyName = process.env.COMPANY_NAME || 'K. Girdharlal International';

        const innerBody = `
<p>Dear ${safeCandidateName},</p>
<p>Your interview for the <strong>${safeRole}</strong> opportunity at ${companyName} has been confirmed.</p>
<div style="background:#f0fbff;border-left:4px solid #0f766e;padding:20px;margin:24px 0;border-radius:4px;">
  <p style="margin:0 0 8px 0;color:#0f4c5c;font-weight:700;">Interview Details</p>
  <p style="margin:0;color:#555;line-height:1.7;"><strong>Date &amp; Time:</strong> ${escapeHtml(formattedTime)}</p>
  <p style="margin:8px 0 0 0;color:#555;line-height:1.7;"><strong>Join Link:</strong> <a href="${safeMeetLink}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;font-weight:600;">${safeMeetLink}</a></p>
</div>
<p>Here are a few tips to prepare:</p>
<ul style="color:#555;padding-left:20px;">
  <li>Test your camera and microphone before the call</li>
  <li>Have a copy of your resume handy for reference</li>
  <li>Prepare questions about the role and team</li>
</ul>
<p>If you need to request a change, please reply to this email at the earliest convenience.</p>
<p>We are looking forward to meeting you!</p>`;

        const htmlBody = buildShell(
            'linear-gradient(135deg, #0f766e, #2563eb)',
            innerBody,
            safeTo
        );

        const creds = await loadGmailCredentials();
        const fromAddress = creds?.user || 'noreply@nexushr.ai';

        const transporter = await createSMTPTransporter();
        await withRetry(
            () => transporter.sendMail({
                from: `"${companyName} Hiring" <${fromAddress}>`,
                to: safeTo,
                subject: `Interview Scheduled — ${safeRole} at ${companyName}`,
                html: htmlBody,
            }),
            { label: 'smtp-send-interview-confirmation', maxAttempts: 3, baseDelayMs: 1000 }
        );

        logAgentActivity(`Sent interview confirmation to ${safeTo}`);
    } catch (error: unknown) {
        logAgentActivity(`Interview confirmation failed for ${to}: ${errMsg(error)}`, 'ERROR');
    }
}
