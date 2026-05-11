/**
 * Stack Overflow candidate sourcer — free, unauthenticated (300 req/day).
 * Searches users by tag expertise and location.
 * Set STACKOVERFLOW_KEY env var for higher quota (10,000 req/day).
 */

export interface StackOverflowCandidate {
    name: string;
    email: string;
    headline: string;
    location: string;
    skills: string[];
    profileUrl: string;
    about: string;
    jobRole: string;
}

interface SOUser {
    user_id: number;
    display_name: string;
    location?: string;
    about_me?: string;
    link: string;
    reputation: number;
    answer_count: number;
    question_count: number;
    top_tags?: Array<{ tag_name: string; answer_count: number }>;
}

interface SOUserDetail extends SOUser {
    website_url?: string;
    job_type?: string;
    currently_employed?: boolean;
}

const SO_API = 'https://api.stackexchange.com/2.3';

function soParams(extra: Record<string, string | number> = {}): string {
    const params: Record<string, string | number> = {
        site: 'stackoverflow',
        pagesize: 30,
        ...extra,
    };
    const key = process.env.STACKOVERFLOW_KEY;
    if (key) params['key'] = key;
    return Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
}

async function soFetch<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`${SO_API}${path}`, {
            headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'NexusHR-Sourcer/1.0' },
        });
        if (res.status === 429 || res.status === 400) {
            const body = await res.json().catch(() => ({})) as { error_message?: string };
            console.warn('[SO Sourcer] API error:', body.error_message ?? res.status);
            return null;
        }
        if (!res.ok) return null;
        return res.json() as Promise<T>;
    } catch {
        return null;
    }
}

/** Map job role to relevant Stack Overflow tags */
function roleToTags(role: string): string[] {
    const r = role.toLowerCase();
    if (/python|data sci|ml|machine learn|ai engineer|nlp/.test(r))
        return ['python', 'machine-learning', 'pandas', 'tensorflow'];
    if (/java(?!script)|spring/.test(r))
        return ['java', 'spring-boot', 'spring-mvc'];
    if (/javascript|node|react|frontend/.test(r))
        return ['javascript', 'reactjs', 'node.js', 'typescript'];
    if (/full.?stack/.test(r))
        return ['javascript', 'node.js', 'reactjs', 'python'];
    if (/android|kotlin/.test(r))
        return ['android', 'kotlin', 'java'];
    if (/ios|swift/.test(r))
        return ['ios', 'swift', 'objective-c'];
    if (/go|golang/.test(r))
        return ['go', 'golang'];
    if (/rust/.test(r))
        return ['rust'];
    if (/devops|sre|cloud|kubernetes|docker/.test(r))
        return ['docker', 'kubernetes', 'devops', 'amazon-web-services'];
    if (/php|laravel/.test(r))
        return ['php', 'laravel'];
    if (/\.net|c#|dotnet/.test(r))
        return ['c#', '.net', 'asp.net'];
    if (/c\+\+|cpp|embedded/.test(r))
        return ['c++', 'embedded', 'c'];
    if (/database|sql|dba/.test(r))
        return ['sql', 'postgresql', 'mysql'];
    return ['programming', 'software-development', 'algorithms'];
}

async function searchSOUsers(tag: string, locationHint: string, limit: number): Promise<SOUser[]> {
    const params = soParams({
        tagged: tag,
        sort: 'reputation',
        order: 'desc',
        min: 500,
        filter: 'default',
        pagesize: Math.min(limit * 3, 50),
    });
    const data = await soFetch<{ items?: SOUser[] }>(`/users?${params}`);
    const users = data?.items ?? [];

    if (!locationHint || locationHint === 'any') return users;

    const loc = locationHint.toLowerCase();
    const filtered = users.filter(u => u.location?.toLowerCase().includes(loc));
    return filtered.length >= Math.min(limit, 3) ? filtered : users;
}

async function getUserTopTags(userId: number): Promise<string[]> {
    const params = soParams({ pagesize: 10 });
    const data = await soFetch<{ items?: Array<{ tag_name: string }> }>(`/users/${userId}/top-tags?${params}`);
    return data?.items?.map(t => t.tag_name) ?? [];
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSOHeadline(user: SOUser, topTags: string[]): string {
    const tagStr = topTags.slice(0, 3).join(' / ');
    const rep = user.reputation >= 1000
        ? ` (${(user.reputation / 1000).toFixed(1)}k rep)`
        : '';
    return `Stack Overflow Developer${tagStr ? ` — ${tagStr}` : ''}${rep}`.slice(0, 200);
}

function buildSOAbout(user: SOUser, topTags: string[]): string {
    const parts: string[] = [];
    if (user.about_me) parts.push(stripHtml(user.about_me).slice(0, 800));
    parts.push(`Stack Overflow reputation: ${user.reputation}`);
    parts.push(`Answers: ${user.answer_count}, Questions: ${user.question_count}`);
    if (topTags.length) parts.push(`Top tags: ${topTags.join(', ')}`);
    return parts.join('\n').slice(0, 2000);
}

export interface StackOverflowSourceResult {
    role: string;
    candidates: StackOverflowCandidate[];
    error?: string;
}

export async function sourceFromStackOverflow(
    roles: Array<{ title: string; limit: number }>,
    locationHint = 'India'
): Promise<StackOverflowSourceResult[]> {
    const results: StackOverflowSourceResult[] = [];

    for (const { title, limit } of roles) {
        const tags = roleToTags(title);
        const seen = new Set<number>();
        const candidates: StackOverflowCandidate[] = [];

        for (const tag of tags) {
            if (candidates.length >= limit) break;
            const users = await searchSOUsers(tag, locationHint, limit);
            await new Promise(r => setTimeout(r, 500));

            for (const user of users) {
                if (candidates.length >= limit) break;
                if (seen.has(user.user_id)) continue;
                seen.add(user.user_id);

                // Skip users with very sparse profiles
                if (!user.location && !user.about_me && user.answer_count < 5) continue;

                const topTags = await getUserTopTags(user.user_id);
                await new Promise(r => setTimeout(r, 300));

                const headline = buildSOHeadline(user, topTags);
                const about = buildSOAbout(user, topTags);
                const skills = [...new Set(topTags)].slice(0, 15);

                candidates.push({
                    name: user.display_name,
                    email: '',
                    headline,
                    location: user.location?.trim() || locationHint,
                    skills,
                    profileUrl: user.link,
                    about,
                    jobRole: title,
                });
            }
        }

        results.push({ role: title, candidates });
    }

    return results;
}
