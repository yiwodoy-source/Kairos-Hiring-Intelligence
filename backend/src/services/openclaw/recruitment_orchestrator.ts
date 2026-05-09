import { runOpenClawResponse } from './client';
import { OpenClawResponseSchema, type OpenClawResponse } from '../../lib/ai-schemas';
import { log } from '../../lib/logger';

export type { OpenClawResponse };

type CandidateRecord = {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    location?: string;
    current_role?: string;
    applied_role?: string;
    expected_salary?: string;
    notice_period?: string;
    communication_status?: string;
    reply_status?: string;
    interview_status?: string;
    workflow_state?: string;
    next_action?: string;
    sourcing_stage?: string;
    source?: string;
    company?: string;
    profile_url?: string;
    overall_score?: number;
    decision_status?: string;
    application_content?: string;
    quick_summary?: string;
    ai_reasoning?: string;
    skills?: string;
    created_at?: string;
};

type JobRecord = {
    id: number;
    title: string;
    department: string;
    location: string;
    type: string;
    description: string;
    requirements?: string;
};

function safeJsonList(raw?: string): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return raw.split(',').map(item => item.trim()).filter(Boolean);
    }
}

function buildCandidateBrief(candidate: CandidateRecord, job?: JobRecord | null): string {
    const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim();
    const skills = safeJsonList(candidate.skills).slice(0, 6).join(', ') || 'Not captured';
    const requirements = safeJsonList(job?.requirements).slice(0, 6).join(', ') || 'Not captured';
    const summary = (candidate.quick_summary || candidate.ai_reasoning || candidate.application_content || 'Not captured')
        .replace(/\s+/g, ' ')
        .slice(0, 140);

    return [
        `candidate=${fullName || 'Unknown'}`,
        `source=${candidate.source || 'Not captured'}`,
        `role=${candidate.applied_role || candidate.current_role || 'Not captured'}`,
        `stage=${candidate.workflow_state || candidate.sourcing_stage || candidate.decision_status || 'Not captured'}`,
        `score=${candidate.overall_score ?? 0}`,
        `skills=${skills}`,
        `summary=${summary}`,
        `job=${job?.title || 'No linked job'}`,
        `requirements=${requirements}`,
        `location=${job?.location || candidate.location || 'Not captured'}`
    ].join('\n');
}

function buildSystemPrompt(): string {
    return [
        'You are a cautious recruiter.',
        'Decide the next step using only the provided facts.',
        'Prefer "Review Required" when uncertain.',
        'Return JSON only with short values.',
        'Schema:',
        '{"workflow_state":"string","next_action":"string","recommended_decision_status":"Applied|Review Required|Shortlisted|Rejected|Interview|Offer","recommended_sourcing_stage":"Discovered|Contacted|Engaged|Qualified","screening_notes":["max 2 short strings"],"risk_flags":["max 2 short strings"]}'
    ].join('\n');
}

export interface OrchestrationResult {
    parsed: OpenClawResponse;
    text: string;
    raw: unknown;
}

export async function runCandidateWorkflowWithOpenClaw(
    candidate: CandidateRecord,
    job?: JobRecord | null
): Promise<OrchestrationResult> {
    const candidateBrief = buildCandidateBrief(candidate, job);
    const userPrompt = [
        'Decide the next recruiting step for this candidate.',
        'If evidence is incomplete, use Review Required.',
        candidateBrief,
    ].join('\n');

    const result = await runOpenClawResponse(
        [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: userPrompt },
        ],
        { workflow: 'candidate-orchestration', candidateId: String(candidate.id) }
    );

    // Extract JSON from the response text and validate with Zod schema.
    // .catch() defaults mean a partial response still produces a usable decision.
    let parsed: OpenClawResponse;
    try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : result.text;
        parsed = OpenClawResponseSchema.parse(JSON.parse(jsonStr));
    } catch (err: any) {
        log.warn('openclaw response parse failed, using safe defaults', {
            candidateId: candidate.id,
            error: err.message,
            raw: result.text?.slice(0, 200),
        });
        parsed = OpenClawResponseSchema.parse({});
    }

    return { parsed, text: result.text, raw: result.raw };
}
