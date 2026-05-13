import type { DbAdapter } from '../../db';
import type { AgentRecord, AgentType } from '../types';

export class AgentRegistry {
  constructor(private readonly db: DbAdapter) {}

  async register(agent: AgentRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO agent_registry (
         agent_id, agent_type, capabilities, public_key, version,
         status, current_load, last_heartbeat, started_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(agent_id) DO UPDATE SET
         status        = 'active',
         current_load  = excluded.current_load,
         last_heartbeat = CURRENT_TIMESTAMP`,
      [
        agent.agentId,
        agent.agentType,
        JSON.stringify(agent.capabilities),
        agent.publicKey,
        agent.version,
        agent.status,
        agent.currentLoad,
      ]
    );
  }

  async deregister(agentId: string): Promise<void> {
    await this.db.run(
      `UPDATE agent_registry SET status = 'dead' WHERE agent_id = ?`,
      [agentId]
    );
  }

  async heartbeat(agentId: string, load: number): Promise<void> {
    await this.db.run(
      `UPDATE agent_registry
       SET last_heartbeat = CURRENT_TIMESTAMP, current_load = ?, status = 'active'
       WHERE agent_id = ?`,
      [load, agentId]
    );
  }

  async getActive(): Promise<AgentRecord[]> {
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    const rows = await this.db.all<any>(
      `SELECT * FROM agent_registry
       WHERE status != 'dead' AND last_heartbeat > ?`,
      [cutoff]
    );
    return rows.map(this.rowToRecord);
  }

  async getByType(agentType: AgentType): Promise<AgentRecord[]> {
    const active = await this.getActive();
    return active.filter((a) => a.agentType === agentType);
  }

  async getPublicKey(agentId: string): Promise<string | null> {
    const row = await this.db.get<{ public_key: string }>(
      `SELECT public_key FROM agent_registry WHERE agent_id = ?`,
      [agentId]
    );
    return row?.public_key ?? null;
  }

  async markStaleDead(): Promise<void> {
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    await this.db.run(
      `UPDATE agent_registry
       SET status = 'dead'
       WHERE last_heartbeat < ? AND status != 'dead'`,
      [cutoff]
    );
  }

  async getAll(): Promise<AgentRecord[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM agent_registry ORDER BY started_at DESC`
    );
    return rows.map(this.rowToRecord);
  }

  private rowToRecord(row: any): AgentRecord {
    return {
      agentId: row.agent_id,
      agentType: row.agent_type,
      capabilities: JSON.parse(row.capabilities || '[]'),
      publicKey: row.public_key,
      version: row.version,
      status: row.status,
      currentLoad: row.current_load ?? 0,
      lastHeartbeat: row.last_heartbeat,
      startedAt: row.started_at,
    };
  }
}
