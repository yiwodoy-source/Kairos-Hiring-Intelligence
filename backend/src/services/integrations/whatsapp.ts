type WhatsAppStatus = {
    enabled: boolean;
    provider: string;
    from: string;
    requireOptIn: boolean;
    autoAcknowledge: boolean;
    configured: boolean;
};

const provider = (process.env.WHATSAPP_PROVIDER || 'twilio').trim().toLowerCase();
const enabled = (process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';
const requireOptIn = (process.env.WHATSAPP_REQUIRE_OPT_IN || 'true').toLowerCase() !== 'false';
const autoAcknowledge = (process.env.WHATSAPP_AUTO_ACKNOWLEDGE || 'false').toLowerCase() === 'true';
const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';
const fromNumber = process.env.TWILIO_WHATSAPP_FROM || '';
const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '+91';

function ensureTwilioConfigured(): void {
    if (!enabled) {
        throw new Error('WhatsApp integration is disabled');
    }

    if (provider !== 'twilio') {
        throw new Error(`Unsupported WhatsApp provider: ${provider}`);
    }

    if (!accountSid || !authToken || !fromNumber) {
        throw new Error('Twilio WhatsApp credentials are not configured');
    }
}

function stripPhone(value: string): string {
    return value.replace(/[^\d+]/g, '');
}

export function normalizeWhatsAppNumber(value: string): string {
    const trimmed = stripPhone(String(value || '').trim());
    if (!trimmed) {
        throw new Error('Phone number is required');
    }

    if (trimmed.startsWith('whatsapp:')) {
        return trimmed;
    }

    if (trimmed.startsWith('+')) {
        return `whatsapp:${trimmed}`;
    }

    if (trimmed.startsWith('00')) {
        return `whatsapp:+${trimmed.slice(2)}`;
    }

    if (/^\d{10}$/.test(trimmed)) {
        return `whatsapp:${defaultCountryCode}${trimmed}`;
    }

    return `whatsapp:+${trimmed}`;
}

export function getWhatsAppStatus(): WhatsAppStatus {
    return {
        enabled,
        provider,
        from: fromNumber,
        requireOptIn,
        autoAcknowledge,
        configured: Boolean(enabled && provider === 'twilio' && accountSid && authToken && fromNumber)
    };
}

export async function probeWhatsApp(): Promise<{ ok: boolean; detail: string }> {
    if (!enabled) {
        return { ok: false, detail: 'WhatsApp integration disabled' };
    }

    if (provider !== 'twilio') {
        return { ok: false, detail: `Unsupported provider: ${provider}` };
    }

    if (!accountSid || !authToken || !fromNumber) {
        return { ok: false, detail: 'Missing Twilio WhatsApp credentials' };
    }

    try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
            method: 'GET',
            headers: {
                Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
            }
        });

        if (!response.ok) {
            const text = await response.text();
            return { ok: false, detail: `Twilio probe failed: ${response.status} ${text}` };
        }

        return { ok: true, detail: 'Twilio WhatsApp credentials verified' };
    } catch (error: any) {
        return { ok: false, detail: error.message || 'Twilio probe failed' };
    }
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<{ sid: string; status: string }> {
    ensureTwilioConfigured();

    const toAddress = normalizeWhatsAppNumber(to);
    const fromAddress = normalizeWhatsAppNumber(fromNumber.replace(/^whatsapp:/, ''));
    const payload = new URLSearchParams({
        To: toAddress,
        From: fromAddress,
        Body: body
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || `Twilio WhatsApp send failed with status ${response.status}`);
    }

    return {
        sid: data.sid || '',
        status: data.status || 'queued'
    };
}

export function buildCandidateWhatsAppMessage(candidateName: string, role: string, decisionStatus: string): string {
    const safeName = (candidateName || 'Candidate').trim();
    const safeRole = (role || 'the role').trim();

    if (decisionStatus === 'Shortlisted') {
        return [
            `Hello ${safeName},`,
            '',
            `Thank you for your interest in the ${safeRole} opportunity.`,
            'Your profile has moved to the next stage of review.',
            '',
            'Please reply with the following details:',
            '- Current location',
            '- Current and expected compensation',
            '- Notice period / joining availability',
            '- Two or three preferred interview slots',
            '',
            'Regards,',
            'Talent Acquisition Team'
        ].join('\n');
    }

    return [
        `Hello ${safeName},`,
        '',
        `Thank you for applying for the ${safeRole} opportunity.`,
        'We have received your profile and our team will review it against the current requirement.',
        '',
        'If there are any updates to your location, notice period, compensation expectations, or recent experience, you may reply here.',
        '',
        'Regards,',
        'Talent Acquisition Team'
    ].join('\n');
}
