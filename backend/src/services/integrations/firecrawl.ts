import axios from 'axios';

const FIRECRAWL_BASE_URL = (process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev').replace(/\/+$/, '');

export type FirecrawlSearchResult = {
    title: string;
    url: string;
    description?: string;
    markdown?: string;
};

export type FirecrawlStatus = {
    enabled: boolean;
    configured: boolean;
    baseUrl: string;
};

function getApiKey(): string {
    return process.env.FIRECRAWL_API_KEY || '';
}

function buildHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json'
    };
}

function isEnabled(): boolean {
    return Boolean(getApiKey());
}

export function getFirecrawlStatus(): FirecrawlStatus {
    return {
        enabled: isEnabled(),
        configured: Boolean(getApiKey()),
        baseUrl: FIRECRAWL_BASE_URL
    };
}

export async function probeFirecrawl(): Promise<{ ok: boolean; detail: string }> {
    if (!isEnabled()) {
        return { ok: false, detail: 'FIRECRAWL_API_KEY is not configured.' };
    }

    try {
        const response = await axios.post(
            `${FIRECRAWL_BASE_URL}/v2/scrape`,
            { url: 'https://example.com', formats: ['markdown'], onlyMainContent: true },
            { headers: buildHeaders(), timeout: 30000 }
        );

        return {
            ok: Boolean(response.data?.success !== false),
            detail: 'Firecrawl API is reachable.'
        };
    } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Unknown Firecrawl error';
        return { ok: false, detail: String(message) };
    }
}

export async function searchWithFirecrawl(query: string, limit = 8): Promise<FirecrawlSearchResult[]> {
    if (!isEnabled()) {
        return [];
    }

    const response = await axios.post(
        `${FIRECRAWL_BASE_URL}/v2/search`,
        {
            query,
            limit,
            scrapeOptions: {
                formats: ['markdown'],
                onlyMainContent: true
            }
        },
        {
            headers: buildHeaders(),
            timeout: 90000
        }
    );

    const rawResults = response.data?.data || response.data?.results || [];
    if (!Array.isArray(rawResults)) {
        return [];
    }

    return rawResults.map((item: any) => ({
        title: item.title || item.metadata?.title || item.url || 'Untitled',
        url: item.url || item.sourceURL || '',
        description: item.description || item.metadata?.description || '',
        markdown: item.markdown || item.content || ''
    })).filter((item: FirecrawlSearchResult) => Boolean(item.url));
}

export async function scrapeWithFirecrawl(url: string): Promise<any> {
    if (!isEnabled()) {
        throw new Error('FIRECRAWL_API_KEY is not configured.');
    }

    const response = await axios.post(
        `${FIRECRAWL_BASE_URL}/v2/scrape`,
        {
            url,
            formats: ['markdown'],
            onlyMainContent: true
        },
        {
            headers: buildHeaders(),
            timeout: 90000
        }
    );

    return response.data;
}
