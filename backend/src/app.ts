/**
 * Express application — routes and middleware only, no listen() call.
 * Imported by server.ts (local dev) and api/index.ts (Vercel serverless).
 */
import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import aiRoutes from './routes/ai';
import authRoutes from './routes/auth';
import hrAgentRoutes from './routes/hr_agent';
import integrationRoutes from './routes/integrations';
import openClawRoutes from './routes/openclaw';
import { verifyToken } from './middleware/authMiddleware';
import { getDb } from './db';
import { getAgentStatus } from './services/hr_agent/scheduler';
import { loadTokenFromDb } from './services/hr_agent/google_client';
import { log } from './lib/logger';
import { errMsg } from './lib/errMsg';

const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// On Vercel cold starts the server.ts startup path never runs, so load the
// stored Google OAuth token here instead (no-op if not configured or already loaded).
if (process.env.GOOGLE_CLIENT_ID) {
    loadTokenFromDb().catch(() => { /* logged inside loadTokenFromDb */ });
}

// ── Security ──────────────────────────────────────────────────────────────────

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many attempts' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── CORS ──────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
    const allowedOrigins = (
        process.env.ALLOWED_ORIGINS ||
        'http://localhost:3003,http://localhost:5173,http://localhost:3000'
    ).split(',').map(o => o.trim()).filter(Boolean);

    const origin = req.headers.origin;

    if (origin && allowedOrigins.some(o => o === origin || o === '*')) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', allowedOrigins[0] || '');
    }

    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Request logging ───────────────────────────────────────────────────────────

app.use((req, _res, next) => {
    log.info('request', { method: req.method, url: req.originalUrl });
    next();
});

app.use(express.json({ limit: '10mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', verifyToken, aiRoutes);
app.use('/api/integrations', verifyToken, integrationRoutes);
app.use('/api/openclaw', verifyToken, openClawRoutes);
app.use('/api/hr-agent', (req, res, next) => {
    if (req.path === '/auth/callback' || req.path === '/unsubscribe') return next();
    return verifyToken(req, res, next);
}, hrAgentRoutes);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
    let dbOk = false;
    let dbError: string | undefined;
    try {
        const db = await getDb();
        await db.get('SELECT 1');
        dbOk = true;
    } catch (err: unknown) {
        dbError = errMsg(err);
    }

    const agentStatus = getAgentStatus();
    res.status(dbOk ? 200 : 503).json({
        status: dbOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        subsystems: {
            database: dbOk ? 'ok' : `unreachable: ${dbError}`,
            agent: agentStatus.status,
        },
    });
});

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('unhandled error', { url: req.originalUrl, error: errMsg(err) });
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        ...(NODE_ENV === 'development' && { error: errMsg(err) }),
    });
});

export default app;
