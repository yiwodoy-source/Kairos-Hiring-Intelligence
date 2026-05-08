// Modern application entry point with proper lifecycle management
import 'dotenv/config';
import { bootstrap, shutdown } from './core/container';
import { logAgentActivity } from './services/hr_agent/logger';

async function main() {
  console.log('='.repeat(60));
  console.log('Nexus HR AI - Modern Application');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`PID: ${process.pid}`);
  console.log('='.repeat(60));

  let container: any;

  try {
    // Bootstrap application
    container = await bootstrap({
      scheduler: {
        enabled: true,
        interval: parseInt(process.env.CRON_INTERVAL || '60000', 10),
        jitter: 5000,
        timeout: 30000,
        retryPolicy: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 30000,
        },
      },
      emailService: { enabled: true },
      analyzer: { enabled: Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY) },
      healthChecks: {
        enabled: true,
        interval: 30000,
      },
      gracefulShutdown: {
        timeout: 30000,
      },
      failFast: process.env.NODE_ENV === 'production',
    }, {
      // Dependencies will be injected by real implementations
      database: { initialize: async () => {}, close: async () => {}, ping: async () => ({ healthy: true }), health: async () => ({ healthy: true }), query: async () => [] } as any,
      storage: { initialize: async () => {}, close: async () => {}, health: async () => ({ healthy: true }), saveCandidate: async () => {}, getCandidates: async () => [] } as any,
      googleAuth: { initialize: async () => {}, close: async () => {}, checkConnection: async () => ({ healthy: true }), getClient: () => ({}) } as any,
      emailService: { initialize: async () => {}, health: async () => ({ healthy: true }), getUnreadCVs: async () => [], sendAutomatedReply: async () => {}, markAsRead: async () => {} } as any,
      analyzer: { initialize: async () => {}, health: async () => ({ healthy: true }), analyzeCV: async () => ({ success: true, processed: 0, failed: 0, duration: 0, candidates: [] }) } as any,
      driveService: { upload: async () => '', health: async () => ({ healthy: true }) } as any,
      sheetsService: { logCandidate: async () => {}, health: async () => ({ healthy: true }) } as any,
    });

    console.log('[Main] Application started successfully');
    
    // Setup graceful shutdown
    const handleShutdown = async (signal: string) => {
      console.log(`\n[Main] Received ${signal}, initiating shutdown...`);
      await shutdown(container, signal);
      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGHUP', () => handleShutdown('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('[Main] Uncaught exception:', error);
      logAgentActivity(`Uncaught exception: ${error}`, 'ERROR');
      
      if (process.env.NODE_ENV === 'production') {
        await shutdown(container, 'uncaughtException');
        process.exit(1);
      }
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
      logAgentActivity(`Unhandled rejection: ${reason}`, 'ERROR');
      
      if (process.env.NODE_ENV === 'production') {
        await shutdown(container, 'unhandledRejection');
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('[Main] Fatal error during startup:', error);
    logAgentActivity(`Fatal startup error: ${error}`, 'ERROR');
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { main };
