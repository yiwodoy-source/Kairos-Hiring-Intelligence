import { log } from './logger';

export interface RetryOptions {
    maxAttempts?: number;  // default 3
    baseDelayMs?: number;  // default 500
    maxDelayMs?: number;   // default 10000
    label?: string;
    // Return true to retry, false to rethrow immediately (e.g. auth errors aren't transient)
    retryOn?: (err: unknown) => boolean;
}

// Exponential backoff with full jitter: delay = random(0, min(base * 2^attempt, max))
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
    const {
        maxAttempts = 3,
        baseDelayMs = 500,
        maxDelayMs = 10_000,
        label = 'operation',
        retryOn,
    } = opts;

    let lastErr: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;

            if (retryOn && !retryOn(err)) throw err;
            if (attempt === maxAttempts) break;

            const cap = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
            const delay = Math.floor(Math.random() * cap);

            log.warn(`retry: ${label} failed, retrying`, {
                attempt,
                maxAttempts,
                delayMs: delay,
                error: err instanceof Error ? err.message : String(err),
            });

            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastErr;
}
