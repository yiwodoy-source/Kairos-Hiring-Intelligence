/**
 * GitHub candidate sourcer — free, unauthenticated (60 req/hour).
 * Searches GitHub users by language + location, enriches with user profile data.
 * Set GITHUB_TOKEN env var for 5000 req/hour (recommended for production).
 */

export interface GitHubCandidate {
    name: string;
    email: string;
    headline: string;
    location: string;
    skills: string[];
    profileUrl: string;
    about: string;
    jobRole: string;
}

interface GitHubSearchUser {
    login: string;
    html_url: string;
}

interface GitHubUserDetail {
    login: string;
    name: string | null;
    email: string | null;
    bio: string | null;
    location: string | null;
    blog: string | null;
    company: string | null;
    public_repos: number;
    html_url: string;
    hireable: boolean | null;
}

const GITHUB_API = 'https://api.github.com';

function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'NexusHR-Sourcer/1.0',
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

async function githubFetch<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, { headers: buildHeaders() });
        if (res.status === 403 || res.status === 429) {
            console.warn('[GitHub Sourcer] Rate limited — add GITHUB_TOKEN for higher limits');
            return null;
        }
        if (!res.ok) return null;
        return res.json() as Promise<T>;
    } catch {
        return null;
    }
}

/** Map a job role to likely GitHub search languages / keywords */
function roleToQuery(role: string): { languages: string[]; keywords: string[] } {
    const r = role.toLowerCase();
    if (/python|data sci|ml|machine learn|ai engineer|nlp/.test(r)) {
        return { languages: ['python'], keywords: ['data-science', 'machine-learning', 'python'] };
    }
    if (/java(?!script)|spring|backend java/.test(r)) {
        return { languages: ['java'], keywords: ['spring-boot', 'java', 'backend'] };
    }
    if (/javascript|node|react|frontend|full.?stack/.test(r)) {
        return { languages: ['javascript', 'typescript'], keywords: ['react', 'nodejs', 'typescript'] };
    }
    if (/android|kotlin/.test(r)) {
        return { languages: ['kotlin', 'java'], keywords: ['android', 'kotlin'] };
    }
    if (/ios|swift|objective/.test(r)) {
        return { languages: ['swift'], keywords: ['ios', 'swift'] };
    }
    if (/go|golang/.test(r)) {
        return { languages: ['go'], keywords: ['golang', 'microservices'] };
    }
    if (/rust/.test(r)) {
        return { languages: ['rust'], keywords: ['rust', 'systems'] };
    }
    if (/devops|sre|cloud|kubernetes|docker|infra/.test(r)) {
        return { languages: ['python', 'go', 'shell'], keywords: ['devops', 'kubernetes', 'infrastructure'] };
    }
    if (/php|laravel|wordpress/.test(r)) {
        return { languages: ['php'], keywords: ['laravel', 'php'] };
    }
    if (/\.net|c#|dotnet/.test(r)) {
        return { languages: ['csharp'], keywords: ['dotnet', 'csharp', 'aspnet'] };
    }
    if (/c\+\+|cpp|embedded|firmware/.test(r)) {
        return { languages: ['cpp', 'c'], keywords: ['embedded', 'systems', 'cpp'] };
    }
    // Generic software engineer / default
    return { languages: ['javascript', 'python', 'java'], keywords: ['software', 'developer', 'engineer'] };
}

async function searchGitHubUsers(
    language: string,
    location: string,
    maxResults: number
): Promise<GitHubSearchUser[]> {
    const locationQ = location && location !== 'any' ? `+location:"${encodeURIComponent(location)}"` : '';
    const q = encodeURIComponent(`language:${language}${locationQ ? '' : ''}`);
    const fullQ = `language:${language}${location && location !== 'any' ? `+location:${location}` : ''}+repos:>5+followers:>2`;
    const url = `${GITHUB_API}/search/users?q=${encodeURIComponent(fullQ)}&per_page=${Math.min(maxResults, 30)}&sort=repositories`;

    const data = await githubFetch<{ items?: GitHubSearchUser[] }>(url);
    return data?.items ?? [];
}

async function getUserDetail(login: string): Promise<GitHubUserDetail | null> {
    return githubFetch<GitHubUserDetail>(`${GITHUB_API}/users/${login}`);
}

/** Fetch top languages from a user's repos as skill tags */
async function getUserTopLanguages(login: string): Promise<string[]> {
    const repos = await githubFetch<Array<{ language: string | null; stargazers_count: number }>>(
        `${GITHUB_API}/users/${login}/repos?per_page=20&sort=stars`
    );
    if (!repos) return [];
    const counts: Record<string, number> = {};
    for (const r of repos) {
        if (r.language) counts[r.language] = (counts[r.language] ?? 0) + 1;
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([lang]) => lang);
}

function buildHeadline(user: GitHubUserDetail, languages: string[]): string {
    if (user.bio && user.bio.length > 10) return user.bio.slice(0, 200);
    const langStr = languages.slice(0, 3).join(' / ');
    const company = user.company ? ` at ${user.company.replace(/^@/, '')}` : '';
    return `GitHub Developer${langStr ? ` (${langStr})` : ''}${company}`.slice(0, 200);
}

function buildAbout(user: GitHubUserDetail, languages: string[]): string {
    const parts: string[] = [];
    if (user.bio) parts.push(user.bio);
    if (user.company) parts.push(`Works at: ${user.company}`);
    if (languages.length) parts.push(`Top languages: ${languages.join(', ')}`);
    parts.push(`Public repos: ${user.public_repos}`);
    if (user.blog) parts.push(`Website: ${user.blog}`);
    return parts.join('\n').slice(0, 2000);
}

export interface GitHubSourceResult {
    role: string;
    candidates: GitHubCandidate[];
    error?: string;
}

export async function sourceFromGitHub(
    roles: Array<{ title: string; limit: number }>,
    locationHint = 'India'
): Promise<GitHubSourceResult[]> {
    const results: GitHubSourceResult[] = [];

    for (const { title, limit } of roles) {
        const { languages } = roleToQuery(title);
        const allUsers = new Map<string, GitHubSearchUser>();

        // Search across primary languages, stop once we have enough
        for (const lang of languages) {
            if (allUsers.size >= limit * 2) break;
            const users = await searchGitHubUsers(lang, locationHint, limit * 2);
            for (const u of users) allUsers.set(u.login, u);
            // Small delay to stay within rate limits
            await new Promise(r => setTimeout(r, 300));
        }

        const candidates: GitHubCandidate[] = [];
        const logins = [...allUsers.values()].slice(0, limit * 2);

        for (const searchUser of logins) {
            if (candidates.length >= limit) break;
            try {
                const detail = await getUserDetail(searchUser.login);
                if (!detail) continue;
                // Skip users with no useful info
                if (!detail.name && !detail.bio && !detail.location) continue;

                const languages = await getUserTopLanguages(detail.login);
                await new Promise(r => setTimeout(r, 200));

                const name = detail.name?.trim() || detail.login;
                const headline = buildHeadline(detail, languages);
                const about = buildAbout(detail, languages);
                const skills = [...new Set([...languages])].slice(0, 15);

                candidates.push({
                    name,
                    email: detail.email?.trim() || '',
                    headline,
                    location: detail.location?.trim() || locationHint,
                    skills,
                    profileUrl: detail.html_url,
                    about,
                    jobRole: title,
                });
            } catch {
                // skip individual user errors
            }
        }

        results.push({ role: title, candidates });
    }

    return results;
}
