import { z } from 'zod';

// CV analysis schema — validates responses from OpenRouter, Gemini, and keyword fallback.
// All fields use .catch() so a partial/malformed AI response still returns a usable object
// rather than throwing and dropping the candidate entirely.
export const CvAnalysisSchema = z.object({
    analysis_meta: z.object({
        source: z.string().optional(),
        confidence: z.enum(['high', 'medium', 'low']).optional(),
    }).optional(),
    candidate: z.object({
        first_name: z.string().min(1).max(100).catch('Unknown'),
        last_name: z.string().max(100).catch(''),
        email: z.string().email().max(320).catch('missing@example.com'),
        location: z.string().max(200).catch('Unknown'),
        phone: z.string().max(50).catch(''),
    }),
    summary: z.object({
        years_experience: z.number().min(0).max(60).catch(0),
        current_role: z.string().max(200).catch('Unknown'),
        technical_skills: z.array(z.string()).max(30).catch([]),
        key_achievements: z.array(z.string()).max(10).catch([]),
    }),
    fit_score: z.object({
        overall: z.number().min(0).max(100).catch(50),
        breakdown: z.object({
            experience: z.number().min(0).max(100).catch(50),
            technical_skills: z.number().min(0).max(100).catch(50),
            achievements: z.number().min(0).max(100).catch(50),
            education: z.number().min(0).max(100).catch(50),
        }).catch({ experience: 50, technical_skills: 50, achievements: 50, education: 50 }),
        reasoning: z.array(z.string()).max(10).catch([]),
    }),
});

export type CvAnalysis = z.infer<typeof CvAnalysisSchema>;

// OpenClaw orchestrator response schema — validates workflow decisions.
export const OpenClawResponseSchema = z.object({
    workflow_state: z.string().max(200).catch('Review Required'),
    next_action: z.string().max(500).catch('Recruiter review required'),
    recommended_decision_status: z
        .enum(['Applied', 'Review Required', 'Shortlisted', 'Rejected', 'Interview', 'Offer'])
        .catch('Review Required'),
    recommended_sourcing_stage: z
        .enum(['Discovered', 'Contacted', 'Engaged', 'Qualified'])
        .catch('Discovered'),
    screening_notes: z.array(z.string()).max(5).catch([]),
    risk_flags: z.array(z.string()).max(5).catch([]),
});

export type OpenClawResponse = z.infer<typeof OpenClawResponseSchema>;
