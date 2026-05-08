import axios from 'axios';

const SCRAPEGRAPH_BASE_URL = (process.env.SCRAPEGRAPH_BASE_URL || 'https://v2-api.scrapegraphai.com').replace(/\/+$/, '');

const BLOCKED_HOSTS = ['linkedin.com', 'www.linkedin.com', 'indeed.com', 'www.indeed.com'];

export type ScrapeGraphStatus = {
    enabled: boolean;
    configured: boolean;
    baseUrl: string;
};

function getApiKey(): string {
    return process.env.SCRAPEGRAPH_API_KEY || '';
}

function buildHeaders(): Record<string, string> {
    return {
        'SGAI-APIKEY': getApiKey(),
        'Content-Type': 'application/json'
    };
}

function isEnabled(): boolean {
    return Boolean(getApiKey());
}

export function getScrapeGraphStatus(): ScrapeGraphStatus {
    return {
        enabled: isEnabled(),
        configured: Boolean(getApiKey()),
        baseUrl: SCRAPEGRAPH_BASE_URL
    };
}

function assertAllowedUrl(url: string): void {
    let host = '';
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        throw new Error('Invalid URL');
    }

    if (BLOCKED_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) {
        throw new Error('ScrapeGraph public enrichment does not support LinkedIn or Indeed profile scraping in this project.');
    }
}

export async function probeScrapeGraph(): Promise<{ ok: boolean; detail: string }> {
    if (!isEnabled()) {
        return { ok: false, detail: 'SCRAPEGRAPH_API_KEY is not configured.' };
    }

    try {
        await axios.get(`${SCRAPEGRAPH_BASE_URL}/api/credits`, {
            headers: buildHeaders(),
            timeout: 30000
        });

        return { ok: true, detail: 'ScrapeGraphAI API is reachable.' };
    } catch (error: any) {
        const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unknown ScrapeGraphAI error';
        return { ok: false, detail: String(message) };
    }
}

export async function scrapePublicPage(url: string) {
    assertAllowedUrl(url);

    const response = await axios.post(
        `${SCRAPEGRAPH_BASE_URL}/api/scrape`,
        {
            url,
            formats: [{ type: 'markdown', mode: 'reader' }, { type: 'summary' }]
        },
        {
            headers: buildHeaders(),
            timeout: 90000
        }
    );

    return response.data;
}

export async function extractPublicProfile(url: string, prompt: string, schema?: Record<string, any>) {
    assertAllowedUrl(url);

    const body: Record<string, any> = {
        url,
        prompt
    };

    if (schema) {
        body.schema = schema;
    }

    const response = await axios.post(
        `${SCRAPEGRAPH_BASE_URL}/api/extract`,
        body,
        {
            headers: buildHeaders(),
            timeout: 90000
        }
    );

    return response.data;
}

export async function searchPublicProfiles(query: string, numResults = 5, prompt?: string, schema?: Record<string, any>) {
    const body: Record<string, any> = {
        query,
        numResults,
        format: 'markdown'
    };

    if (prompt) {
        body.prompt = prompt;
    }

    if (schema) {
        body.schema = schema;
    }

    const response = await axios.post(
        `${SCRAPEGRAPH_BASE_URL}/api/search`,
        body,
        {
            headers: buildHeaders(),
            timeout: 90000
        }
    );

    const data = response.data;

    if (Array.isArray(data?.data?.results)) {
        data.data.results = data.data.results.filter((result: any) => {
            const url = result?.url || result?.sourceURL || '';
            try {
                assertAllowedUrl(url);
                return true;
            } catch {
                return false;
            }
        });
    }

    return data;
}
