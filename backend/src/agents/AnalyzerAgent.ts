import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import { analyzeCandidateCV } from '../services/hr_agent/ai_analyzer';

export class AnalyzerAgent extends AgentBase {
  constructor(registry: AgentRegistry, bus: MessageBus) {
    super('analyzer', registry, bus);
  }

  getCapabilities(): TaskType[] {
    return ['analyze_cv'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    const {
      cvText,
      email,
      senderName,
      fileName,
      messageId,
      subject,
      applicationContent,
      source,
    } = task.payload;

    const analysis = await analyzeCandidateCV(cvText);

    return {
      analysis,
      email,
      senderName,
      fileName,
      messageId,
      subject,
      applicationContent,
      source,
    };
  }
}
