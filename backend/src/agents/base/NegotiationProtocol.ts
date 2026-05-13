import type { AgentRecord, Task, TaskType } from '../types';
import type { AgentRegistry } from './AgentRegistry';

export class NegotiationProtocol {
  constructor(private readonly registry: AgentRegistry) {}

  /**
   * Select the best available agent for a task.
   * Strategy: lowest load among agents that can handle the task type.
   */
  async selectAgent(task: Task): Promise<AgentRecord | null> {
    const activeAgents = await this.registry.getActive();
    const candidates = activeAgents.filter(
      (a) =>
        a.status !== 'dead' &&
        (a.capabilities as TaskType[]).includes(task.taskType)
    );

    if (candidates.length === 0) return null;

    // Sort by load ascending — pick lightest agent
    candidates.sort((a, b) => a.currentLoad - b.currentLoad);
    return candidates[0];
  }

  /**
   * Verify an agent's identity by checking its signature against its registered public key.
   */
  async verifyAgent(agentId: string, payload: Record<string, any>, signature: string): Promise<boolean> {
    const publicKeyHex = await this.registry.getPublicKey(agentId);
    if (!publicKeyHex) return false;

    try {
      const crypto = await import('crypto');
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
}
