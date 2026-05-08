// Modern adaptive scheduler with backpressure handling
import { IScheduler, ScheduleConfig, SchedulerMetrics, CycleResult, TypedEventBus } from './interfaces';
import { CircuitBreaker } from './circuitBreaker';

export class AdaptiveScheduler implements IScheduler {
  private job?: NodeJS.Timeout;
  private _isRunning = false;
  private _metrics: SchedulerMetrics = {
    cyclesCompleted: 0,
    cyclesFailed: 0,
    lastRun: undefined,
    nextRun: undefined,
    averageDuration: 0,
    isRunning: false,
  };
  private circuitBreaker: CircuitBreaker;
  private cycleDurations: number[] = [];
  private readonly maxHistorySize = 50;
  private readonly eventBus: TypedEventBus;

  constructor(
    private config: ScheduleConfig,
    private cycleRunner: () => Promise<CycleResult>,
    eventBus?: TypedEventBus
  ) {
    this.eventBus = eventBus || new TypedEventBus();
    this.circuitBreaker = new CircuitBreaker(
      config.retryPolicy.maxAttempts,
      config.timeout,
      config.retryPolicy.maxDelay
    );
  }

  async schedule(config?: ScheduleConfig): Promise<void> {
    if (this._isRunning) {
      throw new SchedulerError('Scheduler is already running');
    }

    const finalConfig = { ...this.config, ...config };
    await this.start(finalConfig);
  }

  async start(config?: ScheduleConfig): Promise<void> {
    const finalConfig = config || this.config;
    
    if (this._isRunning) return;
    
    this._isRunning = true;

    const runWithJitter = () => {
      const jitter = Math.random() * finalConfig.jitter;
      return finalConfig.interval + jitter;
    };

    const executeCycle = async () => {
      if (!this._isRunning) return;

      const cycleId = this.generateCycleId();
      const startTime = Date.now();

      this.eventBus.emit('cycle:start', { cycleId, timestamp: new Date(startTime) });

      try {
        const result = await this.circuitBreaker.execute(this.cycleRunner);
        
        const duration = Date.now() - startTime;
        this.recordSuccess(duration);
        
        this.eventBus.emit('cycle:complete', {
          cycleId,
          duration,
          processed: result.processed,
          timestamp: new Date(),
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.recordFailure();
        
        this.eventBus.emit('cycle:error', {
          cycleId,
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        });

        throw error;
      }
    };

    // Initial execution
    await executeCycle().catch(() => {});

    // Schedule recurring execution
    this.job = setInterval(async () => {
      try {
        await executeCycle();
      } catch (error) {
        console.error('[Scheduler] Cycle execution failed:', error);
        
        // Adaptive backoff on repeated failures
        if (this._metrics.cyclesFailed > 3) {
          const backoffInterval = Math.min(
            finalConfig.interval * Math.pow(2, this._metrics.cyclesFailed - 3),
            finalConfig.interval * 10
          );
          console.log(`[Scheduler] Backing off to ${backoffInterval}ms`);
          this.pause();
          setTimeout(() => this.resume(), backoffInterval);
        }
      }
    }, runWithJitter());

    this.updateNextRun();
  }

  async trigger(): Promise<CycleResult> {
    if (!this._isRunning) {
      throw new SchedulerError('Scheduler is not running');
    }

    return this.circuitBreaker.execute(this.cycleRunner);
  }

  async pause(): Promise<void> {
    if (!this._isRunning || !this.job) {
      throw new SchedulerError('Scheduler is not running');
    }

    clearInterval(this.job);
    this.job = undefined;
    this._isRunning = false;
    this.updateNextRun();
  }

  async resume(): Promise<void> {
    if (this._isRunning) {
      throw new SchedulerError('Scheduler is already running');
    }

    await this.start();
  }

  async stop(): Promise<void> {
    if (this.job) {
      clearInterval(this.job);
      this.job = undefined;
    }

    this._isRunning = false;
    this.updateNextRun();
  }

  metrics(): SchedulerMetrics {
    return { ...this._metrics };
  }

  on(event: string, listener: (...args: any[]) => void): this {
    this.eventBus.on(event, listener);
    return this;
  }

  private recordSuccess(duration: number): void {
    this._metrics.cyclesCompleted++;
    this._metrics.lastRun = new Date();
    this.cycleDurations.push(duration);
    
    if (this.cycleDurations.length > this.maxHistorySize) {
      this.cycleDurations.shift();
    }

    this._metrics.averageDuration = 
      this.cycleDurations.reduce((a, b) => a + b, 0) / this.cycleDurations.length;
    this._metrics.isRunning = this._isRunning;
  }

  private recordFailure(): void {
    this._metrics.cyclesFailed++;
    this._metrics.isRunning = this._isRunning;
  }

  private updateNextRun(): void {
    if (this._isRunning) {
      this._metrics.nextRun = new Date(Date.now() + this.config.interval);
    } else {
      this._metrics.nextRun = undefined;
    }
    this._metrics.isRunning = this._isRunning;
  }

  private generateCycleId(): string {
    return `cycle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class NoopScheduler implements IScheduler {
  async schedule(): Promise<void> {}
  async start(): Promise<void> {}
  async trigger(): Promise<CycleResult> {
    return { success: true, processed: 0, failed: 0, duration: 0, candidates: [] };
  }
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async stop(): Promise<void> {}
  metrics(): SchedulerMetrics {
    return {
      cyclesCompleted: 0,
      cyclesFailed: 0,
      lastRun: undefined,
      nextRun: undefined,
      averageDuration: 0,
      isRunning: false,
    };
  }
  on(event: string, listener: (...args: any[]) => void): this {
    return this;
  }
}

export class SchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerError';
  }
}