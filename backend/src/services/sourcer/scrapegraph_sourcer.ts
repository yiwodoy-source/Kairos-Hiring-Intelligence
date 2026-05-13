import { searchPublicProfiles, getScrapeGraphStatus } from '../integrations/scrapegraph';
import { errMsg } from '../../lib/errMsg';

export interface ScrapeGraphCandidate {
    name: string;
    headline: string;
    location: string;
    email: string;
    profileUrl: string;
    skills: string[];
    about: string;
    jobRole: string;
}

// Schema hinted to the AI extraction
const CANDIDATE_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            name:     { type: 'string', description: 'Full name of the person' },
            headline: { type: 'string', description: 'Professional title or headline' },
            location: { type: 'string', description: 'City, country or region' },
            email:    { type: 'string', description: 'Email address if visible' },
            skills:   { type: 'array', items: { type: 'string' }, description: 'List of skills or technologies' },
            about:    { type: 'string', description: 'Summary or bio text' },
        }
    }
};

function buildSearchQuery(role: string): string {
    const tech = /engineer|developer|designer|data|ml|ai|frontend|backend|fullstack|devops/i.test(role);
    if (tech) {
        return `"${role}" developer engineer professional site:github.com OR site:dev.to OR site:hashnode.com portfolio skills experience`;
    }
    return `"${role}" professional portfolio skills experience site:linkedin.com/in -site:linkedin.com/jobs`;
}

function extractCandidatesFromResults(rawResults: any[], role: string): ScrapeGraphCandidate[] {
    const candidates: ScrapeGraphCandidate[] = [];

    for (const r of rawResults) {
        // Try extracted structured data first
        const extracted = r?.extracted || r?.data;

        if (Array.isArray(extracted)) {
            for (const item of extracted) {
                const c = normaliseCandidateItem(item, r, role);
                if (c) candidates.push(c);
            }
            continue;
        }

        if (extracted && typeof extracted === 'object') {
            const c = normaliseCandidateItem(extracted, r, role);
            if (c) candidates.push(c);
            continue;
        }

        // Fall back to basic info from search result metadata
        const url = r?.url || r?.sourceURL || '';
        const title = r?.title || '';
        const description = r?.description || r?.content || '';

        if (!title && !url) continue;

        // Try to extract a name from the page title (e.g. "John Doe - Senior Engineer | GitHub")
        const nameMatch = title.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)/);
        const name = nameMatch?.[1] || '';
        if (!name) continue;

        candidates.push({
            name,
            headline: title.replace(name, '').replace(/^[\s\-–|:]+/, '').trim().slice(0, 120),
            location: '',
            email: '',
            profileUrl: url,
            skills: extractSkillsFromText(description),
            about: description.slice(0, 500),
            jobRole: role,
        });
    }

    return candidates;
}

function normaliseCandidateItem(item: any, source: any, role: string): ScrapeGraphCandidate | null {
    const name = String(item?.name || item?.full_name || '').trim();
    if (!name || name.length < 3) return null;

    const skills = Array.isArray(item?.skills)
        ? item.skills.map((s: any) => String(s).trim()).filter(Boolean)
        : typeof item?.skills === 'string'
            ? item.skills.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean)
            : [];

    return {
        name,
        headline: String(item?.headline || item?.title || item?.role || '').slice(0, 150),
        location: String(item?.location || item?.city || '').slice(0, 100),
        email:    String(item?.email || '').trim(),
        profileUrl: String(source?.url || source?.sourceURL || item?.url || '').trim(),
        skills,
        about:    String(item?.about || item?.summary || item?.bio || '').slice(0, 800),
        jobRole:  role,
    };
}

function extractSkillsFromText(text: string): string[] {
    const techKeywords = [
        'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#',
        'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js', 'NestJS',
        'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
        'SQL', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL', 'REST',
        'Machine Learning', 'TensorFlow', 'PyTorch', 'Data Science',
        'Git', 'CI/CD', 'Agile', 'Scrum',
    ];
    return techKeywords.filter(k => new RegExp(`\\b${k.replace('.', '\\.')}\\b`, 'i').test(text));
}

export async function sourceForRole(role: string, limit = 5): Promise<ScrapeGraphCandidate[]> {
    const status = getScrapeGraphStatus();
    if (!status.configured) {
        throw new Error('SCRAPEGRAPH_API_KEY is not configured. Add it to backend/.env to enable web sourcing.');
    }

    const query = buildSearchQuery(role);
    const prompt = `Find up to ${limit} professional candidates for the role "${role}". For each person extract their full name, professional headline, location, email address (if visible), technical skills list, and a brief about/bio summary.`;

    const response = await searchPublicProfiles(query, limit, prompt, CANDIDATE_SCHEMA);

    const rawResults: any[] = response?.data?.results || response?.results || [];
    if (rawResults.length === 0) return [];

    return extractCandidatesFromResults(rawResults, role).slice(0, limit);
}

export async function sourceForRoles(
    roles: { title: string; limit: number }[]
): Promise<{ role: string; candidates: ScrapeGraphCandidate[]; error?: string }[]> {
    const results = [];

    for (const { title, limit } of roles) {
        try {
            const candidates = await sourceForRole(title, limit);
            results.push({ role: title, candidates });
        } catch (err: unknown) {
            results.push({ role: title, candidates: [], error: errMsg(err) });
        }
        // Brief pause between API calls
        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}
