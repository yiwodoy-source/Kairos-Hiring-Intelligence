import app from './app';
import { bootstrap } from './core/container';
import { loadTokenFromDb } from './services/hr_agent/google_client';
import { startKairosSwarm, stopKairosSwarm } from './agents/index';
import { log } from './lib/logger';
import { errMsg } from './lib/errMsg';

const PORT: number = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, '0.0.0.0', async () => {
    log.info('server started', { port: PORT, env: NODE_ENV });

    try {
        await loadTokenFromDb();
        log.info('google token loaded');
    } catch (err: unknown) {
        log.warn('google token load skipped', { error: errMsg(err) });
    }

    try {
        await startKairosSwarm();
        log.info('kairos swarm started');
    } catch (err: unknown) {
        log.error('kairos swarm failed to start', { error: errMsg(err) });
    }
});

const gracefulShutdown = async (signal: string) => {
    log.info('shutdown signal received', { signal });
    await stopKairosSwarm().catch(() => {});
    server.close(() => {
        log.info('http server closed');
        process.exit(0);
    });
    setTimeout(() => {
        log.error('force shutdown after timeout');
        process.exit(1);
    }, 30_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server };
