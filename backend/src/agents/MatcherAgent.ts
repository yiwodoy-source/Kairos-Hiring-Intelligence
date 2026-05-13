import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import { assessCandidateAgainstJobs } from '../services/hr_agent/decision_engine';
import { getDb } from '../db';

export class MatcherAgent extends AgentBase {
  constructor(registry: AgentRegistry, bus: MessageBus) {
    super('matcher', registry, bus);
  }

  getCapabilities(): TaskType[] {
    return ['match_jobs'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    const { analysis, subject, applicationContent, ...rest } = task.payload;

    const db = await getDb();
    const openJobs = await db.all<any>(
      `SELECT id, title, location, description, requirements, status
       FROM jobs WHERE status = 'Open'`
    );

    const assessment = assessCandidateAgainstJobs(analysis, openJobs, {
      subject: subject || '',
      applicationContent: applicationContent || '',
    });

    return { analysis, assessment, subject, applicationContent, ...rest };
  }
}
