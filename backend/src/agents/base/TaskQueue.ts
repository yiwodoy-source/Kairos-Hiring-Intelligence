import type { DbAdapter } from '../../db';
import type { Task, TaskStatus, TaskType } from '../types';

export class TaskQueue {
  constructor(private readonly db: DbAdapter) {}

  async enqueue(task: {
    taskId: string;
    taskType: TaskType;
    status: TaskStatus;
    priority: number;
    payload: Record<string, any>;
    parentTaskId?: string;
    maxRetries?: number;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO agent_tasks (
         task_id, task_type, status, priority, payload,
         parent_task_id, max_retries, created_at
       ) VALUES (?, ?, 'pending', ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(task_id) DO NOTHING`,
      [
        task.taskId,
        task.taskType,
        task.priority ?? 5,
        JSON.stringify(task.payload),
        task.parentTaskId ?? null,
        task.maxRetries ?? 3,
      ]
    );
  }

  async claimNext(agentId: string, taskTypes: TaskType[]): Promise<Task | null> {
    if (taskTypes.length === 0) return null;
    const placeholders = taskTypes.map(() => '?').join(', ');

    const row = await this.db.get<any>(
      `SELECT * FROM agent_tasks
       WHERE status = 'pending'
         AND task_type IN (${placeholders})
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`,
      [...taskTypes]
    );
    if (!row) return null;

    const updated = await this.db.run(
      `UPDATE agent_tasks
       SET status = 'assigned', assigned_to = ?, assigned_at = CURRENT_TIMESTAMP
       WHERE task_id = ? AND status = 'pending'`,
      [agentId, row.task_id]
    );

    if ((updated.changes ?? 0) === 0) return null;
    return this.rowToTask(row);
  }

  async markRunning(taskId: string): Promise<void> {
    await this.db.run(
      `UPDATE agent_tasks
       SET status = 'running', started_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [taskId]
    );
  }

  async complete(taskId: string, result: Record<string, any>): Promise<void> {
    await this.db.run(
      `UPDATE agent_tasks
       SET status = 'done', result = ?, completed_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [JSON.stringify(result), taskId]
    );
  }

  async fail(taskId: string, error: string): Promise<void> {
    await this.db.run(
      `UPDATE agent_tasks
       SET status = 'failed',
           error = ?,
           retries = retries + 1,
           completed_at = CURRENT_TIMESTAMP
       WHERE task_id = ?`,
      [error, taskId]
    );
  }

  async requeueFailed(): Promise<void> {
    const cutoff = new Date(Date.now() - 3_600_000).toISOString();
    await this.db.run(
      `UPDATE agent_tasks
       SET status = 'pending', assigned_to = NULL, error = NULL
       WHERE status = 'failed'
         AND retries < max_retries
         AND created_at > ?`,
      [cutoff]
    );
  }

  async pendingCount(taskType?: TaskType): Promise<number> {
    const row = taskType
      ? await this.db.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM agent_tasks WHERE status = 'pending' AND task_type = ?`,
          [taskType]
        )
      : await this.db.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM agent_tasks WHERE status = 'pending'`
        );
    return Number(row?.count ?? 0);
  }

  async getTask(taskId: string): Promise<Task | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM agent_tasks WHERE task_id = ?`,
      [taskId]
    );
    return row ? this.rowToTask(row) : null;
  }

  async getByParent(parentTaskId: string): Promise<Task[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM agent_tasks WHERE parent_task_id = ? ORDER BY created_at ASC`,
      [parentTaskId]
    );
    return rows.map(this.rowToTask);
  }

  async getRecent(limit = 50): Promise<Task[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map(this.rowToTask);
  }

  private rowToTask(row: any): Task {
    return {
      taskId: row.task_id,
      taskType: row.task_type,
      status: row.status,
      priority: row.priority,
      payload: JSON.parse(row.payload || '{}'),
      assignedTo: row.assigned_to ?? undefined,
      parentTaskId: row.parent_task_id ?? undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ?? undefined,
      retries: row.retries ?? 0,
      maxRetries: row.max_retries ?? 3,
      createdAt: row.created_at,
      assignedAt: row.assigned_at ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }
}
