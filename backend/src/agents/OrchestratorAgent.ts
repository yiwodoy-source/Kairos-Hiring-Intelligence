import crypto from 'crypto';
import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import { TaskQueue } from './base/TaskQueue';
import { MessageBus } from './base/MessageBus';
import { NegotiationProtocol } from './base/NegotiationProtocol';
import { uploadCVToDrive } from '../services/hr_agent/drive_uploader';
import { logCandidateToSheets } from '../services/hr_agent/sheets_logger';
import { logAgentActivity } from '../services/hr_agent/logger';
import { getDb } from '../db';
import { log } from '../lib/logger';
import { errMsg } from '../lib/errMsg';

function buildQuickSummary(aiData: any, assessment: any): string {
  const name =
    [aiData.candidate?.first_name, aiData.candidate?.last_name]
      .filter(Boolean)
      .join(' ') || 'Candidate';
  const role =
    assessment.matchedJobTitle || assessment.inferredTargetRole || 'the role';
  const skills = (assessment.matchedSkills || []).slice(0, 4);

  if (assessment.status === 'Shortlisted')
    return `${name} is a strong match for ${role}${skills.length ? `, with skills in ${skills.join(', ')}` : ''}.`;
  if (assessment.status === 'Rejected')
    return `${name} is not a close fit for ${role}. ${(assessment.reasons || []).at(-1) || ''}`.slice(0, 500);
  return `${name} needs recruiter review for ${role}. ${(assessment.reasons || []).at(-1) || ''}`.slice(0, 500);
}

export class OrchestratorAgent extends AgentBase {
  private readonly queue: TaskQueue;
  private readonly negotiation: NegotiationProtocol;
  private readonly agentPool: AgentBase[] = [];
  private pollTimer?: NodeJS.Timeout;
  private isDispatching = false;

  constructor(registry: AgentRegistry, bus: MessageBus, queue: TaskQueue) {
    super('orchestrator', registry, bus);
    this.queue = queue;
    this.negotiation = new NegotiationProtocol(registry);
  }

  getCapabilities(): TaskType[] {
    return ['persist_candidate', 'upload_cv_drive', 'log_to_sheets'];
  }

  registerAgent(agent: AgentBase): void {
    this.agentPool.push(agent);
  }

  getSwarmStatus() {
    return {
      orchestratorId: this.agentId,
      agentCount: this.agentPool.length + 1,
      agents: [this, ...this.agentPool].map((a) => ({
        agentId: a.agentId,
        agentType: a.agentType,
        load: a.currentLoad,
      })),
    };
  }

  protected async onStart(): Promise<void> {
    this.bus.on('task:new', () => {
      this.dispatch().catch((err) =>
        log.warn(`[Orchestrator] dispatch error: ${errMsg(err)}`)
      );
    });

    this.pollTimer = setInterval(() => {
      this.dispatch().catch(() => {});
      this.queue.requeueFailed().catch(() => {});
      this.registry.markStaleDead().catch(() => {});
    }, 3_000);

    log.info('[OrchestratorAgent] swarm coordinator online');
  }

  protected async onStop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    switch (task.taskType) {
      case 'persist_candidate':
        return this.persistCandidate(task);
      case 'upload_cv_drive':
        return this.uploadCvDrive(task);
      case 'log_to_sheets':
        return this.logToSheets(task);
      default:
        throw new Error(`Orchestrator cannot handle task: ${task.taskType}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dispatch loop
  // ─────────────────────────────────────────────────────────────────────────

  private async dispatch(): Promise<void> {
    if (this.isDispatching) return;
    this.isDispatching = true;
    try {
      // Give each agent in the pool a chance to claim a task
      for (const agent of this.agentPool) {
        const caps = agent.getCapabilities();
        const task = await this.queue.claimNext(agent.agentId, caps);
        if (task) this.executeTask(agent, task);
      }
      // Orchestrator handles its own task types
      const ownTask = await this.queue.claimNext(this.agentId, this.getCapabilities());
      if (ownTask) this.executeTask(this, ownTask);
    } finally {
      this.isDispatching = false;
    }
  }

  private executeTask(agent: AgentBase, task: Task): void {
    agent.incrementLoad();
    this.queue.markRunning(task.taskId).then(async () => {
      try {
        const result = await agent.handleTask(task);
        await this.queue.complete(task.taskId, result);
        log.info(`[Orchestrator] ${task.taskType} done`, { agent: agent.agentType });
        await this.scheduleFollowOn(task, result);
        this.bus.emit('task:complete', { taskId: task.taskId, taskType: task.taskType });
      } catch (err) {
        const msg = errMsg(err);
        await this.queue.fail(task.taskId, msg);
        log.warn(`[Orchestrator] ${task.taskType} failed: ${msg}`);
        this.bus.emit('task:failed', { taskId: task.taskId, error: msg });
      } finally {
        agent.decrementLoad();
      }
    }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Follow-on task chaining — fully autonomous pipeline
  // ─────────────────────────────────────────────────────────────────────────

  private async scheduleFollowOn(
    completedTask: Task,
    result: Record<string, any>
  ): Promise<void> {
    switch (completedTask.taskType) {
      case 'extract_cv_text': {
        await this.enqueue('analyze_cv', result, 3, completedTask.taskId);
        break;
      }
      case 'analyze_cv': {
        await this.enqueue('match_jobs', result, 3, completedTask.taskId);
        break;
      }
      case 'match_jobs': {
        const candidateName = result.analysis?.candidate?.first_name || 'Candidate';
        const role =
          result.assessment?.matchedJobTitle ||
          result.assessment?.inferredTargetRole ||
          'Position';
        const phone = result.analysis?.candidate?.phone as string | undefined;

        const followOns: Promise<void>[] = [
          this.enqueue('persist_candidate', result, 2, completedTask.taskId),
          this.enqueue(
            'send_reply',
            {
              email: result.email,
              candidateName,
              status: result.assessment?.status,
              role,
            },
            4,
            completedTask.taskId
          ),
        ];

        // Auto WhatsApp if phone extracted from CV
        if (phone) {
          followOns.push(
            this.enqueue(
              'send_whatsapp',
              {
                phone,
                email: result.email,
                candidateName,
                status: result.assessment?.status,
                role,
              },
              4,
              completedTask.taskId
            )
          );
        }

        await Promise.all(followOns);
        break;
      }
      case 'persist_candidate': {
        if (result.attachmentBufferBase64) {
          await this.enqueue('upload_cv_drive', result, 7, completedTask.taskId);
        }
        // Auto-schedule interview for shortlisted candidates
        if (result.status === 'Shortlisted' && result.candidateRow) {
          await this.enqueue(
            'schedule_interview',
            { candidate: result.candidateRow },
            5,
            completedTask.taskId
          );
        }
        break;
      }
      case 'upload_cv_drive': {
        await this.enqueue(
          'log_to_sheets',
          { ...result, driveLink: result.driveLink || '' },
          7,
          completedTask.taskId
        );
        break;
      }
      case 'mark_email_processed': {
        // Terminal — nothing follows
        break;
      }
    }
  }

  private async enqueue(
    taskType: TaskType,
    payload: Record<string, any>,
    priority: number,
    parentTaskId?: string
  ): Promise<void> {
    await this.queue.enqueue({
      taskId: crypto.randomUUID(),
      taskType,
      status: 'pending',
      priority,
      maxRetries: 3,
      payload,
      parentTaskId,
    });
    this.bus.emit('task:new', { type: taskType });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Own task handlers
  // ─────────────────────────────────────────────────────────────────────────

  private async persistCandidate(task: Task): Promise<Record<string, any>> {
    const {
      analysis,
      assessment,
      email,
      applicationContent,
      source,
      messageId,
      subject,
      attachmentBufferBase64,
    } = task.payload;

    if (!analysis || !assessment) {
      throw new Error('persist_candidate: missing analysis or assessment');
    }

    const db = await getDb();
    const aiData = analysis;

    const workflowState =
      assessment.status === 'Shortlisted'
        ? 'Qualified'
        : assessment.status === 'Rejected'
        ? 'Rejected'
        : 'Review Required';

    const nextAction =
      assessment.status === 'Shortlisted'
        ? 'Contact candidate and begin interview scheduling'
        : assessment.status === 'Rejected'
        ? 'Archive candidate with recruiter audit trail'
        : 'Recruiter review required against matched job criteria';

    const quickSummary = buildQuickSummary(aiData, assessment);
    const sourceLabel =
      source === 'application-label' ? 'Gmail Application' : 'Gmail Intake';

    await db.run(
      `INSERT INTO candidates (
         job_id, first_name, last_name, email, phone, location,
         years_experience, current_role, skills, achievements,
         overall_score, breakdown_score, decision_status, ai_reasoning,
         source, applied_role, expected_salary, notice_period,
         communication_status, reply_status, interview_status,
         workflow_state, next_action, application_content, quick_summary, drive_file_link
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         job_id              = excluded.job_id,
         first_name          = excluded.first_name,
         last_name           = excluded.last_name,
         phone               = excluded.phone,
         location            = excluded.location,
         years_experience    = excluded.years_experience,
         current_role        = excluded.current_role,
         skills              = excluded.skills,
         achievements        = excluded.achievements,
         overall_score       = excluded.overall_score,
         breakdown_score     = excluded.breakdown_score,
         decision_status     = excluded.decision_status,
         ai_reasoning        = excluded.ai_reasoning,
         source              = excluded.source,
         applied_role        = excluded.applied_role,
         workflow_state      = excluded.workflow_state,
         next_action         = excluded.next_action,
         application_content = excluded.application_content,
         quick_summary       = excluded.quick_summary`,
      [
        assessment.matchedJobId,
        aiData.candidate.first_name,
        aiData.candidate.last_name,
        aiData.candidate.email || email,
        aiData.candidate.phone,
        aiData.candidate.location,
        aiData.summary.years_experience,
        aiData.summary.current_role,
        JSON.stringify(aiData.summary.technical_skills),
        JSON.stringify(aiData.summary.key_achievements),
        assessment.overallScore,
        JSON.stringify(assessment.breakdown),
        assessment.status,
        JSON.stringify({
          matchedJobId: assessment.matchedJobId,
          matchedJobTitle: assessment.matchedJobTitle,
          inferredTargetRole: assessment.inferredTargetRole,
          analysisSource: assessment.analysisSource,
          confidence: assessment.confidence,
          requiredSkills: assessment.requiredSkills,
          matchedSkills: assessment.matchedSkills,
          hardFlags: assessment.hardFlags,
          reasons: assessment.reasons,
        }),
        sourceLabel,
        assessment.matchedJobTitle || assessment.inferredTargetRole,
        '',
        '',
        'Acknowledged',
        'No Reply',
        'Not Scheduled',
        workflowState,
        nextAction,
        applicationContent || '',
        quickSummary,
        '',
      ]
    );

    const savedRow = await db.get<any>(
      `SELECT * FROM candidates WHERE email = ?`,
      [aiData.candidate.email || email]
    );

    logAgentActivity(
      `[Kairos] Persisted ${aiData.candidate.email || email} → ${assessment.status}`
    );

    // Queue mark_email_processed
    if (messageId) {
      await this.enqueue(
        'mark_email_processed',
        {
          messageId,
          email: aiData.candidate.email || email,
          subject: subject || '',
          status: assessment.status,
        },
        8
      );
    }

    return {
      persisted: true,
      email: aiData.candidate.email || email,
      status: assessment.status,
      attachmentBufferBase64,
      analysis,
      assessment,
      messageId,
      subject,
      candidateRow: savedRow,
    };
  }

  private async uploadCvDrive(task: Task): Promise<Record<string, any>> {
    const {
      attachmentBufferBase64,
      analysis,
      assessment,
      messageId,
      subject,
      email,
    } = task.payload;

    if (!attachmentBufferBase64) {
      return { driveLink: '', messageId, subject, email, analysis, assessment };
    }

    try {
      const buffer = Buffer.from(attachmentBufferBase64, 'base64');
      const name =
        [analysis?.candidate?.first_name, analysis?.candidate?.last_name]
          .filter(Boolean)
          .join('_') || 'resume';
      const driveLink = await uploadCVToDrive(buffer, `${name}.pdf`);

      const db = await getDb();
      await db.run(
        `UPDATE candidates SET drive_file_link = ? WHERE email = ?`,
        [driveLink, analysis?.candidate?.email || email]
      );

      return { driveLink, messageId, subject, email, analysis, assessment };
    } catch (err) {
      logAgentActivity(`[Kairos] Drive upload failed: ${errMsg(err)}`, 'WARN');
      return { driveLink: '', messageId, subject, email, analysis, assessment };
    }
  }

  private async logToSheets(task: Task): Promise<Record<string, any>> {
    const { email, analysis } = task.payload;
    try {
      const db = await getDb();
      const saved = await db.get<any>(
        `SELECT id, first_name, last_name, email, phone, source, applied_role, current_role,
                location, expected_salary, notice_period, overall_score, decision_status,
                workflow_state, next_action, communication_status, reply_status, interview_status,
                interview_scheduled_at, interview_meet_link, application_content, quick_summary,
                drive_file_link
         FROM candidates WHERE email = ?`,
        [analysis?.candidate?.email || email]
      );
      if (saved) await logCandidateToSheets(saved);
      return { logged: true };
    } catch (err) {
      logAgentActivity(`[Kairos] Sheets log failed: ${errMsg(err)}`, 'WARN');
      return { logged: false };
    }
  }
}
