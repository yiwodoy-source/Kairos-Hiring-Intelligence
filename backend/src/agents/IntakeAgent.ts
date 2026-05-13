import crypto from 'crypto';
import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import type { TaskQueue } from './base/TaskQueue';
import { checkNewEmails, markAsProcessed } from '../services/hr_agent/gmail_listener';
import { extractTextFromPdf } from '../services/hr_agent/pdf_parser';
import { log } from '../lib/logger';
import { errMsg } from '../lib/errMsg';

export class IntakeAgent extends AgentBase {
  private pollTimer?: NodeJS.Timeout;
  private readonly queue: TaskQueue;
  private isPolling = false;

  constructor(registry: AgentRegistry, bus: MessageBus, queue: TaskQueue) {
    super('intake', registry, bus);
    this.queue = queue;
  }

  getCapabilities(): TaskType[] {
    return ['ingest_emails', 'extract_cv_text', 'mark_email_processed'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    switch (task.taskType) {
      case 'ingest_emails':
        return this.ingestEmails();
      case 'extract_cv_text':
        return this.extractCvText(task);
      case 'mark_email_processed':
        return this.markProcessed(task);
      default:
        throw new Error(`IntakeAgent cannot handle: ${task.taskType}`);
    }
  }

  private async ingestEmails(): Promise<Record<string, any>> {
    const cvs = await checkNewEmails();
    log.info(`[IntakeAgent] ${cvs.length} new CV(s) found`);

    const taskIds: string[] = [];
    const maxPerCycle = Math.min(
      parseInt(process.env.MAX_CVS_PER_CYCLE || '10', 10),
      50
    );

    for (const cv of cvs.slice(0, maxPerCycle)) {
      const taskId = crypto.randomUUID();
      taskIds.push(taskId);
      await this.queue.enqueue({
        taskId,
        taskType: 'extract_cv_text',
        status: 'pending',
        priority: 3,
        maxRetries: 3,
        payload: {
          email: cv.email,
          senderName: cv.senderName,
          fileName: cv.fileName,
          messageId: cv.messageId,
          subject: cv.subject,
          applicationContent: cv.applicationContent,
          source: cv.source,
          attachmentBufferBase64: cv.attachmentBuffer.toString('base64'),
        },
      });
    }

    if (taskIds.length > 0) {
      this.bus.emit('task:new', { count: taskIds.length, type: 'extract_cv_text' });
    }
    return { ingested: cvs.length, queued: taskIds.length, taskIds };
  }

  private async extractCvText(task: Task): Promise<Record<string, any>> {
    const { attachmentBufferBase64, ...rest } = task.payload;
    const buffer = Buffer.from(attachmentBufferBase64, 'base64');
    const cvText = await extractTextFromPdf(buffer);
    // Don't forward the raw buffer downstream — keep payload lean
    return { ...rest, cvText };
  }

  private async markProcessed(task: Task): Promise<Record<string, any>> {
    const { messageId, email, subject, status } = task.payload;
    await markAsProcessed(messageId, email, subject, status);
    return { marked: true, messageId };
  }

  protected async onStart(): Promise<void> {
    const intervalMs = this.parseCronIntervalMs();
    this.pollTimer = setInterval(() => {
      this.triggerIngest().catch((err) =>
        log.warn(`[IntakeAgent] trigger error: ${errMsg(err)}`)
      );
    }, intervalMs);
    log.info(`[IntakeAgent] polling every ${intervalMs / 1000}s`);
  }

  protected async onStop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async triggerIngest(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const taskId = crypto.randomUUID();
      await this.queue.enqueue({
        taskId,
        taskType: 'ingest_emails',
        status: 'pending',
        priority: 1,
        maxRetries: 2,
        payload: {},
      });
      this.bus.emit('task:new', { type: 'ingest_emails' });
    } finally {
      this.isPolling = false;
    }
  }

  private parseCronIntervalMs(): number {
    const cron = process.env.CRON_INTERVAL || '*/1 * * * *';
    const match = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
    return match ? parseInt(match[1], 10) * 60_000 : 60_000;
  }
}
