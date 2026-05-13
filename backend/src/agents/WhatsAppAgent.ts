import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import { sendWhatsAppMessage, recordInbound } from '../services/whatsapp/whatsapp_client';
import { buildFromStatus } from '../services/whatsapp/whatsapp_templates';
import { logAgentActivity } from '../services/hr_agent/logger';
import { log } from '../lib/logger';

export class WhatsAppAgent extends AgentBase {
  constructor(registry: AgentRegistry, bus: MessageBus) {
    super('whatsapp', registry, bus);
  }

  getCapabilities(): TaskType[] {
    return ['send_whatsapp', 'receive_whatsapp'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    switch (task.taskType) {
      case 'send_whatsapp':
        return this.sendMessage(task);
      case 'receive_whatsapp':
        return this.processInbound(task);
      default:
        throw new Error(`WhatsAppAgent cannot handle: ${task.taskType}`);
    }
  }

  private async sendMessage(task: Task): Promise<Record<string, any>> {
    const {
      phone,
      candidateName,
      status,
      role,
      email,
      interviewDateTime,
      meetLink,
    } = task.payload;

    if (!phone) throw new Error('send_whatsapp: phone number required');

    const message = buildFromStatus(
      status || 'Acknowledged',
      candidateName || 'Candidate',
      role || 'the position',
      { dateTime: interviewDateTime, meetLink }
    );

    const result = await sendWhatsAppMessage(phone, message, email);

    logAgentActivity(
      `[WhatsApp] ${status || 'Ack'} → ${phone}: ${result.success ? 'delivered' : 'failed'}`
    );

    log.info('[WhatsAppAgent] send_whatsapp', {
      phone,
      status,
      success: result.success,
    });

    return {
      whatsappSent: result.success,
      phone,
      candidateName,
      status,
      error: result.error ?? null,
    };
  }

  private async processInbound(task: Task): Promise<Record<string, any>> {
    const { phone, body, candidateEmail } = task.payload;

    if (!phone || !body) throw new Error('receive_whatsapp: phone and body required');

    await recordInbound(phone, body, candidateEmail);

    logAgentActivity(`[WhatsApp] Inbound from ${phone}: "${body.slice(0, 80)}"`);

    return { recorded: true, phone, bodyLength: body.length };
  }
}
