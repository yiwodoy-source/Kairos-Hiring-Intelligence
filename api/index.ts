/**
 * Vercel serverless entry point.
 * Routes all /api/* requests through the Express app.
 * Background jobs (HR Agent) are handled by Vercel Cron Jobs — see vercel.json.
 */
import app from '../backend/src/app';

export default app;
