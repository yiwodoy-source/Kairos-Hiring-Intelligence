export type DecisionStatus = 'Shortlisted' | 'Review Required' | 'Rejected';

type OpenJob = {
    id: number;
    title: string;
    location: string;
    description?: string;
    requirements?: string;
    status?: string;
};

type CandidateAnalysis = {
    candidate: {
        first_name: string;
        last_name: string;
        email: string;
        location?: string;
        phone?: string;
    };
    summary: {
        years_experience?: number;
        current_role?: string;
        technical_skills?: string[];
        key_achievements?: string[];
    };
    fit_score?: {
        overall?: number;
        breakdown?: Record<string, number>;
        reasoning?: string[] | string;
    };
    analysis_meta?: {
        source?: string;
        confidence?: string;
    };
};

export type CandidateAssessment = {
    matchedJobId: number | null;
    matchedJobTitle: string | null;
    inferredTargetRole: string;
    status: DecisionStatus;
    overallScore: number;
    breakdown: {
        role_alignment: number;
        required_skills: number;
        experience_fit: number;
        location_fit: number;
        evidence_quality: number;
    };
    requiredSkills: string[];
    matchedSkills: string[];
    hardFlags: string[];
    reasons: string[];
    analysisSource: string;
    confidence: 'high' | 'medium' | 'low';
};

function parseStringArray(value?: string | null): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        }
    } catch {
        // fall through
    }

    return value.split(',').map(item => item.trim()).filter(Boolean);
}

function normalizeText(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s+/&-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
    return normalizeText(value).split(/\s+/).filter(Boolean);
}

function titleCase(value: string): string {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map(token => {
            const cleaned = token.trim();
            if (/^(and|or|for|of|to)$/i.test(cleaned)) return cleaned.toLowerCase();
            if (/^[a-z]{2,5}$/i.test(cleaned) && cleaned.length <= 4) return cleaned.toUpperCase();
            return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        })
        .join(' ');
}

function extractRoleFromText(value: string): string {
    const match = value.match(/apply(?:ing)? for\s+(?:the\s+)?([a-z0-9\s/&-]{3,80}?)(?:\s+role|\s+position|[.!,$]|$)/i);
    if (!match?.[1]) return '';
    return titleCase(match[1].replace(/\band\b/g, 'and'));
}

function inferTargetRole(applicationContent: string, subject: string, currentRole: string): string {
    const fromContent = extractRoleFromText(applicationContent);
    if (fromContent) return fromContent;

    const subjectRole = extractRoleFromText(subject);
    if (subjectRole) return subjectRole;

    const cleanSubject = subject.replace(/job application|application|resume|cv|candidate/gi, '').trim();
    if (cleanSubject.length >= 3 && cleanSubject.length <= 60) {
        return titleCase(cleanSubject);
    }

    return currentRole || 'General Application';
}

function buildJobTokens(job: OpenJob): string[] {
    return [
        ...tokenize(job.title || ''),
        ...tokenize(job.location || ''),
        ...tokenize(job.description || ''),
        ...parseStringArray(job.requirements).flatMap(tokenize)
    ];
}

function inferMinimumExperience(job: OpenJob): number {
    const text = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`;
    const match = text.match(/(\d+)\+?\s*(?:years|yrs)/i);
    return match ? Number(match[1]) : 0;
}

function scoreJobMatch(job: OpenJob, roleText: string, candidateSkills: string[]): number {
    const roleTokens = tokenize(roleText);
    const titleTokens = tokenize(job.title || '');
    const jobTokens = buildJobTokens(job);

    let score = 0;
    for (const token of roleTokens) {
        if (titleTokens.includes(token)) score += 18;
        else if (jobTokens.includes(token)) score += 6;
    }

    for (const skill of candidateSkills) {
        const normalizedSkill = normalizeText(skill);
        if (normalizedSkill && jobTokens.some(token => normalizedSkill.includes(token) || token.includes(normalizedSkill))) {
            score += 4;
        }
    }

    return Math.min(100, score);
}

function matchOpenJob(jobs: OpenJob[], inferredRole: string, candidateSkills: string[]): OpenJob | null {
    const openJobs = jobs.filter(job => (job.status || 'Open') === 'Open');
    let best: { job: OpenJob; score: number } | null = null;

    for (const job of openJobs) {
        const score = scoreJobMatch(job, inferredRole, candidateSkills);
        if (!best || score > best.score) {
            best = { job, score };
        }
    }

    return best && best.score >= 18 ? best.job : null;
}

function computeRoleAlignment(inferredRole: string, currentRole: string, matchedJob: OpenJob | null): number {
    if (!matchedJob) return 0;
    const reference = normalizeText(`${inferredRole} ${currentRole}`);
    const titleTokens = tokenize(matchedJob.title || '');
    if (!titleTokens.length) return 0;

    const matched = titleTokens.filter(token => reference.includes(token)).length;
    return Math.min(100, Math.round((matched / titleTokens.length) * 100));
}

function computeRequiredSkillScore(requiredSkills: string[], candidateSkills: string[]): { score: number; matched: string[] } {
    if (requiredSkills.length === 0) {
        return { score: 65, matched: [] };
    }

    const normalizedCandidateSkills = candidateSkills.map(normalizeText);
    const matched = requiredSkills.filter(skill => {
        const normalizedSkill = normalizeText(skill);
        return normalizedCandidateSkills.some(candidateSkill => candidateSkill.includes(normalizedSkill) || normalizedSkill.includes(candidateSkill));
    });

    return {
        score: Math.round((matched.length / requiredSkills.length) * 100),
        matched
    };
}

function computeExperienceFit(yearsExperience: number, matchedJob: OpenJob | null): number {
    if (!matchedJob) return 50;
    const minimum = inferMinimumExperience(matchedJob);
    if (minimum <= 0) return 65;
    if (yearsExperience >= minimum) return 90;
    const ratio = yearsExperience / minimum;
    return Math.max(20, Math.round(ratio * 90));
}

function computeLocationFit(candidateLocation: string, matchedJob: OpenJob | null): number {
    if (!matchedJob) return 50;
    const jobLocation = normalizeText(matchedJob.location || '');
    const candidate = normalizeText(candidateLocation || '');
    if (!jobLocation || jobLocation.includes('remote')) return 85;
    if (!candidate) return 40;
    if (candidate.includes(jobLocation) || jobLocation.includes(candidate)) return 90;
    return 35;
}

function computeEvidenceQuality(analysisSource: string): { score: number; confidence: 'high' | 'medium' | 'low' } {
    if (analysisSource === 'openrouter') return { score: 90, confidence: 'high' };
    if (analysisSource === 'gemini') return { score: 78, confidence: 'medium' };
    return { score: 45, confidence: 'low' };
}

export function assessCandidateAgainstJobs(
    analysis: CandidateAnalysis,
    jobs: OpenJob[],
    context: { subject?: string; applicationContent?: string }
): CandidateAssessment {
    const candidateSkills = Array.isArray(analysis.summary?.technical_skills)
        ? analysis.summary.technical_skills.filter(Boolean)
        : [];
    const inferredRole = inferTargetRole(
        context.applicationContent || '',
        context.subject || '',
        analysis.summary?.current_role || ''
    );
    const matchedJob = matchOpenJob(jobs, inferredRole, candidateSkills);
    const requiredSkills = matchedJob ? parseStringArray(matchedJob.requirements) : [];
    const roleAlignment = computeRoleAlignment(inferredRole, analysis.summary?.current_role || '', matchedJob);
    const requiredSkillScore = computeRequiredSkillScore(requiredSkills, candidateSkills);
    const experienceFit = computeExperienceFit(Number(analysis.summary?.years_experience || 0), matchedJob);
    const locationFit = computeLocationFit(analysis.candidate?.location || '', matchedJob);
    const analysisSource = analysis.analysis_meta?.source || 'unknown';
    const evidenceQuality = computeEvidenceQuality(analysisSource);

    const weightedOverall = Math.round(
        roleAlignment * 0.25 +
        requiredSkillScore.score * 0.30 +
        experienceFit * 0.20 +
        locationFit * 0.10 +
        evidenceQuality.score * 0.15
    );

    const hardFlags: string[] = [];
    const reasons: string[] = [];

    if (!matchedJob) {
        hardFlags.push('No open job was matched confidently to the application.');
        reasons.push(`The application could not be confidently aligned to an active job opening using the inferred role "${inferredRole}".`);
    } else {
        reasons.push(`Matched candidate to active role "${matchedJob.title}" for requirement-based assessment.`);
    }

    if (requiredSkills.length > 0) {
        reasons.push(`Matched ${requiredSkillScore.matched.length} of ${requiredSkills.length} required skills.`);
        if (requiredSkillScore.score < 25) {
            hardFlags.push('Very low required-skill coverage against the matched role.');
        }
    } else {
        reasons.push('No structured required skills were defined on the matched job, so skill scoring used a softer baseline.');
    }

    if (experienceFit < 35) {
        hardFlags.push('Experience level appears materially below the minimum requirement.');
    }

    if (analysisSource === 'keyword-fallback') {
        hardFlags.push('Assessment was generated through low-confidence keyword fallback.');
        reasons.push('The candidate was parsed using fallback extraction, so the system will not auto-shortlist or auto-reject aggressively.');
    }

    let status: DecisionStatus = 'Review Required';

    if (matchedJob && analysisSource !== 'keyword-fallback' && roleAlignment >= 70 && requiredSkillScore.score >= 65 && experienceFit >= 60 && weightedOverall >= 78 && hardFlags.length === 0) {
        status = 'Shortlisted';
    } else if (matchedJob && analysisSource !== 'keyword-fallback' && requiredSkills.length > 0 && requiredSkillScore.score < 25 && weightedOverall < 45) {
        status = 'Rejected';
    } else if (matchedJob && analysisSource !== 'keyword-fallback' && experienceFit < 25 && weightedOverall < 45) {
        status = 'Rejected';
    } else {
        status = 'Review Required';
    }

    if (status === 'Shortlisted') {
        reasons.push('Candidate met the shortlist threshold across role alignment, skills, and evidence quality.');
    } else if (status === 'Rejected') {
        reasons.push('Candidate showed a clear mismatch against required skills and/or experience for the matched role.');
    } else {
        reasons.push('Candidate requires recruiter review before a final decision because the match is partial, low-confidence, or not tied to a clear open role.');
    }

    return {
        matchedJobId: matchedJob?.id ?? null,
        matchedJobTitle: matchedJob?.title ?? null,
        inferredTargetRole: inferredRole,
        status,
        overallScore: weightedOverall,
        breakdown: {
            role_alignment: roleAlignment,
            required_skills: requiredSkillScore.score,
            experience_fit: experienceFit,
            location_fit: locationFit,
            evidence_quality: evidenceQuality.score
        },
        requiredSkills,
        matchedSkills: requiredSkillScore.matched,
        hardFlags,
        reasons,
        analysisSource,
        confidence: evidenceQuality.confidence
    };
}
