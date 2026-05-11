/**
 * Client that calls the Python Flask sourcing service (job_sourcing/api_service.py).
 * Falls back gracefully when the Python service is not running.
 *
 * Start the Python service with:
 *   cd job_sourcing && pip install -r requirements.txt && python api_service.py
 */

const PYTHON_SERVICE_URL = process.env.PYTHON_SOURCER_URL || 'http://localhost:5000';
const REQUEST_TIMEOUT_MS = 60_000; // Selenium can be slow

export interface PythonSourcedCandidate {
    name: string;
    email: string;
    headline: string;
    location: string;
    skills: string[];
    profile_url: string;
    about: string;
    job_role: string;
    source: string;
}

export async function isPythonSourcerRunning(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${PYTHON_SERVICE_URL}/health`, { signal: controller.signal });
        clearTimeout(id);
        return res.ok;
    } catch {
        return false;
    }
}

export async function sourceFromPython(
    roles: Array<{ title: string; limit: number }>,
    locationHint = 'India'
): Promise<Array<{ role: string; candidates: PythonSourcedCandidate[]; error?: string }>> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${PYTHON_SERVICE_URL}/api/source-free`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roles, location: locationHint }),
            signal: controller.signal,
        });
        clearTimeout(id);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Python sourcer returned ${res.status}: ${text}`);
        }

        const data = await res.json() as {
            success: boolean;
            results?: Array<{ role: string; candidates: any[]; count: number }>;
            error?: string;
        };

        if (!data.success) throw new Error(data.error || 'Python sourcer error');

        return (data.results ?? []).map(r => ({
            role: r.role,
            candidates: (r.candidates ?? []).map(normalizeCandidate),
        }));
    } catch (err: unknown) {
        clearTimeout(id);
        const msg = err instanceof Error ? err.message : 'Python sourcer unreachable';
        return roles.map(r => ({ role: r.title, candidates: [], error: msg }));
    }
}

function normalizeCandidate(c: any): PythonSourcedCandidate {
    const skills: string[] = Array.isArray(c.skills)
        ? c.skills.map(String).slice(0, 20)
        : typeof c.skills === 'string'
        ? c.skills.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
        : [];

    return {
        name: String(c.name || c.display_name || 'Unknown'),
        email: String(c.email || ''),
        headline: String(c.headline || c.title || c.current_role || '').slice(0, 200),
        location: String(c.location || '').slice(0, 200),
        skills,
        profile_url: String(c.profile_url || c.linkedinUrl || c.link || '').slice(0, 500),
        about: String(c.about || c.resumeText || c.snippet || '').slice(0, 2000),
        job_role: String(c.job_role || c.jobRole || ''),
        source: String(c.source || c.sourcingSource || 'Python Scraper'),
    };
}
