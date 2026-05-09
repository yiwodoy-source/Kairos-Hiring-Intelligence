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
import { bootstrap } from './core/container';
import { initializeAgent, getAgentStatus } from './services/hr_agent/scheduler';
import { loadTokenFromDb } from './services/hr_agent/google_client';
import { getDb } from './db';
import { log } from './lib/logger';

// Application configuration
const PORT: number = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create Express application
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // inline styles kept for email HTML responses
      scriptSrc: ["'self'"],                   // unsafe-inline and external CDN removed
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  // Allow cross-origin reads so the frontend on :3003 can reach this API on :3001
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
app.use((req, res, next) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3003,http://localhost:5173,http://localhost:3000').split(',');
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    // Never fall back to wildcard — use the primary configured origin.
    // Unknown origins receive no ACAO header and are blocked by the browser.
    res.header('Access-Control-Allow-Origin', allowedOrigins[0] || '');
  }

  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging
app.use((req, _res, next) => {
  log.info('request', { method: req.method, url: req.originalUrl });
  next();
});

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', verifyToken, aiRoutes);
app.use('/api/integrations', verifyToken, integrationRoutes);
app.use('/api/openclaw', verifyToken, openClawRoutes);
app.use('/api/hr-agent', (req, res, next) => {
  // Public paths: OAuth callback and candidate unsubscribe link
  if (req.path === '/auth/callback' || req.path === '/unsubscribe') {
    return next();
  }
  return verifyToken(req, res, next);
}, hrAgentRoutes);

// Health check — verifies DB connectivity and agent state
app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  try {
    const db = await getDb();
    await db.get('SELECT 1');
    dbOk = true;
  } catch { /* db unreachable */ }

  const agentStatus = getAgentStatus();
  const healthy = dbOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    subsystems: {
      database: dbOk ? 'ok' : 'unreachable',
      agent: agentStatus.status,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error('unhandled error', { url: req.originalUrl, error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(NODE_ENV === 'development' && { error: err.message }),
  });
});

// Start server — initialize agent before accepting traffic
const server = app.listen(PORT, '0.0.0.0', async () => {
  log.info('server started', { port: PORT, env: NODE_ENV });
  try {
    await loadTokenFromDb();
    log.info('google token loaded');
  } catch (err: any) {
    log.warn('google token load skipped', { error: err.message });
  }
  try {
    await initializeAgent();
    log.info('agent initialized');
  } catch (err: any) {
    log.error('agent initialization failed', { error: err.message });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  log.info('shutdown signal received', { signal });

  server.close(async () => {
    log.info('http server closed');
    process.exit(0);
  });

  setTimeout(() => {
    log.error('force shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
export { app, server };
