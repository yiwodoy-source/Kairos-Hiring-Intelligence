// Core interfaces for dependency injection
import { EventEmitter } from 'events';

// --- Circuit Breaker Interface ---
export interface ICircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  state: 'closed' | 'open' | 'half-open';
  reset(): void;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreakerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

// --- State Types ---
export type LifecycleStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface LifecycleState {
  status: LifecycleStatus;
  timestamp: Date;
  details?: any;
}

export interface SchedulerMetrics {
  cyclesCompleted: number;
  cyclesFailed: number;
  lastRun?: Date;
  nextRun?: Date;
  averageDuration: number;
  isRunning: boolean;
}

export interface HealthStatus {
  healthy: boolean;
  responseTime?: number;
  details?: any;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  dependencies: Record<string, HealthStatus>;
  system: SystemMetrics;
}

export interface SystemMetrics {
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu: {
    usage: number;
  };
  eventLoop: {
    latency: Promise<number>;
  };
}

export interface ScheduleConfig {
  enabled: boolean;
  interval: number;
  jitter: number;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: 'exponential' | 'linear' | 'constant';
  initialDelay: number;
  maxDelay: number;
}

export interface ProcessedCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string;
  years_experience: number;
  current_role: string;
  skills: string[];
  achievements: string[];
  overall_score: number;
  breakdown_score: Record<string, number>;
  decision_status: 'Shortlisted' | 'Review Required' | 'Rejected';
  ai_reasoning: Record<string, string>;
  drive_file_link: string;
  created_at: Date;
  sourcingSource?: string;
  sourcingStage?: string;
}

export interface IncomingCV {
  email: string;
  senderName: string;
  attachmentBuffer: Buffer;
  fileName: string;
  messageId: string;
}

export interface CycleResult {
  success: boolean;
  processed: number;
  failed: number;
  duration: number;
  candidates: ProcessedCandidate[];
  errors?: Error[];
}

export interface CandidateFilter {
  status?: string;
  minScore?: number;
  maxScore?: number;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

// --- Lifecycle Interfaces ---
export interface ILifecycleManager {
  start(): Promise<void>;
  stop(signal?: string): Promise<void>;
  status(): LifecycleStatus;
  health(): Promise<HealthCheck>;
  on(event: string, listener: (...args: any[]) => void): this;
}

export interface IScheduler {
  schedule(config?: ScheduleConfig): Promise<void>;
  start(config?: ScheduleConfig): Promise<void>;
  trigger(): Promise<CycleResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  metrics(): SchedulerMetrics;
  on(event: string, listener: (...args: any[]) => void): this;
}

// --- Service Interfaces ---
export interface IDatabase {
  initialize(): Promise<void>;
  getConnection(): Promise<any>;
  query<T = any>(sql: string, params?: any[]): Promise<T>;
  close(): Promise<void>;
  ping(): Promise<HealthStatus>;
}

export interface IStorage {
  initialize(): Promise<void>;
  saveCandidate(candidate: ProcessedCandidate): Promise<void>;
  getCandidates(filter?: CandidateFilter): Promise<ProcessedCandidate[]>;
  close(): Promise<void>;
  health(): Promise<HealthStatus>;
}

export interface IEmailService {
  initialize(): Promise<void>;
  getUnreadCVs(): Promise<IncomingCV[]>;
  markAsRead(messageId: string): Promise<void>;
  sendAutomatedReply(to: string, candidateName: string, status: string, role: string): Promise<void>;
  health(): Promise<HealthStatus>;
  close?(): Promise<void>;
}

export interface IAnalyzer {
  initialize(): Promise<void>;
  analyzeCV(cvText: string): Promise<CycleResult>;
  health(): Promise<HealthStatus>;
}

export interface IDriveService {
  upload(file: Buffer, fileName: string): Promise<string>;
  health(): Promise<HealthStatus>;
}

export interface ISheetsService {
  logCandidate(candidate: ProcessedCandidate): Promise<void>;
  health(): Promise<HealthStatus>;
}

export interface IGoogleAuth {
  initialize(): Promise<void>;
  getClient(): any;
  checkConnection(): Promise<HealthStatus>;
  close?(): Promise<void>;
}

// --- Event Bus ---
export class TypedEventBus extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

// --- Lifecycle Config ---
export interface LifecycleConfig {
  scheduler: ScheduleConfig;
  emailService: {
    enabled: boolean;
  };
  analyzer: {
    enabled: boolean;
  };
  healthChecks: {
    enabled: boolean;
    interval: number;
  };
  gracefulShutdown: {
    timeout: number;
  };
  failFast: boolean;
}

export interface LifecycleDependencies {
  database: IDatabase;
  storage: IStorage;
  scheduler: IScheduler;
  googleAuth: IGoogleAuth;
  emailService: IEmailService;
  analyzer: IAnalyzer;
  driveService: IDriveService;
  sheetsService: ISheetsService;
}
