import { getDb } from '../db';
import { AgentRegistry } from './base/AgentRegistry';
import { TaskQueue } from './base/TaskQueue';
import { MessageBus } from './base/MessageBus';
import { OrchestratorAgent } from './OrchestratorAgent';
import { IntakeAgent } from './IntakeAgent';
import { AnalyzerAgent } from './AnalyzerAgent';
import { MatcherAgent } from './MatcherAgent';
import { OutreachAgent } from './OutreachAgent';
import { SchedulerAgent } from './SchedulerAgent';
import { SourcerAgent } from './SourcerAgent';
import { WhatsAppAgent } from './WhatsAppAgent';
import { log } from '../lib/logger';

let orchestrator: OrchestratorAgent | null = null;
let registry: AgentRegistry | null = null;
let queue: TaskQueue | null = null;

export async function startKairosSwarm(): Promise<OrchestratorAgent> {
  if (orchestrator) return orchestrator;

  const db = await getDb();
  registry = new AgentRegistry(db);
  queue = new TaskQueue(db);
  const bus = new MessageBus();

  const intake = new IntakeAgent(registry, bus, queue);
  const analyzer = new AnalyzerAgent(registry, bus);
  const matcher = new MatcherAgent(registry, bus);
  const outreach = new OutreachAgent(registry, bus);
  const scheduler = new SchedulerAgent(registry, bus);
  const sourcer = new SourcerAgent(registry, bus, queue);
  const whatsapp = new WhatsAppAgent(registry, bus);

  orchestrator = new OrchestratorAgent(registry, bus, queue);
  orchestrator.registerAgent(intake);
  orchestrator.registerAgent(analyzer);
  orchestrator.registerAgent(matcher);
  orchestrator.registerAgent(outreach);
  orchestrator.registerAgent(scheduler);
  orchestrator.registerAgent(sourcer);
  orchestrator.registerAgent(whatsapp);

  // Start specialized agents first (they register in DB, start heartbeats)
  await Promise.all([
    intake.start(),
    analyzer.start(),
    matcher.start(),
    outreach.start(),
    scheduler.start(),
    sourcer.start(),
    whatsapp.start(),
  ]);

  // Orchestrator starts last — begins dispatching once agents are registered
  await orchestrator.start();

  log.info('[Kairos] Swarm online', { agents: 8 });
  return orchestrator;
}

export async function stopKairosSwarm(): Promise<void> {
  if (!orchestrator) return;
  await orchestrator.stop();
  orchestrator = null;
  log.info('[Kairos] Swarm offline');
}

export function getKairosSwarm(): OrchestratorAgent | null {
  return orchestrator;
}

export function getKairosRegistry(): AgentRegistry | null {
  return registry;
}

export function getKairosQueue(): TaskQueue | null {
  return queue;
}

export function getKairosStatus() {
  if (!orchestrator) return { status: 'stopped' as const, agents: [] };
  return {
    status: 'running' as const,
    ...orchestrator.getSwarmStatus(),
  };
}
