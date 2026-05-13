import { searchWithFirecrawl, getFirecrawlStatus } from '../integrations/firecrawl';
import { errMsg } from '../../lib/errMsg';

export interface FirecrawlCandidate {
    name: string;
    headline: string;
    location: string;
    email: string;
    profileUrl: string;
    skills: string[];
    about: string;
    jobRole: string;
}

const TECH_SKILLS = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'PHP', 'Ruby',
    'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js', 'NestJS', 'Django', 'FastAPI',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD',
    'SQL', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL', 'REST',
    'Machine Learning', 'TensorFlow', 'PyTorch', 'Data Science', 'NLP',
    'Git', 'Agile', 'Scrum', 'Figma', 'Photoshop',
];

function buildSearchQuery(role: string): string {
    const tech = /engineer|developer|designer|data|ml|ai|frontend|backend|fullstack|devops/i.test(role);
    if (tech) {
        return `"${role}" software engineer developer portfolio resume github skills experience`;
    }
    return `"${role}" professional resume portfolio skills experience career`;
}

function extractSkillsFromText(text: string): string[] {
    return TECH_SKILLS.filter(k =>
        new RegExp(`\\b${k.replace(/[.+]/g, '\\$&')}\\b`, 'i').test(text)
    );
}

function extractEmailFromText(text: string): string {
    const m = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    return m ? m[0] : '';
}

function parseCandidateFromResult(
    result: { title: string; url: string; description?: string; markdown?: string },
    role: string
): FirecrawlCandidate | null {
    const text = [result.markdown || '', result.description || '', result.title || ''].join(' ');

    // Try to extract a person's name from the title
    // Patterns: "John Doe - Senior Engineer | GitHub", "John Doe | LinkedIn", "John Doe Resume"
    const nameMatch = result.title.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)/);
    const name = nameMatch?.[1]?.trim() || '';
    if (!name || name.split(' ').length < 2) return null;

    const headline = result.title
        .replace(name, '')
        .replace(/^[\s\-–|:·]+/, '')
        .replace(/\s*[\|·]\s*.*$/, '')
        .trim()
        .slice(0, 150) || role;

    const skills = extractSkillsFromText(text);
    const email = extractEmailFromText(text);

    // Extract location hints
    const locationMatch = text.match(/\b(based in|located in|from)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\n|$)/i);
    const location = locationMatch?.[2]?.trim().slice(0, 100) || '';

    const about = (result.description || result.markdown || '').slice(0, 600);

    return { name, headline, location, email, profileUrl: result.url, skills, about, jobRole: role };
}

export async function sourceWithFirecrawlForRole(role: string, limit = 5): Promise<FirecrawlCandidate[]> {
    const status = getFirecrawlStatus();
    if (!status.configured) {
        throw new Error('FIRECRAWL_API_KEY is not configured. Add it to backend/.env to enable Firecrawl sourcing.');
    }

    const query = buildSearchQuery(role);
    const rawResults = await searchWithFirecrawl(query, limit);
    if (!rawResults.length) return [];

    const candidates: FirecrawlCandidate[] = [];
    for (const r of rawResults) {
        const c = parseCandidateFromResult(r, role);
        if (c) candidates.push(c);
    }
    return candidates.slice(0, limit);
}

export async function sourceWithFirecrawlForRoles(
    roles: { title: string; limit: number }[]
): Promise<{ role: string; candidates: FirecrawlCandidate[]; error?: string }[]> {
    const results = [];
    for (const { title, limit } of roles) {
        try {
            const candidates = await sourceWithFirecrawlForRole(title, limit);
            results.push({ role: title, candidates });
        } catch (err: unknown) {
            results.push({ role: title, candidates: [], error: errMsg(err) });
        }
        await new Promise(r => setTimeout(r, 600));
    }
    return results;
}
