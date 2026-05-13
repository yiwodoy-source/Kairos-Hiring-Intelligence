import crypto from 'crypto';
import { EventEmitter } from 'events';
import type { AgentIdentity, AgentRecord, AgentType, BidResponse, Task, TaskOffer, TaskType } from '../types';
import type { AgentRegistry } from './AgentRegistry';
import type { MessageBus } from './MessageBus';
import { log } from '../../lib/logger';

export abstract class AgentBase extends EventEmitter {
  readonly agentId: string;
  readonly agentType: AgentType;
  readonly version = '1.0.0';

  private readonly _privateKeyDer: Buffer;
  private readonly _publicKeyHex: string;
  private _heartbeatTimer?: NodeJS.Timeout;
  private _currentLoad = 0;

  protected readonly registry: AgentRegistry;
  protected readonly bus: MessageBus;

  constructor(agentType: AgentType, registry: AgentRegistry, bus: MessageBus) {
    super();
    this.agentType = agentType;
    this.agentId = crypto.randomUUID();
    this.registry = registry;
    this.bus = bus;

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      publicKeyEncoding: { type: 'spki', format: 'der' },
    } as any);

    this._privateKeyDer = privateKey as unknown as Buffer;
    this._publicKeyHex = (publicKey as unknown as Buffer).toString('hex');
  }

  get identity(): AgentIdentity {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      capabilities: this.getCapabilities(),
      publicKey: this._publicKeyHex,
      version: this.version,
      startedAt: new Date().toISOString(),
    };
  }

  get currentLoad(): number {
    return this._currentLoad;
  }

  abstract getCapabilities(): TaskType[];
  abstract handleTask(task: Task): Promise<Record<string, any>>;

  canHandle(taskType: TaskType): boolean {
    return this.getCapabilities().includes(taskType);
  }

  bid(offer: TaskOffer): BidResponse | null {
    if (!this.canHandle(offer.taskType)) return null;
    return {
      taskId: offer.taskId,
      agentId: this.agentId,
      agentType: this.agentType,
      estimatedMs: 2000 + this._currentLoad * 500,
      currentLoad: this._currentLoad,
    };
  }

  sign(payload: Record<string, any>): string {
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const privateKey = crypto.createPrivateKey({
      key: this._privateKeyDer,
      type: 'pkcs8',
      format: 'der',
    } as any);
    return crypto.sign(null, data, privateKey).toString('hex');
  }

  verify(payload: Record<string, any>, signature: string, publicKeyHex: string): boolean {
    try {
      const data = Buffer.from(JSON.stringify(payload), 'utf8');
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(publicKeyHex, 'hex'),
        type: 'spki',
        format: 'der',
      } as any);
      return crypto.verify(null, data, publicKey, Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  incrementLoad(): void {
    this._currentLoad++;
  }

  decrementLoad(): void {
    this._currentLoad = Math.max(0, this._currentLoad - 1);
  }

  async start(): Promise<void> {
    const record: AgentRecord = {
      ...this.identity,
      status: 'active',
      currentLoad: 0,
      lastHeartbeat: new Date().toISOString(),
    };
    await this.registry.register(record);

    this._heartbeatTimer = setInterval(async () => {
      try {
        await this.registry.heartbeat(this.agentId, this._currentLoad);
      } catch {
        // heartbeat failure is non-fatal
      }
    }, 30_000);

    log.info(`[kairos:${this.agentType}] started`, { agentId: this.agentId.slice(0, 8) });
    await this.onStart();
  }

  async stop(): Promise<void> {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    try { await this.registry.deregister(this.agentId); } catch {}
    await this.onStop();
    log.info(`[kairos:${this.agentType}] stopped`, { agentId: this.agentId.slice(0, 8) });
  }

  protected async onStart(): Promise<void> {}
  protected async onStop(): Promise<void> {}
}
