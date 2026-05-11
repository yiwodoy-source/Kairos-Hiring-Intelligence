import app from './app';
import { bootstrap } from './core/container';
import { initializeAgent } from './services/hr_agent/scheduler';
import { loadTokenFromDb } from './services/hr_agent/google_client';
import { log } from './lib/logger';

const PORT: number = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

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

const gracefulShutdown = async (signal: string) => {
    log.info('shutdown signal received', { signal });
    server.close(() => {
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

export { app, server };
