// Circuit Breaker Pattern Implementation
import { ICircuitBreaker, CircuitBreakerOpenError, CircuitBreakerTimeoutError } from './interfaces';

export class CircuitBreaker implements ICircuitBreaker {
  public state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTimeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        console.log('[CircuitBreaker] Transitioning to half-open state');
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open. Next attempt at ${this.nextAttemptTime}`
        );
      }
    }

    const startTime = Date.now();
    try {
      const result = await this.withTimeout(fn());
      this.recordSuccess(startTime);
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) return false;
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timerId = setTimeout(
        () => reject(new CircuitBreakerTimeoutError('Execution timeout')),
        this.timeout
      );
      promise.then(
        (value) => { clearTimeout(timerId); resolve(value); },
        (err) => { clearTimeout(timerId); reject(err); }
      );
    });
  }

  private recordSuccess(startTime: number): void {
    if (this.state === 'half-open') {
      console.log('[CircuitBreaker] Success in half-open state, closing circuit');
      this.reset();
    }
    this.failures = 0;
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.nextAttemptTime = new Date(Date.now() + this.resetTimeout);
      console.log(
        `[CircuitBreaker] Circuit opened. Next attempt at ${this.nextAttemptTime}`
      );
    }
  }

  public reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    console.log('[CircuitBreaker] Circuit reset to closed state');
  }
}