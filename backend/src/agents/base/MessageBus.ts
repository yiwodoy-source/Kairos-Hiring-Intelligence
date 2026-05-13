import { EventEmitter } from 'events';
import type { AgentMessage } from '../types';

type BusEvent =
  | 'task:new'
  | 'task:complete'
  | 'task:failed'
  | 'agent:registered'
  | 'agent:dead'
  | 'message';

export class MessageBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(event: BusEvent, data: any): void {
    this.emitter.emit(event, data);
  }

  on(event: BusEvent, handler: (data: any) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: BusEvent, handler: (data: any) => void): void {
    this.emitter.off(event, handler);
  }

  once(event: BusEvent, handler: (data: any) => void): void {
    this.emitter.once(event, handler);
  }

  send(message: AgentMessage): void {
    this.emitter.emit('message', message);
    this.emitter.emit(`msg:${message.toAgent}`, message);
  }

  listenFor(agentId: string, handler: (msg: AgentMessage) => void): void {
    this.emitter.on(`msg:${agentId}`, handler);
  }

  stopListeningFor(agentId: string, handler: (msg: AgentMessage) => void): void {
    this.emitter.off(`msg:${agentId}`, handler);
  }
}
