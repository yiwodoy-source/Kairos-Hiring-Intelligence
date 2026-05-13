import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import { sendAutomatedReply, sendInterviewConfirmation } from '../services/hr_agent/email_responder';

export class OutreachAgent extends AgentBase {
  constructor(registry: AgentRegistry, bus: MessageBus) {
    super('outreach', registry, bus);
  }

  getCapabilities(): TaskType[] {
    return ['send_reply'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    const { email, candidateName, status, role, type } = task.payload;

    if (type === 'interview_confirmation') {
      const { startTime, meetLink } = task.payload;
      await sendInterviewConfirmation(email, candidateName, role, startTime, meetLink);
      return { sent: true, to: email, type: 'interview_confirmation' };
    }

    await sendAutomatedReply(email, candidateName, status, role);
    return { sent: true, to: email, status };
  }
}
