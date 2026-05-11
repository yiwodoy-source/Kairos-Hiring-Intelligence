// State machine for lifecycle management
import { LifecycleState, LifecycleStatus } from './interfaces';

export class LifecycleStateMachine {
  private state: LifecycleState;
  private history: LifecycleState[] = [];
  private listeners: Set<(state: LifecycleState) => void> = new Set();

  constructor(initialStatus: LifecycleStatus = 'idle') {
    this.state = {
      status: initialStatus,
      timestamp: new Date(),
    };
    this.history.push({ ...this.state });
  }

  /** Transition to a new state with validation */
  transition(to: LifecycleStatus, details?: any): void {
    const from = this.state.status;
    
    if (!this.isValidTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }

    const previousState = { ...this.state };
    this.state = {
      status: to,
      timestamp: new Date(),
      details,
    };
    
    this.history.push({ ...this.state });
    
    // Keep only last 100 states
    if (this.history.length > 100) {
      this.history.shift();
    }

    // Notify listeners
    this.notifyListeners();

    console.log(`[StateMachine] ${from} → ${to}`, details || '');
  }

  /** Get current state */
  get current(): LifecycleState {
    return { ...this.state };
  }

  /** Get state history */
  get historySnapshot(): LifecycleState[] {
    return [...this.history];
  }

  /** Check if in specific state */
  is(status: LifecycleStatus): boolean {
    return this.state.status === status;
  }

  /** Subscribe to state changes */
  subscribe(listener: (state: LifecycleState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notify all listeners; collect and re-throw any errors after all listeners run */
  private notifyListeners(): void {
    const errors: unknown[] = [];
    this.listeners.forEach(listener => {
      try {
        listener({ ...this.state });
      } catch (error) {
        console.error('[StateMachine] Listener error:', error);
        errors.push(error);
      }
    });
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} state machine listener(s) threw`);
  }

  /** Validate state transitions */
  private isValidTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
    const transitions: Record<LifecycleStatus, LifecycleStatus[]> = {
      idle: ['starting', 'stopped'],
      starting: ['running', 'error', 'stopping'],
      running: ['stopping', 'error'],
      stopping: ['stopped', 'error'],
      stopped: ['starting'],
      error: ['stopping', 'starting'],
    };

    return transitions[from]?.includes(to) || false;
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

// Extended state machine with metrics
export class MetricsStateMachine extends LifecycleStateMachine {
  private stateDurations: Map<string, number> = new Map();
  private stateEntryTime: number = Date.now();

  transition(to: LifecycleStatus, details?: any): void {
    // Record duration in previous state
    const duration = Date.now() - this.stateEntryTime;
    const from = (this as any).current.status;
    const key = `${from}→${to}`;
    
    this.stateDurations.set(key, 
      (this.stateDurations.get(key) || 0) + duration
    );

    super.transition(to, details);
    this.stateEntryTime = Date.now();
  }

  /** Get average duration for a transition */
  getAverageDuration(transition: string): number {
    return this.stateDurations.get(transition) || 0;
  }

  /** Get all state durations */
  getStateDurations(): Map<string, number> {
    return new Map(this.stateDurations);
  }
}