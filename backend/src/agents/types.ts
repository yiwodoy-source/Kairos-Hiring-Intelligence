export type AgentType =
  | 'orchestrator'
  | 'intake'
  | 'analyzer'
  | 'matcher'
  | 'outreach'
  | 'scheduler'
  | 'sourcer'
  | 'whatsapp';

export type TaskType =
  | 'ingest_emails'
  | 'extract_cv_text'
  | 'analyze_cv'
  | 'match_jobs'
  | 'persist_candidate'
  | 'upload_cv_drive'
  | 'log_to_sheets'
  | 'send_reply'
  | 'mark_email_processed'
  | 'schedule_interview'
  | 'source_candidates'
  | 'send_whatsapp'
  | 'receive_whatsapp';

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'done' | 'failed' | 'cancelled';

export interface AgentIdentity {
  agentId: string;
  agentType: AgentType;
  capabilities: TaskType[];
  publicKey: string;
  version: string;
  startedAt: string;
}

export interface AgentRecord extends AgentIdentity {
  status: 'active' | 'busy' | 'dead';
  currentLoad: number;
  lastHeartbeat: string;
}

export interface Task {
  taskId: string;
  taskType: TaskType;
  status: TaskStatus;
  priority: number;
  payload: Record<string, any>;
  assignedTo?: string;
  parentTaskId?: string;
  result?: Record<string, any>;
  error?: string;
  retries: number;
  maxRetries: number;
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskOffer {
  taskId: string;
  taskType: TaskType;
  priority: number;
}

export interface BidResponse {
  taskId: string;
  agentId: string;
  agentType: AgentType;
  estimatedMs: number;
  currentLoad: number;
}

export interface AgentMessage {
  messageId: string;
  fromAgent: string;
  toAgent: string;
  messageType:
    | 'task_offer'
    | 'bid'
    | 'assignment'
    | 'result'
    | 'heartbeat'
    | 'status_update';
  payload: Record<string, any>;
  signature: string;
  createdAt: string;
}
