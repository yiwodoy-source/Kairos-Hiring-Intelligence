// Modern lifecycle manager with graceful shutdown
import { ILifecycleManager, HealthCheck, HealthStatus, LifecycleConfig, LifecycleDependencies, LifecycleStatus } from './interfaces';
import { LifecycleStateMachine } from './stateMachine';
import { TypedEventBus } from './eventBus';
import { IScheduler } from './interfaces';
import { IDatabase, IStorage, IEmailService, IAnalyzer, IDriveService, ISheetsService, IGoogleAuth } from './interfaces';

export class LifecycleManager implements ILifecycleManager {
  private stateMachine: LifecycleStateMachine;
  private shutdownTimeout?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(
    private config: LifecycleConfig,
    private dependencies: LifecycleDependencies,
    private eventBus = new TypedEventBus()
  ) {
    this.stateMachine = new LifecycleStateMachine('idle');
  }

  async start(): Promise<void> {
    if (this.stateMachine.is('running')) {
      console.log('[Lifecycle] Already running');
      return;
    }

    this.stateMachine.transition('starting');
    console.log('[Lifecycle] Starting application...');

    try {
      await this.initializeDependencies();
      await this.startServices();
      this.registerSignalHandlers();
      this.startHealthMonitoring();
      
      this.stateMachine.transition('running');
      this.eventBus.emit('app:started', {
        timestamp: new Date(),
        config: this.config,
      });
      
      console.log('[Lifecycle] Application started successfully');
    } catch (error) {
      this.stateMachine.transition('error', error);
      console.error('[Lifecycle] Failed to start:', error);
      await this.cleanup();
      throw error;
    }
  }

  async stop(signal?: string): Promise<void> {
    if (this.stateMachine.is('stopped')) {
      console.log('[Lifecycle] Already stopped');
      return;
    }

    if (this.isShuttingDown) {
      console.log('[Lifecycle] Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.stateMachine.transition('stopping', { signal });
    this.eventBus.emit('app:stopping', { signal: signal || 'unknown', timestamp: new Date() });
    
    console.log(`[Lifecycle] Shutting down (signal: ${signal || 'manual'})...`);

    try {
      await this.gracefulShutdown();
      this.stateMachine.transition('stopped');
      this.eventBus.emit('app:stopped', {
        timestamp: new Date(),
        uptime: process.uptime(),
      });
      console.log('[Lifecycle] Shutdown complete');
    } catch (error) {
      this.stateMachine.transition('error', error);
      console.error('[Lifecycle] Shutdown error:', error);
      throw error;
    }
  }

  async health(): Promise<HealthCheck> {
    const dependencyHealth = await this.checkDependencyHealth();
    const isHealthy = Object.values(dependencyHealth).every(h => h.healthy);
    
    return {
      status: isHealthy ? 'healthy' : this.stateMachine.is('error') ? 'unhealthy' : 'degraded',
      timestamp: new Date(),
      uptime: process.uptime(),
      dependencies: dependencyHealth,
      system: this.getSystemMetrics(),
    };
  }

  status(): LifecycleStatus {
    return this.stateMachine.current.status;
  }

  on(event: 'app:started' | 'app:stopping' | 'app:stopped', listener: (data?: any) => void): this {
    this.eventBus.on(event, listener);
    return this;
  }

  private async initializeDependencies(): Promise<void> {
    console.log('[Lifecycle] Initializing dependencies...');
    
    const dependencyInitPromises = [
      this.dependencies.database.initialize(),
      this.dependencies.storage.initialize(),
      this.dependencies.googleAuth.initialize(),
    ];

    if (this.config.emailService.enabled) {
      dependencyInitPromises.push(this.dependencies.emailService.initialize());
    }

    if (this.config.analyzer.enabled) {
      dependencyInitPromises.push(this.dependencies.analyzer.initialize());
    }

    const results = await Promise.allSettled(dependencyInitPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[Lifecycle] Dependency ${index} failed:`, result.reason);
        if (this.config.failFast) throw result.reason;
      }
    });

    console.log('[Lifecycle] Dependencies initialized');
  }

  private async startServices(): Promise<void> {
    console.log('[Lifecycle] Starting services...');
    
    if (this.config.scheduler.enabled) {
      await this.dependencies.scheduler.start(this.config.scheduler);
    }
    
    console.log('[Lifecycle] Services started');
  }

  private registerSignalHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    
    signals.forEach(signal => {
      const handler = () => {
        console.log(`[Lifecycle] Received ${signal}, shutting down...`);
        this.stop(signal).catch(err => {
          console.error('[Lifecycle] Shutdown error:', err);
          process.exit(1);
        });
      };
      
      process.on(signal, handler);
      (this as any)[`_handler_${signal}`] = handler;
    });
  }

  private async gracefulShutdown(): Promise<void> {
    const timeout = this.config.gracefulShutdown.timeout;
    
    const shutdownPromise = this.shutdownDependencies();
    const timeoutPromise = this.delay(timeout).then(() => {
      console.warn(`[Lifecycle] Shutdown timeout (${timeout}ms) exceeded`);
      return Promise.reject(new Error('Shutdown timeout'));
    });
    
    await Promise.race([shutdownPromise, timeoutPromise]).catch(() => {});
    await this.cleanup();
  }

  private async shutdownDependencies(): Promise<void> {
    console.log('[Lifecycle] Shutting down dependencies...');
    
    if (this.config.scheduler.enabled) {
      await this.dependencies.scheduler.stop().catch(err => {
        console.error('[Lifecycle] Scheduler stop error:', err);
      });
    }

    await Promise.allSettled([
      this.dependencies.database.close().catch(err => {
        console.error('[Lifecycle] Database close error:', err);
      }),
      this.dependencies.storage.close().catch(err => {
        console.error('[Lifecycle] Storage close error:', err);
      }),
    ]);

    if (this.dependencies.googleAuth.close) {
      await this.dependencies.googleAuth.close().catch(err => {
        console.error('[Lifecycle] GoogleAuth close error:', err);
      });
    }

    if (this.config.emailService.enabled && this.dependencies.emailService.close) {
      await this.dependencies.emailService.close().catch(err => {
        console.error('[Lifecycle] EmailService close error:', err);
      });
    }

    console.log('[Lifecycle] Dependencies shut down');
  }

  private async cleanup(): Promise<void> {
    clearTimeout(this.shutdownTimeout);
    clearInterval(this.healthCheckInterval);
    this.removeSignalHandlers();
    
    if (this.stateMachine.is('stopping')) {
      await this.delay(1000);
      console.warn('[Lifecycle] Force exit after cleanup');
      process.exit(0);
    }
  }

  private removeSignalHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    signals.forEach(signal => {
      const handler = (this as any)[`_handler_${signal}`];
      if (handler) process.removeListener(signal, handler);
    });
  }

  private async checkDependencyHealth(): Promise<Record<string, HealthStatus>> {
    const checks: Record<string, Promise<HealthStatus>> = {
      database: this.dependencies.database.ping(),
      storage: this.dependencies.storage.health(),
      googleAuth: this.dependencies.googleAuth.checkConnection(),
    };

    if (this.config.analyzer.enabled) {
      (checks as any).analyzer = this.dependencies.analyzer.health();
    }

    if (this.config.emailService.enabled) {
      (checks as any).emailService = this.dependencies.emailService.health();
    }

    const results = await Promise.allSettled(
      Object.entries(checks).map(async ([key, promise]) => [key, await promise] as [string, HealthStatus])
    );

    const health: Record<string, HealthStatus> = {};
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const [key, status] = result.value;
        health[key] = status;
      } else {
        const key = result.reason?.key || 'unknown';
        health[key] = { healthy: false, details: result.reason };
      }
    });

    Object.entries(health).forEach(([key, status]) => {
      if (!status.healthy) {
        this.eventBus.emit('health:degraded', {
          component: key,
          status,
          timestamp: new Date(),
        });
      }
    });

    return health;
  }

  private startHealthMonitoring(): void {
    if (!this.config.healthChecks.enabled) return;

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.health();
        console.log(`[Health] Status: ${health.status}, Uptime: ${Math.round(process.uptime())}s`);
      } catch (error) {
        console.error('[Health] Check failed:', error);
      }
    }, this.config.healthChecks.interval);
  }

  private getSystemMetrics() {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
      },
      cpu: {
        usage: cpuUsage.user + cpuUsage.system,
      },
      eventLoop: {
        latency: this.measureEventLoopLatency(),
      },
    };
  }

  private async measureEventLoopLatency(): Promise<number> {
    return new Promise(resolve => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const end = process.hrtime.bigint();
        resolve(Number(end - start) / 1000000);
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
