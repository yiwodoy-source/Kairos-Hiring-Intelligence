import axios from 'axios';

const MERGE_BASE_URL = (process.env.MERGE_BASE_URL || 'https://api.merge.dev/api/ats/v1').replace(/\/+$/, '');

export type MergeStatus = {
    enabled: boolean;
    configured: boolean;
    baseUrl: string;
    hasAccountToken: boolean;
};

function getApiKey(): string {
    return process.env.MERGE_API_KEY || '';
}

function getAccountToken(): string {
    return process.env.MERGE_ACCOUNT_TOKEN || '';
}

function buildHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getApiKey()}`,
        'X-Account-Token': getAccountToken(),
        'Content-Type': 'application/json'
    };
}

export function getMergeStatus(): MergeStatus {
    const hasApiKey = Boolean(getApiKey());
    const hasAccountToken = Boolean(getAccountToken());

    return {
        enabled: hasApiKey && hasAccountToken,
        configured: hasApiKey,
        baseUrl: MERGE_BASE_URL,
        hasAccountToken
    };
}

export async function probeMerge(): Promise<{ ok: boolean; detail: string }> {
    const status = getMergeStatus();
    if (!status.configured) {
        return { ok: false, detail: 'MERGE_API_KEY is not configured.' };
    }
    if (!status.hasAccountToken) {
        return { ok: false, detail: 'MERGE_ACCOUNT_TOKEN is not configured.' };
    }

    try {
        await axios.get(`${MERGE_BASE_URL}/account-details`, {
            headers: buildHeaders(),
            timeout: 30000
        });

        return { ok: true, detail: 'Merge ATS API is reachable.' };
    } catch (error: any) {
        const message = error?.response?.data?.detail || error?.response?.data?.error || error?.message || 'Unknown Merge error';
        return { ok: false, detail: String(message) };
    }
}

async function getCollection(path: string, query?: Record<string, string | number | boolean | undefined>) {
    const response = await axios.get(`${MERGE_BASE_URL}${path}`, {
        headers: buildHeaders(),
        params: query,
        timeout: 45000
    });

    return response.data;
}

export async function getMergeCandidates(pageSize = 25) {
    return getCollection('/candidates', { page_size: pageSize });
}

export async function getMergeJobs(pageSize = 25) {
    return getCollection('/jobs', { page_size: pageSize });
}

export async function getMergeApplications(pageSize = 25) {
    return getCollection('/applications', { page_size: pageSize });
}
