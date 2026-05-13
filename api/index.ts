/**
 * Vercel serverless entry point.
 * Routes all /api/* requests through the Express app.
 * Background jobs (HR Agent) are handled by Vercel Cron Jobs — see vercel.json.
 */
import type { IncomingMessage, ServerResponse } from 'http';

let appModule: any;
let loadError: Error | null = null;

try {
    appModule = require('../backend/src/app');
} catch (err: unknown) {
    loadError = err instanceof Error ? err : new Error(String(err));
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
    if (loadError || !appModule?.default) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'App failed to load',
            message: loadError?.message || 'No default export',
            stack: loadError?.stack?.split('\n').slice(0, 8),
        }));
        return;
    }
    return appModule.default(req, res);
}
