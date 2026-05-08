// Dependency Injection Container
import { IScheduler, TypedEventBus, ILifecycleManager } from './interfaces';
import { AdaptiveScheduler } from './scheduler';
import { LifecycleManager } from './lifecycleManager';

// Container types
export interface Container {
  lifecycleManager: ILifecycleManager;
  scheduler: IScheduler;
  eventBus: TypedEventBus;
  dependencies: any;
}

/**
 * Creates the application container with all dependencies
 */
export function createContainer(
  config: any = {},
  overrides: any = {}
): Container {
  const eventBus = new TypedEventBus();
  
  // Default configuration
  const defaultConfig: any = {
    scheduler: {
      enabled: true,
      interval: 60000,
      jitter: 5000,
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        backoff: 'exponential' as const,
        initialDelay: 1000,
        maxDelay: 30000,
      },
    },
    emailService: { enabled: true },
    analyzer: { enabled: true },
    healthChecks: {
      enabled: true,
      interval: 30000,
    },
    gracefulShutdown: {
      timeout: 30000,
    },
    failFast: false,
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Create scheduler
  const scheduler = (overrides.scheduler || new AdaptiveScheduler(
    finalConfig.scheduler,
    async () => ({ success: true, processed: 0, failed: 0, duration: 0, candidates: [] })
  )) as IScheduler;

  // Create dependencies
  const dependencies = {
    database: overrides.database || {},
    storage: overrides.storage || {},
    scheduler,
    googleAuth: overrides.googleAuth || {},
    emailService: overrides.emailService || {},
    analyzer: overrides.analyzer || {},
    driveService: overrides.driveService || {},
    sheetsService: overrides.sheetsService || {},
    ...overrides,
  };

  // Create lifecycle manager
  const lifecycleManager = new LifecycleManager(finalConfig, dependencies, eventBus);

  return {
    lifecycleManager,
    scheduler,
    eventBus,
    dependencies,
  };
}

/**
 * Bootstrap the application
 */
export async function bootstrap(
  config?: any,
  overrides?: any
): Promise<Container> {
  console.log('[Bootstrap] Creating container...');
  
  const container = createContainer(config, overrides);
  
  console.log('[Bootstrap] Starting lifecycle...');
  await container.lifecycleManager.start();
  
  console.log('[Bootstrap] Application ready');
  return container;
}

/**
 * Graceful shutdown
 */
export async function shutdown(container: Container, signal?: string): Promise<void> {
  console.log('[Shutdown] Initiating graceful shutdown...');
  await container.lifecycleManager.stop(signal);
  console.log('[Shutdown] Complete');
}

// Default export
export default {
  createContainer,
  bootstrap,
  shutdown,
};