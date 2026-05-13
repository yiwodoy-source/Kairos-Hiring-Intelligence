import crypto from 'crypto';
import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import type { TaskQueue } from './base/TaskQueue';
import { log } from '../lib/logger';
import { errMsg } from '../lib/errMsg';

export class SourcerAgent extends AgentBase {
  private readonly queue: TaskQueue;

  constructor(registry: AgentRegistry, bus: MessageBus, queue: TaskQueue) {
    super('sourcer', registry, bus);
    this.queue = queue;
  }

  getCapabilities(): TaskType[] {
    return ['source_candidates'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    const { jobId, jobTitle, platform, limit = 10 } = task.payload;

    log.info(`[SourcerAgent] sourcing for "${jobTitle}" via ${platform || 'auto'}`);
    const candidates = await this.fetchCandidates({ jobId, jobTitle, platform, limit });

    const taskIds: string[] = [];
    for (const candidate of candidates) {
      const taskId = crypto.randomUUID();
      taskIds.push(taskId);
      await this.queue.enqueue({
        taskId,
        taskType: 'analyze_cv',
        status: 'pending',
        priority: 6,
        maxRetries: 2,
        payload: {
          cvText: candidate.profileText || candidate.about || candidate.headline || '',
          email: candidate.email || `sourced-${crypto.randomUUID().slice(0, 8)}@unknown.internal`,
          senderName: candidate.name || 'Sourced Candidate',
          source: platform || 'Sourced',
          messageId: `sourced-${taskId}`,
          subject: `Sourced Application: ${jobTitle}`,
          applicationContent: candidate.about || '',
          profileUrl: candidate.profileUrl || '',
          isSourced: true,
        },
      });
    }

    if (taskIds.length > 0) {
      this.bus.emit('task:new', { count: taskIds.length, type: 'analyze_cv' });
    }

    return { sourced: candidates.length, queued: taskIds.length, jobTitle, platform };
  }

  private async fetchCandidates(params: {
    jobId?: string;
    jobTitle: string;
    platform?: string;
    limit: number;
  }): Promise<any[]> {
    try {
      // Route to platform-specific sourcer based on params.platform
      switch (params.platform?.toLowerCase()) {
        case 'github': {
          const { sourceFromGitHub } = await import('../services/sourcer/github_sourcer');
          const results = await sourceFromGitHub([{ title: params.jobTitle, limit: params.limit }]);
          return results.flatMap((r: any) => r.candidates || []);
        }
        default:
          // No active sourcer configured — return empty; platform-specific
          // sourcing can be triggered via the /api/hr-agent/source/* routes
          return [];
      }
    } catch (err) {
      log.warn(`[SourcerAgent] sourcing failed: ${errMsg(err)}`);
      return [];
    }
  }
}
