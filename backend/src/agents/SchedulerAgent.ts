import { AgentBase } from './base/AgentBase';
import type { Task, TaskType } from './types';
import type { AgentRegistry } from './base/AgentRegistry';
import type { MessageBus } from './base/MessageBus';
import {
  getInterviewAvailability,
  scheduleCandidateInterview,
} from '../services/hr_agent/interview_scheduler';
import { getDb } from '../db';

export class SchedulerAgent extends AgentBase {
  constructor(registry: AgentRegistry, bus: MessageBus) {
    super('scheduler', registry, bus);
  }

  getCapabilities(): TaskType[] {
    return ['schedule_interview'];
  }

  async handleTask(task: Task): Promise<Record<string, any>> {
    const { candidate, startTimeIso, durationMinutes, notes } = task.payload;

    if (startTimeIso) {
      const interview = await scheduleCandidateInterview(
        candidate,
        startTimeIso,
        durationMinutes || 45,
        notes
      );

      // Persist interview details to candidate record
      const db = await getDb();
      await db.run(
        `UPDATE candidates
         SET interview_status = 'Scheduled',
             interview_scheduled_at = ?,
             interview_meet_link = ?,
             interview_event_id = ?
         WHERE id = ?`,
        [interview.start, interview.meetLink, interview.eventId, candidate.id]
      );

      this.bus.emit('task:new', {
        type: 'send_reply',
        subType: 'interview_confirmation',
        candidateId: candidate.id,
      });

      return { scheduled: true, ...interview, candidateId: candidate.id };
    }

    // No specific time — return available slots for human/agent to pick
    const slots = await getInterviewAvailability();
    return { scheduled: false, slots, candidateId: candidate?.id };
  }
}
