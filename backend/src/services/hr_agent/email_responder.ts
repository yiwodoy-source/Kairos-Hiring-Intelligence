import crypto from 'crypto';
import { getGmailClient } from './google_client';
import { logAgentActivity } from './logger';
import { withRetry } from '../../lib/retry';

function buildUnsubscribeToken(email: string): string {
    const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'unsubscribe-fallback-secret';
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
    const token = buildUnsubscribeToken(to);
    const backendUrl = (process.env.APP_URL || process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
    const params = new URLSearchParams({ email: to, token });
    const unsubscribeUrl = `${backendUrl}/api/hr-agent/unsubscribe?${params.toString()}`;
    return `<p style="font-size:11px;color:#bbb;text-align:center;margin-top:16px;">
      You received this email because you submitted a job application.<br>
      <a href="${unsubscribeUrl}" style="color:#aaa;">Unsubscribe from recruitment communications</a>
    </p>`;
}

function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function buildShell(title: string, accent: string, body: string, recipientEmail = ''): string {
    return `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 30px; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
    <div style="background: ${accent}; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">${title}</h1>
    </div>
    <div style="padding: 40px;">
      ${body}
      <p style="font-size: 15px; color: #777; margin-top: 40px; border-top: 1px solid #f1f1f1; padding-top: 20px; line-height: 1.7;">
        Regards,<br>
        <span style="color: #333; font-weight: 700;">Talent Acquisition Team</span><br>
        Talent Operations Console
      </p>
    </div>
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee;">
      Talent Operations Console | Recruitment Operations
      ${recipientEmail ? buildUnsubscribeFooter(recipientEmail) : ''}
    </div>
  </div>
</div>`;
}

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

        const gmail = getGmailClient();
        let subject = `Application Received - ${safeRole}`;
        let htmlBody = '';

        if (status === 'Shortlisted') {
            subject = `Next Step for Your Application - ${safeRole}`;
            htmlBody = buildShell(
                'Application Moved to Next Step',
                'linear-gradient(135deg, #6d5dfc, #3b82f6)',
                `
      <p style="font-size: 18px; margin-bottom: 20px;">Dear <strong>${safeCandidateName}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.7; color: #555;">Thank you for your application for the <strong>${safeRole}</strong> opportunity.</p>
      <p style="font-size: 16px; line-height: 1.7; color: #555;">After an initial review, we would like to move your profile forward for the next stage of evaluation.</p>
      <div style="background-color: #f0f7ff; border-left: 5px solid #3b82f6; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1f4fbf; font-weight: 700; font-size: 16px;">To help us coordinate the next step, please reply with the details below:</p>
        <ul style="margin: 14px 0 0 18px; color: #35527d; line-height: 1.8; font-size: 14px;">
          <li>Current location and preferred work location</li>
          <li>Current compensation and expected compensation</li>
          <li>Notice period or earliest joining availability</li>
          <li>Two or three interview time windows over the next few working days</li>
        </ul>
      </div>
      <p style="font-size: 16px; line-height: 1.7; color: #555;">Once we receive your response, our team will review the details and coordinate the next step accordingly.</p>`,
                safeTo
            );
        } else {
            htmlBody = buildShell(
                'Application Received',
                'linear-gradient(135deg, #00a8cc, #0f766e)',
                `
      <p style="font-size: 18px; margin-bottom: 20px;">Dear <strong>${safeCandidateName}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.7; color: #555;">Thank you for applying for the <strong>${safeRole}</strong> opportunity.</p>
      <div style="background-color: #f0fbff; border-left: 5px solid #00a8cc; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0; color: #555; line-height: 1.7;">We have received your application and recorded your profile in our recruitment workflow for review.</p>
        <p style="margin: 10px 0 0 0; color: #555; font-size: 14px; line-height: 1.7;">If your background aligns with the current requirement, our team will contact you regarding the next stage.</p>
      </div>
      <p style="font-size: 15px; line-height: 1.7; color: #555;">If any of your application details have changed recently, you are welcome to reply with updated information such as your current location, compensation expectations, notice period, or recent experience.</p>
      <ul style="color: #666; line-height: 1.8; font-size: 14px; padding-left: 20px;">
        <li>Current location and preferred work arrangement</li>
        <li>Expected compensation and notice period</li>
        <li>Recent role changes, skills, or project highlights</li>
      </ul>`,
                safeTo
            );
        }

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const message = [
            'From: me',
            `To: ${safeTo}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${utf8Subject}`,
            '',
            htmlBody,
        ].join('\n');

        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        await withRetry(
            () => gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } }),
            { label: 'gmail-send-reply', maxAttempts: 3, baseDelayMs: 1000 }
        );

        logAgentActivity(`Sent automated HTML reply to ${safeTo} (Status: ${status})`);
    } catch (error: any) {
        logAgentActivity(`Email responder failed for ${to}: ${error.message}`, 'ERROR');
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

        const gmail = getGmailClient();
        const subject = `Interview Scheduled - ${safeRole}`;
        const htmlBody = buildShell(
            'Interview Confirmed',
            'linear-gradient(135deg, #0f766e, #2563eb)',
            `
      <p style="font-size: 18px; margin-bottom: 20px;">Dear <strong>${safeCandidateName}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.7; color: #555;">Your interview for the <strong>${safeRole}</strong> opportunity has been scheduled.</p>
      <div style="background-color: #f0fbff; border-left: 5px solid #0f766e; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; color: #0f4c5c; font-weight: 700;">Interview Details</p>
        <p style="margin: 0; color: #555; line-height: 1.7;"><strong>Date & Time:</strong> ${escapeHtml(formattedTime)}</p>
        <p style="margin: 8px 0 0 0; color: #555; line-height: 1.7;"><strong>Join Link:</strong> <a href="${safeMeetLink}" target="_blank" rel="noopener noreferrer">${safeMeetLink}</a></p>
      </div>
      <p style="font-size: 15px; line-height: 1.7; color: #555;">If you need to request a change, please reply to this email at the earliest convenience.</p>`
        );

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const message = [
            'From: me',
            `To: ${safeTo}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${utf8Subject}`,
            '',
            htmlBody,
        ].join('\n');

        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        await withRetry(
            () => gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } }),
            { label: 'gmail-send-interview-confirmation', maxAttempts: 3, baseDelayMs: 1000 }
        );

        logAgentActivity(`Sent interview confirmation to ${safeTo}`);
    } catch (error: any) {
        logAgentActivity(`Interview confirmation email failed for ${to}: ${error.message}`, 'ERROR');
    }
}
