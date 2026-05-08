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
import { initializeAgent } from './services/hr_agent/scheduler';

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
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
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (NODE_ENV === 'production') {
    res.header('Access-Control-Allow-Origin', allowedOrigins[0] || '');
  } else {
    res.header('Access-Control-Allow-Origin', origin || '*');
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
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', verifyToken, aiRoutes);
app.use('/api/integrations', verifyToken, integrationRoutes);
app.use('/api/openclaw', verifyToken, openClawRoutes);
app.use('/api/hr-agent', (req, res, next) => {
  if (req.path === '/auth/callback') {
    return next();
  }
  return verifyToken(req, res, next);
}, hrAgentRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage().rss / 1024 / 1024
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    ...(NODE_ENV === 'development' && { error: err.message })
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running on port ${PORT} [${NODE_ENV}]`);
  initializeAgent();
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`[SERVER] ${signal} received, shutting down...`);
  
  server.close(async () => {
    console.log('[SERVER] HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('[SERVER] Force shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
export { app, server };
