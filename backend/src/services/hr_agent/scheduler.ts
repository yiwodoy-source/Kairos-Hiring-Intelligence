import { checkNewEmails, markAsProcessed } from './gmail_listener';
import { extractTextFromPdf } from './pdf_parser';
import { analyzeCandidateCV } from './ai_analyzer';
import { assessCandidateAgainstJobs } from './decision_engine';
import { uploadCVToDrive } from './drive_uploader';
import { logCandidateToSheets } from './sheets_logger';
import { sendAutomatedReply } from './email_responder';
import { logAgentActivity } from './logger';
import { getDb } from '../../db';
import cron from 'node-cron';

let isRunning = false;
let agentStatus: 'Running' | 'Stopped' = 'Stopped';
let job: any = null;
let lastRunAt: string | null = null;
let lastSuccessfulRunAt: string | null = null;

function buildQuickSummary(aiData: any, assessment: any): string {
    const candidateName = [aiData.candidate?.first_name, aiData.candidate?.last_name].filter(Boolean).join(' ').trim() || 'Candidate';
    const targetRole = assessment.matchedJobTitle || assessment.inferredTargetRole || aiData.summary?.current_role || 'the role';
    const matchedSkills = Array.isArray(assessment.matchedSkills) ? assessment.matchedSkills.filter(Boolean).slice(0, 4) : [];
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons.filter(Boolean) : [];

    if (assessment.status === 'Shortlisted') {
        return `${candidateName} is a strong match for ${targetRole}, with solid alignment on skills and experience${matchedSkills.length ? ` including ${matchedSkills.join(', ')}` : ''}.`;
    }

    if (assessment.status === 'Rejected') {
        return `${candidateName} is not a close fit for ${targetRole}. ${reasons[reasons.length - 1] || 'The profile appears materially below the required skill or experience level.'}`.substring(0, 500);
    }

    return `${candidateName} needs recruiter review for ${targetRole}. ${reasons[reasons.length - 1] || 'The current evidence is partial or needs validation before a final hiring decision.'}`.substring(0, 500);
}

export async function runAgentCycle() {
    if (isRunning) {
        logAgentActivity('Agent cycle already in progress, skipping...', 'WARN');
        return;
    }
    isRunning = true;
    lastRunAt = new Date().toISOString();
    logAgentActivity('Starting HR Agent cycle...');

    try {
        const newCVs = await checkNewEmails();
        const db = await getDb();
        const openJobs = await db.all(`
            SELECT id, title, location, description, requirements, status
            FROM jobs
            WHERE status = 'Open'
        `);
        logAgentActivity(`Found ${newCVs.length} new CV(s) to process.`);

        for (const cv of newCVs) {
            try {
                logAgentActivity(`Processing CV from ${cv.email}...`);
                const text = await extractTextFromPdf(cv.attachmentBuffer);
                const aiData = await analyzeCandidateCV(text);
                const assessment = assessCandidateAgainstJobs(aiData, openJobs, {
                    subject: cv.subject,
                    applicationContent: cv.applicationContent
                });
                const quickSummary = buildQuickSummary(aiData, assessment);
                const sourceLabel = cv.source === 'application-label' ? 'Gmail Application' : 'Gmail Intake';
                const workflowState = assessment.status === 'Shortlisted'
                    ? 'Qualified'
                    : assessment.status === 'Rejected'
                        ? 'Rejected'
                        : 'Review Required';
                const nextAction = assessment.status === 'Shortlisted'
                    ? 'Contact candidate and begin interview scheduling'
                    : assessment.status === 'Rejected'
                        ? 'Archive candidate with recruiter audit trail'
                        : 'Recruiter review required against matched job criteria';
                const reasoningPayload = JSON.stringify({
                    matchedJobId: assessment.matchedJobId,
                    matchedJobTitle: assessment.matchedJobTitle,
                    inferredTargetRole: assessment.inferredTargetRole,
                    analysisSource: assessment.analysisSource,
                    confidence: assessment.confidence,
                    requiredSkills: assessment.requiredSkills,
                    matchedSkills: assessment.matchedSkills,
                    hardFlags: assessment.hardFlags,
                    reasons: assessment.reasons
                });

                let driveLink = '';
                try {
                    driveLink = await uploadCVToDrive(cv.attachmentBuffer, cv.fileName);
                } catch (driveErr: any) {
                    logAgentActivity(`Drive upload failed for ${cv.email}: ${driveErr.message}`, 'WARN');
                }

                await db.run(`
                    INSERT INTO candidates (
                        job_id, first_name, last_name, email, phone, location,
                        years_experience, current_role, skills, achievements,
                        overall_score, breakdown_score, decision_status,
                        ai_reasoning, source, applied_role, expected_salary, notice_period,
                        communication_status, reply_status, interview_status, workflow_state, next_action,
                        application_content, quick_summary, drive_file_link
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET
                        job_id = excluded.job_id,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name,
                        phone = excluded.phone,
                        location = excluded.location,
                        years_experience = excluded.years_experience,
                        current_role = excluded.current_role,
                        skills = excluded.skills,
                        achievements = excluded.achievements,
                        overall_score = excluded.overall_score,
                        breakdown_score = excluded.breakdown_score,
                        decision_status = excluded.decision_status,
                        ai_reasoning = excluded.ai_reasoning,
                        source = excluded.source,
                        applied_role = excluded.applied_role,
                        expected_salary = excluded.expected_salary,
                        notice_period = excluded.notice_period,
                        communication_status = excluded.communication_status,
                        reply_status = excluded.reply_status,
                        interview_status = excluded.interview_status,
                        workflow_state = excluded.workflow_state,
                        next_action = excluded.next_action,
                        application_content = excluded.application_content,
                        quick_summary = excluded.quick_summary,
                        drive_file_link = CASE
                            WHEN excluded.drive_file_link IS NOT NULL AND excluded.drive_file_link <> '' THEN excluded.drive_file_link
                            ELSE candidates.drive_file_link
                        END
                `, [
                    assessment.matchedJobId,
                    aiData.candidate.first_name, aiData.candidate.last_name,
                    aiData.candidate.email, aiData.candidate.phone,
                    aiData.candidate.location, aiData.summary.years_experience,
                    aiData.summary.current_role,
                    JSON.stringify(aiData.summary.technical_skills),
                    JSON.stringify(aiData.summary.key_achievements),
                    assessment.overallScore,
                    JSON.stringify(assessment.breakdown),
                    assessment.status,
                    reasoningPayload,
                    sourceLabel,
                    assessment.matchedJobTitle || assessment.inferredTargetRole,
                    '',
                    '',
                    'Acknowledged',
                    'No Reply',
                    'Not Scheduled',
                    workflowState,
                    nextAction,
                    cv.applicationContent,
                    quickSummary,
                    driveLink
                ]);

                const savedCandidate = await db.get(`
                    SELECT id, first_name, last_name, email, phone, source, applied_role, current_role, location,
                           expected_salary, notice_period, overall_score, decision_status, workflow_state, next_action,
                           communication_status, reply_status, interview_status, interview_scheduled_at, interview_meet_link,
                           application_content, quick_summary, drive_file_link
                    FROM candidates
                    WHERE email = ?
                `, [aiData.candidate.email]);

                try {
                    const sheetsLogged = await logCandidateToSheets({
                        ...savedCandidate
                    });
                    if (!sheetsLogged) {
                        logAgentActivity(`Sheets logging did not complete for ${cv.email}`, 'WARN');
                    }
                } catch (sheetsErr: any) {
                    logAgentActivity(`Sheets logging failed: ${sheetsErr.message}`, 'WARN');
                }

                try {
                    await sendAutomatedReply(
                        cv.email,
                        aiData.candidate.first_name,
                        assessment.status,
                        assessment.matchedJobTitle || assessment.inferredTargetRole
                    );
                } catch (emailErr: any) {
                    logAgentActivity(`Auto-reply failed: ${emailErr.message}`, 'WARN');
                }

                try {
                    await markAsProcessed(cv.messageId, cv.email, cv.subject, assessment.status);
                } catch (markErr: any) {
                    logAgentActivity(`Failed to mark as processed: ${markErr.message}`, 'WARN');
                }

                logAgentActivity(`Successfully processed ${cv.source} CV from ${cv.email}`);
            } catch (err: any) {
                logAgentActivity(`Error processing CV: ${err.message}`, 'ERROR');
            }
        }

        logAgentActivity('HR Agent cycle completed.');
        lastSuccessfulRunAt = new Date().toISOString();
    } catch (error: any) {
        logAgentActivity(`Agent cycle critical error: ${error.message}`, 'ERROR');
    } finally {
        isRunning = false;
    }
}

export function startAgent() {
    if (job) {
        logAgentActivity('Agent already running', 'WARN');
        return;
    }
    getDb().catch(err => logAgentActivity(`DB Init failed: ${err.message}`, 'ERROR'));
    job = cron.schedule('*/1 * * * *', () => {
        runAgentCycle().catch(err => {
            logAgentActivity(`Unhandled error: ${err.message}`, 'ERROR');
            isRunning = false;
        });
    });
    agentStatus = 'Running';
    logAgentActivity('HR Agent Scheduler started');
}

export function stopAgent() {
    if (job) {
        job.stop();
        job = null;
    }
    agentStatus = 'Stopped';
    isRunning = false;
    logAgentActivity('HR Agent Scheduler stopped');
}

export function getAgentStatus() {
    return {
        status: agentStatus,
        isRunning: isRunning,
        lastRun: lastRunAt,
        lastSuccessfulRun: lastSuccessfulRunAt
    };
}

export function initializeAgent() {
    const shouldAutoStart = (process.env.HR_AGENT_AUTO_START || 'true').toLowerCase() === 'true';
    if (shouldAutoStart && !job) {
        startAgent();
    }
}
