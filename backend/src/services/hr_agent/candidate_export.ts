import { uploadTextFileToDrive } from './drive_uploader';
import { logCandidateToSheets } from './sheets_logger';
import { logAgentActivity } from './logger';

interface ExportableCandidate {
    id?: number | string;
    first_name?: string;
    last_name?: string;
    email: string;
    phone?: string;
    location?: string;
    current_role?: string;
    years_experience?: number;
    skills?: string | string[];
    achievements?: string | string[];
    overall_score?: number;
    decision_status?: string;
    ai_reasoning?: string;
    source?: string;
    applied_role?: string;
    expected_salary?: string;
    notice_period?: string;
    communication_status?: string;
    reply_status?: string;
    interview_status?: string;
    interview_scheduled_at?: string;
    interview_meet_link?: string;
    application_content?: string;
    quick_summary?: string;
    drive_file_link?: string;
}

function parseList(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }

    if (!value) return [];

    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        }
    } catch {
        // Fall back to treating the value as plain text.
    }

    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function buildCandidateSummary(candidate: ExportableCandidate): string {
    const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Unknown Candidate';
    const skills = parseList(candidate.skills);
    const achievements = parseList(candidate.achievements);

    return [
        `Candidate: ${fullName}`,
        `Email: ${candidate.email}`,
        `Source: ${candidate.source || 'Not provided'}`,
        `Applied Role: ${candidate.applied_role || 'Not provided'}`,
        `Phone: ${candidate.phone || 'Not provided'}`,
        `Location: ${candidate.location || 'Not provided'}`,
        `Current Role: ${candidate.current_role || 'Not provided'}`,
        `Years Experience: ${candidate.years_experience ?? 0}`,
        `Expected Salary: ${candidate.expected_salary || 'Not provided'}`,
        `Notice Period: ${candidate.notice_period || 'Not provided'}`,
        `Overall Score: ${candidate.overall_score ?? 0}`,
        `Decision Status: ${candidate.decision_status || 'Unknown'}`,
        `Communication Status: ${candidate.communication_status || 'Not provided'}`,
        `Reply Status: ${candidate.reply_status || 'Not provided'}`,
        `Interview Status: ${candidate.interview_status || 'Not provided'}`,
        `Interview Scheduled At: ${candidate.interview_scheduled_at || 'Not provided'}`,
        `Interview Meet Link: ${candidate.interview_meet_link || 'Not provided'}`,
        '',
        'Application Content:',
        candidate.application_content || 'Not provided',
        '',
        'Quick Summary:',
        candidate.quick_summary || candidate.ai_reasoning || 'No summary available',
        '',
        'Skills:',
        skills.length > 0 ? skills.map(item => `- ${item}`).join('\n') : '- Not provided',
        '',
        'Achievements:',
        achievements.length > 0 ? achievements.map(item => `- ${item}`).join('\n') : '- Not provided',
        '',
        'AI / Resume Notes:',
        candidate.ai_reasoning || 'No notes available'
    ].join('\n');
}

function buildDriveFilename(candidate: ExportableCandidate): string {
    const baseName = [candidate.first_name, candidate.last_name].filter(Boolean).join('_').trim() || 'candidate';
    return `${baseName}_${candidate.id || Date.now()}_summary.txt`;
}

export async function exportCandidateRecord(candidate: ExportableCandidate): Promise<{ driveLink: string; sheetsLogged: boolean; }> {
    let driveLink = candidate.drive_file_link || '';

    if (!driveLink) {
        const summaryText = buildCandidateSummary(candidate);
        driveLink = await uploadTextFileToDrive(summaryText, buildDriveFilename(candidate));

        if (!driveLink) {
            logAgentActivity(`Unable to generate Drive record for candidate ${candidate.email}`, 'WARN');
        }
    }

    const sheetsLogged = await logCandidateToSheets({
        ...candidate,
        drive_file_link: driveLink
    });

    return {
        driveLink,
        sheetsLogged
    };
}

export const exportShortlistedCandidate = exportCandidateRecord;
