import express from 'express';
import { errMsg } from '../lib/errMsg';
import { verifyUnsubscribeToken } from '../services/hr_agent/email_responder';
import { getDb } from '../db';
import { runAgentCycle, startAgent, stopAgent, getAgentStatus } from '../services/hr_agent/scheduler';
import { getLogs } from '../services/hr_agent/logger';
import { getKairosStatus, getKairosRegistry, getKairosQueue } from '../agents/index';
import { sendWhatsAppMessage, getRecentMessages, getConversation, probeWhatsApp, recordInbound } from '../services/whatsapp/whatsapp_client';
import { getOAuth2Client, setGoogleCredentials, encryptToken, loadTokenFromDb, hasCredentials } from '../services/hr_agent/google_client';
import { exportCandidateRecord } from '../services/hr_agent/candidate_export';
import { getInterviewAvailability, scheduleCandidateInterview } from '../services/hr_agent/interview_scheduler';
import { sendInterviewConfirmation, sendAutomatedReply } from '../services/hr_agent/email_responder';
import { assessCandidateAgainstJobs } from '../services/hr_agent/decision_engine';
import { extractTextFromPdf } from '../services/hr_agent/pdf_parser';
import { analyzeCandidateCV } from '../services/hr_agent/ai_analyzer';
import { getLinkedInSessionStatus, writeJobsInput, runLinkedInScout, parseLinkedInOutput } from '../services/sourcer/linkedin_sourcer';
import { sourceForRoles, ScrapeGraphCandidate } from '../services/sourcer/scrapegraph_sourcer';
import { sourceWithFirecrawlForRoles, FirecrawlCandidate } from '../services/sourcer/firecrawl_sourcer';
import { sourceFromGitHub, GitHubCandidate } from '../services/sourcer/github_sourcer';
import { sourceFromStackOverflow, StackOverflowCandidate } from '../services/sourcer/stackoverflow_sourcer';
import { sourceFromPython, isPythonSourcerRunning, PythonSourcedCandidate } from '../services/sourcer/python_sourcer';
import { getScrapeGraphStatus } from '../services/integrations/scrapegraph';
import { getMergeStatus, getMergeCandidates } from '../services/integrations/merge';
import { getFirecrawlStatus } from '../services/integrations/firecrawl';

const router = express.Router();

type CandidateSyncSummary = {
    candidateCount: number;
    syncedToSheets: number;
    driveLinked: number;
    missingDriveLinks: number;
};

function validateIsoDateTime(value: any): string | null {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function getCalendarErrorMessage(error: any): string {
    const message = error?.message || 'Google Calendar request failed';
    if (message.toLowerCase().includes('insufficient authentication scopes')) {
        return 'Google Calendar access is not authorized for the current token. Re-authorize Google with Calendar permission.';
    }
    return message;
}

type SyncHealthState = {
    state: 'idle' | 'running' | 'success' | 'error';
    lastAttemptAt: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    lastSummary: CandidateSyncSummary | null;
};

const syncHealth: SyncHealthState = {
    state: 'idle',
    lastAttemptAt: null,
    lastSyncedAt: null,
    lastError: null,
    lastSummary: null
};

// --- Validation helpers ---
function validateEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateString(str: any, maxLength = 200): string | null {
    if (typeof str !== 'string') return null;
    const trimmed = str.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) return null;
    return trimmed;
}

function validateOptionalString(str: any, maxLength = 200): string | null {
    if (str === undefined || str === null || str === '') return '';
    return validateString(str, maxLength);
}

function validateOptionalNumber(value: any, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
    return parsed;
}

function serializeStringArray(value: any): string {
    if (!Array.isArray(value)) return '[]';
    return JSON.stringify(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0));
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function logCandidateEvent(
    db: any,
    candidateId: number,
    eventType: string,
    description: string,
    metadata?: Record<string, unknown>
): Promise<void> {
    try {
        await db.run(
            `INSERT INTO candidate_events (candidate_id, event_type, description, metadata) VALUES (?, ?, ?, ?)`,
            [candidateId, eventType, description, metadata ? JSON.stringify(metadata) : null]
        );
    } catch (err) {
        console.warn('[HR Agent] Failed to log candidate event:', err);
    }
}

function deriveWorkflowState(decisionStatus: string, communicationStatus: string, replyStatus: string, interviewStatus: string, isSourced: boolean): { workflowState: string; nextAction: string; sourcingStage: string } {
    if (decisionStatus === 'Rejected') {
        return {
            workflowState: 'Closed',
            nextAction: 'No action required',
            sourcingStage: isSourced ? 'Discovered' : ''
        };
    }

    if (interviewStatus === 'Scheduled') {
        return {
            workflowState: 'Interview Scheduled',
            nextAction: 'Prepare interviewer and candidate brief',
            sourcingStage: isSourced ? 'Qualified' : ''
        };
    }

    if (decisionStatus === 'Review Required') {
        return {
            workflowState: 'Awaiting Review',
            nextAction: 'Recruiter review required against matched job criteria',
            sourcingStage: isSourced ? (replyStatus === 'Interested' || replyStatus === 'Replied' ? 'Engaged' : 'Discovered') : ''
        };
    }

    if (replyStatus === 'Interested' || replyStatus === 'Replied') {
        return {
            workflowState: 'Candidate Engaged',
            nextAction: 'Confirm screening outcome and collect availability',
            sourcingStage: isSourced ? 'Engaged' : ''
        };
    }

    if (communicationStatus === 'Contacted' || communicationStatus === 'Acknowledged' || communicationStatus === 'Outreach Drafted' || communicationStatus === 'Outreach Sent') {
        return {
            workflowState: decisionStatus === 'Shortlisted' ? 'Interview Ready' : 'Awaiting Candidate Reply',
            nextAction: decisionStatus === 'Shortlisted' ? 'Collect candidate availability' : 'Wait for candidate response',
            sourcingStage: isSourced ? 'Contacted' : ''
        };
    }

    return {
        workflowState: decisionStatus === 'Shortlisted' ? 'Interview Ready' : decisionStatus === 'Review Required' ? 'Awaiting Review' : isSourced ? 'Sourced' : 'New Intake',
        nextAction: decisionStatus === 'Shortlisted' ? 'Send shortlist outreach' : decisionStatus === 'Review Required' ? 'Review candidate fit' : isSourced ? 'Review sourced profile' : 'Screen candidate',
        sourcingStage: isSourced ? 'Discovered' : ''
    };
}

async function exportAndPersistCandidate(candidate: any, db: any): Promise<{ driveLink: string; sheetsLogged: boolean; }> {
    const exportResult = await exportCandidateRecord(candidate);
    if (exportResult.driveLink && exportResult.driveLink !== candidate.drive_file_link) {
        await db.run('UPDATE candidates SET drive_file_link = ? WHERE id = ?', exportResult.driveLink, candidate.id);
    }
    return exportResult;
}

async function syncCandidateExports(db: any, shortlistedOnly = false): Promise<CandidateSyncSummary> {
    syncHealth.state = 'running';
    syncHealth.lastAttemptAt = new Date().toISOString();
    syncHealth.lastError = null;

    const baseSelect = `SELECT id, first_name, last_name, email, phone, location, current_role, years_experience, skills, achievements, overall_score, decision_status, ai_reasoning, source, applied_role, expected_salary, notice_period, communication_status, reply_status, interview_status, interview_scheduled_at, interview_event_id, interview_meet_link, workflow_state, next_action, sourcing_stage, is_sourced, profile_url, company, application_content, quick_summary, drive_file_link FROM candidates`;
    const candidatesToSync = shortlistedOnly
        ? await db.all(`${baseSelect} WHERE decision_status = ? ORDER BY created_at DESC`, ['Shortlisted'])
        : await db.all(`${baseSelect} ORDER BY created_at DESC`);

    let sheetsLogged = 0;
    let missingDriveLinks = 0;
    let driveLinked = 0;

    for (const candidate of candidatesToSync) {
        if (!candidate.drive_file_link) {
            missingDriveLinks += 1;
        }

        const exportResult = await exportAndPersistCandidate(candidate, db);
        if (exportResult.driveLink) {
            driveLinked += 1;
        }
        if (exportResult.sheetsLogged) {
            sheetsLogged += 1;
        }
    }

    const summary = {
        candidateCount: candidatesToSync.length,
        syncedToSheets: sheetsLogged,
        driveLinked,
        missingDriveLinks
    };

    syncHealth.state = 'success';
    syncHealth.lastSyncedAt = new Date().toISOString();
    syncHealth.lastSummary = summary;

    return summary;
}

// Get all candidates
router.get('/candidates', async (req, res) => {
    try {
        const db = await getDb();
        const candidates = await db.all('SELECT * FROM candidates ORDER BY created_at DESC');
        res.json(candidates);
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching candidates:', err);
        res.status(500).json({ error: 'Failed to fetch candidates' });
    }
});

router.post('/candidates', async (req, res) => {
    try {
        const {
            job_id, first_name, last_name, email, phone, location,
            years_experience, current_role, skills, achievements,
            overall_score, breakdown_score, decision_status, ai_reasoning,
            source, applied_role, expected_salary, notice_period,
            communication_status, reply_status, interview_status,
            workflow_state, next_action, sourcing_stage, is_sourced, profile_url, company,
            application_content, quick_summary, drive_file_link
        } = req.body;

        const validFirstName = validateString(first_name, 100);
        const validLastName = validateString(last_name, 100);
        const validEmail = validateString(email, 200);
        const validPhone = validateOptionalString(phone, 50);
        const validLocation = validateOptionalString(location, 200);
        const validCurrentRole = validateOptionalString(current_role, 200);
        const validDecisionStatus = validateOptionalString(decision_status, 50);
        const validDriveLink = validateOptionalString(drive_file_link, 500);
        const validSource = validateOptionalString(source, 100);
        const validAppliedRole = validateOptionalString(applied_role, 200);
        const validExpectedSalary = validateOptionalString(expected_salary, 100);
        const validNoticePeriod = validateOptionalString(notice_period, 100);
        const validCommunicationStatus = validateOptionalString(communication_status, 100);
        const validReplyStatus = validateOptionalString(reply_status, 100);
        const validInterviewStatus = validateOptionalString(interview_status, 100);
        const validWorkflowState = validateOptionalString(workflow_state, 100);
        const validNextAction = validateOptionalString(next_action, 200);
        const validSourcingStage = validateOptionalString(sourcing_stage, 50);
        const validProfileUrl = validateOptionalString(profile_url, 500);
        const validCompany = validateOptionalString(company, 200);
        const validApplicationContent = validateOptionalString(application_content, 5000);
        const validQuickSummary = validateOptionalString(quick_summary, 1000);
        const yearsExperience = validateOptionalNumber(years_experience, 0, 80);
        const overallScore = validateOptionalNumber(overall_score, 0, 100);
        const isSourcedFlag = req.body.is_sourced === true || req.body.is_sourced === 1 ? 1 : 0;
        const parsedJobId = job_id === undefined || job_id === null || job_id === '' ? null : Number(job_id);
        const allowedDecisionStatuses = ['Shortlisted', 'Rejected', 'Review Required', 'Applied', 'Screening', 'Interview', 'Offer'];

        if (!validFirstName || !validLastName || !validEmail) {
            return res.status(400).json({ error: 'Missing required fields: first_name, last_name, email' });
        }

        if (!validateEmail(validEmail)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (yearsExperience === null || overallScore === null) {
            return res.status(400).json({ error: 'Invalid numeric fields' });
        }

        if (
            validPhone === null ||
            validLocation === null ||
            validCurrentRole === null ||
            validDecisionStatus === null ||
            validDriveLink === null ||
            validSource === null ||
            validAppliedRole === null ||
            validExpectedSalary === null ||
            validNoticePeriod === null ||
            validCommunicationStatus === null ||
            validReplyStatus === null ||
            validInterviewStatus === null ||
            validWorkflowState === null ||
            validNextAction === null ||
            validSourcingStage === null ||
            validProfileUrl === null ||
            validCompany === null ||
            validApplicationContent === null ||
            validQuickSummary === null
        ) {
            return res.status(400).json({ error: 'One or more optional text fields are invalid' });
        }

        const candidateStatus = validDecisionStatus || 'Review Required';
        if (!allowedDecisionStatuses.includes(candidateStatus)) {
            return res.status(400).json({ error: `decision_status must be one of: ${allowedDecisionStatuses.join(', ')}` });
        }

        if (parsedJobId !== null && (!Number.isInteger(parsedJobId) || parsedJobId <= 0)) {
            return res.status(400).json({ error: 'job_id must be a positive integer' });
        }

        const db = await getDb();

        if (parsedJobId !== null) {
            const job = await db.get('SELECT id FROM jobs WHERE id = ?', parsedJobId);
            if (!job) {
                return res.status(400).json({ error: 'job_id does not reference an existing job' });
            }
        }

        const derivedWorkflow = deriveWorkflowState(
            candidateStatus,
            validCommunicationStatus || '',
            validReplyStatus || '',
            validInterviewStatus || '',
            isSourcedFlag === 1
        );

        const result = await db.run(`
            INSERT INTO candidates (
                job_id, first_name, last_name, email, phone, location,
                years_experience, current_role, skills, achievements,
                overall_score, breakdown_score, decision_status,
                ai_reasoning, source, applied_role, expected_salary, notice_period,
                communication_status, reply_status, interview_status,
                workflow_state, next_action, sourcing_stage, is_sourced, profile_url, company,
                application_content, quick_summary, drive_file_link
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            parsedJobId, validFirstName, validLastName, validEmail, validPhone, validLocation,
            yearsExperience, validCurrentRole, serializeStringArray(skills), serializeStringArray(achievements),
            overallScore, JSON.stringify(breakdown_score || {}), candidateStatus,
            typeof ai_reasoning === 'string' ? ai_reasoning : JSON.stringify(ai_reasoning || {}),
            validSource,
            validAppliedRole,
            validExpectedSalary,
            validNoticePeriod,
            validCommunicationStatus,
            validReplyStatus,
            validInterviewStatus,
            validWorkflowState || derivedWorkflow.workflowState,
            validNextAction || derivedWorkflow.nextAction,
            validSourcingStage || derivedWorkflow.sourcingStage,
            isSourcedFlag,
            validProfileUrl,
            validCompany,
            validApplicationContent,
            validQuickSummary,
            validDriveLink
        ]);

        let candidate = await db.get('SELECT * FROM candidates WHERE id = ?', result.lastID);

        try {
            await exportAndPersistCandidate(candidate, db);
            candidate = await db.get('SELECT * FROM candidates WHERE id = ?', result.lastID);
        } catch (exportErr: any) {
            console.warn('[HR Agent] Candidate created but export failed:', errMsg(exportErr));
        }

        res.status(201).json(candidate);
    } catch (err: unknown) {
        if (errMsg(err)?.includes('UNIQUE constraint failed') || ((err as any)?.code) === '23505') {
            return res.status(409).json({ error: 'Candidate with this email already exists' });
        }
        console.error('[HR Agent] Error adding candidate:', err);
        res.status(500).json({ error: 'Failed to add candidate' });
    }
});

router.patch('/candidates/:id', async (req, res) => {
    try {
        const candidateId = Number(req.params.id);
        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }

        const {
            decision_status,
            overall_score,
            ai_reasoning,
            current_role,
            years_experience,
            location,
            phone,
            skills,
            achievements,
            source,
            applied_role,
            expected_salary,
            notice_period,
            communication_status,
            reply_status,
            interview_status,
            workflow_state,
            next_action,
            sourcing_stage,
            is_sourced,
            profile_url,
            company,
            application_content,
            quick_summary
        } = req.body;

        const validDecisionStatus = validateOptionalString(decision_status, 50);
        const validCurrentRole = validateOptionalString(current_role, 200);
        const validLocation = validateOptionalString(location, 200);
        const validPhone = validateOptionalString(phone, 50);
        const validSource = validateOptionalString(source, 100);
        const validAppliedRole = validateOptionalString(applied_role, 200);
        const validExpectedSalary = validateOptionalString(expected_salary, 100);
        const validNoticePeriod = validateOptionalString(notice_period, 100);
        const validCommunicationStatus = validateOptionalString(communication_status, 100);
        const validReplyStatus = validateOptionalString(reply_status, 100);
        const validInterviewStatus = validateOptionalString(interview_status, 100);
        const validWorkflowState = validateOptionalString(workflow_state, 100);
        const validNextAction = validateOptionalString(next_action, 200);
        const validSourcingStage = validateOptionalString(sourcing_stage, 50);
        const validProfileUrl = validateOptionalString(profile_url, 500);
        const validCompany = validateOptionalString(company, 200);
        const validApplicationContent = validateOptionalString(application_content, 5000);
        const validQuickSummary = validateOptionalString(quick_summary, 1000);
        const validYearsExperience = validateOptionalNumber(years_experience, 0, 80);
        const validOverallScore = validateOptionalNumber(overall_score, 0, 100);
        const allowedDecisionStatuses = ['Shortlisted', 'Rejected', 'Review Required', 'Applied', 'Screening', 'Interview', 'Offer'];

        if (
            validDecisionStatus === null ||
            validCurrentRole === null ||
            validLocation === null ||
            validPhone === null ||
            validSource === null ||
            validAppliedRole === null ||
            validExpectedSalary === null ||
            validNoticePeriod === null ||
            validCommunicationStatus === null ||
            validReplyStatus === null ||
            validInterviewStatus === null ||
            validWorkflowState === null ||
            validNextAction === null ||
            validSourcingStage === null ||
            validProfileUrl === null ||
            validCompany === null ||
            validApplicationContent === null ||
            validQuickSummary === null ||
            validYearsExperience === null ||
            validOverallScore === null
        ) {
            return res.status(400).json({ error: 'One or more fields are invalid' });
        }

        if (validDecisionStatus && !allowedDecisionStatuses.includes(validDecisionStatus)) {
            return res.status(400).json({ error: `decision_status must be one of: ${allowedDecisionStatuses.join(', ')}` });
        }

        const db = await getDb();
        const existingCandidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);
        if (!existingCandidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        const nextDecisionStatus = validDecisionStatus || existingCandidate.decision_status;
        const nextOverallScore = req.body.overall_score === undefined ? existingCandidate.overall_score : validOverallScore;
        const nextAiReasoning = req.body.ai_reasoning === undefined
            ? existingCandidate.ai_reasoning
            : (typeof ai_reasoning === 'string' ? ai_reasoning : JSON.stringify(ai_reasoning || {}));
        const nextCurrentRole = req.body.current_role === undefined ? existingCandidate.current_role : validCurrentRole;
        const nextYearsExperience = req.body.years_experience === undefined ? existingCandidate.years_experience : validYearsExperience;
        const nextLocation = req.body.location === undefined ? existingCandidate.location : validLocation;
        const nextPhone = req.body.phone === undefined ? existingCandidate.phone : validPhone;
        const nextSkills = req.body.skills === undefined ? existingCandidate.skills : serializeStringArray(skills);
        const nextAchievements = req.body.achievements === undefined ? existingCandidate.achievements : serializeStringArray(achievements);
        const nextSource = req.body.source === undefined ? existingCandidate.source : validSource;
        const nextAppliedRole = req.body.applied_role === undefined ? existingCandidate.applied_role : validAppliedRole;
        const nextExpectedSalary = req.body.expected_salary === undefined ? existingCandidate.expected_salary : validExpectedSalary;
        const nextNoticePeriod = req.body.notice_period === undefined ? existingCandidate.notice_period : validNoticePeriod;
        const nextCommunicationStatus = req.body.communication_status === undefined ? existingCandidate.communication_status : validCommunicationStatus;
        const nextReplyStatus = req.body.reply_status === undefined ? existingCandidate.reply_status : validReplyStatus;
        const nextInterviewStatus = req.body.interview_status === undefined ? existingCandidate.interview_status : validInterviewStatus;
        const nextIsSourced = req.body.is_sourced === undefined ? existingCandidate.is_sourced : (req.body.is_sourced ? 1 : 0);
        const derivedWorkflow = deriveWorkflowState(
            nextDecisionStatus,
            nextCommunicationStatus || '',
            nextReplyStatus || '',
            nextInterviewStatus || '',
            nextIsSourced === 1
        );
        const nextWorkflowState = req.body.workflow_state === undefined ? derivedWorkflow.workflowState : (validWorkflowState || derivedWorkflow.workflowState);
        const nextNextAction = req.body.next_action === undefined ? derivedWorkflow.nextAction : (validNextAction || derivedWorkflow.nextAction);
        const nextSourcingStage = req.body.sourcing_stage === undefined ? (existingCandidate.sourcing_stage || derivedWorkflow.sourcingStage) : (validSourcingStage || derivedWorkflow.sourcingStage);
        const nextProfileUrl = req.body.profile_url === undefined ? existingCandidate.profile_url : validProfileUrl;
        const nextCompany = req.body.company === undefined ? existingCandidate.company : validCompany;
        const nextApplicationContent = req.body.application_content === undefined ? existingCandidate.application_content : validApplicationContent;
        const nextQuickSummary = req.body.quick_summary === undefined ? existingCandidate.quick_summary : validQuickSummary;

        let driveLink = existingCandidate.drive_file_link || '';
        let exportedToSheets = false;

        await db.run(`
            UPDATE candidates
            SET decision_status = ?, overall_score = ?, ai_reasoning = ?,
                current_role = ?, years_experience = ?, location = ?,
                phone = ?, skills = ?, achievements = ?,
                source = ?, applied_role = ?, expected_salary = ?, notice_period = ?,
                communication_status = ?, reply_status = ?, interview_status = ?,
                workflow_state = ?, next_action = ?, sourcing_stage = ?, is_sourced = ?, profile_url = ?, company = ?,
                application_content = ?, quick_summary = ?, drive_file_link = ?
            WHERE id = ?
        `, [
            nextDecisionStatus,
            nextOverallScore,
            nextAiReasoning,
            nextCurrentRole,
            nextYearsExperience,
            nextLocation,
            nextPhone,
            nextSkills,
            nextAchievements,
            nextSource,
            nextAppliedRole,
            nextExpectedSalary,
            nextNoticePeriod,
            nextCommunicationStatus,
            nextReplyStatus,
            nextInterviewStatus,
            nextWorkflowState,
            nextNextAction,
            nextSourcingStage,
            nextIsSourced,
            nextProfileUrl,
            nextCompany,
            nextApplicationContent,
            nextQuickSummary,
            driveLink,
            candidateId
        ]);

        const updatedCandidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);
        const exportResult = await exportAndPersistCandidate(updatedCandidate, db);
        const exportedCandidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);
        driveLink = exportResult.driveLink;
        exportedToSheets = exportResult.sheetsLogged;

        if (nextDecisionStatus !== existingCandidate.decision_status) {
            await logCandidateEvent(db, candidateId, 'status_change',
                `Status changed: ${existingCandidate.decision_status} → ${nextDecisionStatus}`,
                { from: existingCandidate.decision_status, to: nextDecisionStatus }
            );
        }

        res.json({
            candidate: exportedCandidate,
            export: {
                shortlisted: nextDecisionStatus === 'Shortlisted',
                exported: Boolean(driveLink) || exportedToSheets,
                driveLinked: Boolean(driveLink),
                sheetsLogged: exportedToSheets
            }
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Error updating candidate:', err);
        res.status(500).json({ error: 'Failed to update candidate' });
    }
});

// Get stats
router.get('/stats', async (req, res) => {
    try {
        const db = await getDb();
        const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN decision_status = 'Shortlisted' THEN 1 END) as shortlisted,
        COUNT(CASE WHEN decision_status = 'Rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN decision_status = 'Review Required' THEN 1 END) as review,
        AVG(overall_score) as avg_score
      FROM candidates
    `);
        res.json(stats);
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// --- Employee Routes ---
router.get('/employees', async (req, res) => {
    try {
        const db = await getDb();
        const employees = await db.all('SELECT * FROM employees ORDER BY name ASC');
        res.json(employees);
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching employees:', err);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

router.post('/employees', async (req, res) => {
    try {
        const { name, role, department, email, join_date, status, performance_rating, avatar } = req.body;

        // Validation
        const validName = validateString(name);
        const validRole = validateString(role);
        const validDept = validateString(department);
        const validEmail = validateString(email);
        const validStatus = validateString(status);

        if (!validName || !validRole || !validDept || !validEmail || !validStatus) {
            return res.status(400).json({ error: 'Invalid or missing required fields' });
        }

        if (!validateEmail(validEmail)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (join_date && !/^\d{4}-\d{2}-\d{2}$/.test(join_date)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        }

        const rating = parseFloat(performance_rating || 0);
        if (isNaN(rating) || rating < 0 || rating > 5) {
            return res.status(400).json({ error: 'Performance rating must be between 0 and 5' });
        }

        const db = await getDb();
        const result = await db.run(`
            INSERT INTO employees (name, role, department, email, join_date, status, performance_rating, avatar)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [validName, validRole, validDept, validEmail, join_date || new Date().toISOString().split('T')[0], validStatus, rating, avatar || '']);

        res.status(201).json({ 
            message: 'Employee added successfully',
            id: result.lastID 
        });
    } catch (err: unknown) {
        if (errMsg(err)?.includes('UNIQUE constraint failed') || ((err as any)?.code) === '23505') {
            return res.status(409).json({ error: 'Employee with this email already exists' });
        }
        console.error('[HR Agent] Error adding employee:', err);
        res.status(500).json({ error: 'Failed to add employee' });
    }
});

// --- Job Routes ---
router.get('/jobs', async (req, res) => {
    try {
        const db = await getDb();
        const jobs = await db.all('SELECT * FROM jobs ORDER BY posted_date DESC');
        res.json(jobs);
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching jobs:', err);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

router.post('/jobs', async (req, res) => {
    try {
        const { title, department, location, type, status, description, requirements } = req.body;

        // Validation
        const validTitle = validateString(title);
        const validDept = validateString(department);
        const validLocation = validateString(location);
        const validType = validateString(type);
        const validStatus = validateString(status);

        if (!validTitle || !validDept || !validLocation) {
            return res.status(400).json({ error: 'Missing required fields: title, department, location' });
        }

        const validTypes = ['Full-time', 'Part-time', 'Contract', 'Internship'];
        if (validType && !validTypes.includes(validType)) {
            return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
        }

        const validStatuses = ['Open', 'Closed', 'On Hold'];
        if (validStatus && !validStatuses.includes(validStatus)) {
            return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        let reqJson = '[]';
        if (requirements) {
            try {
                reqJson = JSON.stringify(requirements);
            } catch (e) {
                return res.status(400).json({ error: 'Requirements must be a valid JSON array' });
            }
        }

        const db = await getDb();
        const result = await db.run(`
            INSERT INTO jobs (title, department, location, type, status, description, requirements)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [validTitle, validDept, validLocation, validType || 'Full-time', validStatus || 'Open', description || '', reqJson]);

        const newJob = await db.get('SELECT * FROM jobs WHERE id = ?', result.lastID);
        res.status(201).json(newJob);
    } catch (err: unknown) {
        console.error('[HR Agent] Error adding job:', err);
        res.status(500).json({ error: 'Failed to add job' });
    }
});

// Run agent now
router.post('/run', async (req, res) => {
    try {
        runAgentCycle(); // Async run
        res.json({ message: 'Agent cycle triggered', timestamp: new Date().toISOString() });
    } catch (err: unknown) {
        console.error('[HR Agent] Error triggering cycle:', err);
        res.status(500).json({ error: 'Failed to trigger agent cycle' });
    }
});

// Start/Stop agent
router.post('/toggle', async (req, res) => {
    try {
        const { action } = req.body;

        if (!action || !['start', 'stop'].includes(action)) {
            return res.status(400).json({ error: 'Action must be "start" or "stop"' });
        }

        if (action === 'start') {
            startAgent();
        } else {
            stopAgent();
        }

        res.json({ status: getAgentStatus() });
    } catch (err: unknown) {
        console.error('[HR Agent] Error toggling agent:', err);
        res.status(500).json({ error: 'Failed to toggle agent' });
    }
});

// Get status and logs
// Vercel Cron Job endpoint — called every minute to run one agent cycle.
// Secured by CRON_SECRET env var (set in Vercel dashboard).
router.post('/trigger/cycle', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'];
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await runAgentCycle();
        res.json({ success: true, ran: true, ts: new Date().toISOString() });
    } catch (err: unknown) {
        console.error('[Cron] Agent cycle error:', err);
        res.status(500).json({ success: false, error: errMsg(err) });
    }
});

router.get('/status', async (req, res) => {
    try {
        const legacyStatus = getAgentStatus();
        const kairosStatus = getKairosStatus();
        const logs = getLogs(20);
        res.json({ ...legacyStatus, kairos: kairosStatus, logs, syncHealth });
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching status:', err);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// Kairos swarm — live agent registry
router.get('/kairos/agents', async (_req, res) => {
    try {
        const registry = getKairosRegistry();
        if (!registry) return res.json({ agents: [] });
        const agents = await registry.getAll();
        res.json({ agents });
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Kairos swarm — recent task queue
router.get('/kairos/tasks', async (_req, res) => {
    try {
        const queue = getKairosQueue();
        if (!queue) return res.json({ tasks: [] });
        const limit = Math.min(Number((_req as any).query?.limit ?? 100), 500);
        const tasks = await queue.getRecent(limit);
        res.json({ tasks });
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Notification bell — recent shortlisted/rejected candidates
router.get('/notifications', async (_req, res) => {
    try {
        const db = await getDb();
        const notifications = await db.all(`
            SELECT id, first_name, last_name, applied_role, decision_status, overall_score, created_at
            FROM candidates
            WHERE decision_status IN ('Shortlisted', 'Rejected')
            ORDER BY created_at DESC
            LIMIT 20
        `) as { id: number; first_name: string; last_name: string; applied_role: string; decision_status: string; overall_score: number; created_at: string }[];
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const unreadCount = notifications.filter(n => n.created_at >= since).length;
        res.json({ notifications, unreadCount });
    } catch (err: unknown) {
        console.error('[HR Agent] Notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Public endpoint — no JWT required (linked from candidate emails)
router.get('/unsubscribe', async (req, res) => {
    const { email, token } = req.query as { email?: string; token?: string };
    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
        return res.status(400).send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:60px">
              <h2>Invalid or expired unsubscribe link</h2>
              <p>This link may have expired or already been used. Please contact us directly if you wish to unsubscribe.</p>
            </body></html>
        `);
    }
    try {
        const db = await getDb();
        await db.run(
            `UPDATE candidates SET communication_status = 'Opted Out' WHERE email = ?`,
            [email.toLowerCase().trim()]
        );
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:60px">
              <h2>You have been unsubscribed</h2>
              <p>You will no longer receive automated recruitment emails from us.</p>
            </body></html>
        `);
    } catch (err: unknown) {
        console.error('[HR Agent] Unsubscribe error:', err);
        return res.status(500).send('An error occurred. Please try again later.');
    }
});

router.get('/schedule/availability', async (req, res) => {
    try {
        const days = req.query.days ? Number(req.query.days) : undefined;
        const slotMinutes = req.query.slotMinutes ? Number(req.query.slotMinutes) : undefined;
        const slots = await getInterviewAvailability({
            days: Number.isFinite(days as number) ? days : undefined,
            slotMinutes: Number.isFinite(slotMinutes as number) ? slotMinutes : undefined
        });

        res.json({
            success: true,
            timezone: process.env.INTERVIEW_TIMEZONE || 'Asia/Kolkata',
            slots
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching availability:', err);
        res.status(500).json({ error: getCalendarErrorMessage(err) });
    }
});

router.post('/candidates/:id/schedule', async (req, res) => {
    try {
        const candidateId = Number(req.params.id);
        const startTime = validateIsoDateTime(req.body?.startTime);
        const durationMinutes = Number(req.body?.durationMinutes || process.env.INTERVIEW_SLOT_MINUTES || 30);
        const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }

        if (!startTime) {
            return res.status(400).json({ error: 'Valid startTime is required' });
        }

        if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 180) {
            return res.status(400).json({ error: 'durationMinutes must be between 15 and 180' });
        }

        const db = await getDb();
        const candidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        const scheduled = await scheduleCandidateInterview(candidate, startTime, durationMinutes, notes);

        await db.run(`
            UPDATE candidates
            SET interview_status = ?,
                interview_scheduled_at = ?,
                interview_event_id = ?,
                interview_meet_link = ?,
                workflow_state = ?,
                next_action = ?,
                communication_status = ?
            WHERE id = ?
        `, [
            'Scheduled',
            scheduled.start,
            scheduled.eventId,
            scheduled.meetLink,
            'Interview Scheduled',
            'Prepare interviewer and candidate brief',
            'Interview Confirmed',
            candidateId
        ]);

        const updatedCandidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);
        await exportAndPersistCandidate(updatedCandidate, db);

        await logCandidateEvent(db, candidateId, 'interview_scheduled',
            `Interview scheduled: ${new Date(scheduled.start).toLocaleString('en-IN', { timeZone: process.env.INTERVIEW_TIMEZONE || 'Asia/Kolkata' })}`,
            { startTime: scheduled.start, meetLink: scheduled.meetLink, eventId: scheduled.eventId }
        );

        if (candidate.email) {
            const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Candidate';
            const role = candidate.applied_role || candidate.current_role || 'the role';
            await sendInterviewConfirmation(candidate.email, fullName, role, scheduled.start, scheduled.meetLink);
        }

        res.json({
            success: true,
            candidate: await db.get('SELECT * FROM candidates WHERE id = ?', candidateId),
            interview: scheduled
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Error scheduling interview:', err);
        res.status(500).json({ error: getCalendarErrorMessage(err) });
    }
});

router.post('/sync-candidates', async (_req, res) => {
    try {
        const db = await getDb();
        const result = await syncCandidateExports(db);

        res.json({
            success: true,
            ...result
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Error syncing candidates:', err);
        syncHealth.state = 'error';
        syncHealth.lastAttemptAt = new Date().toISOString();
        syncHealth.lastError = errMsg(err) || 'Failed to sync candidates';
        res.status(500).json({ error: 'Failed to sync candidates' });
    }
});

router.post('/sync-shortlisted', async (_req, res) => {
    try {
        const db = await getDb();
        const result = await syncCandidateExports(db, true);

        res.json({
            success: true,
            shortlistedCount: result.candidateCount,
            ...result
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Error syncing shortlisted candidates:', err);
        syncHealth.state = 'error';
        syncHealth.lastAttemptAt = new Date().toISOString();
        syncHealth.lastError = errMsg(err) || 'Failed to sync shortlisted candidates';
        res.status(500).json({ error: 'Failed to sync shortlisted candidates' });
    }
});

// OAuth Helper: Get Auth URL
router.get('/auth/url', async (req, res) => {
    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            return res.status(400).json({ 
                error: 'Google OAuth not configured',
                detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
            });
        }

        const oauth2Client = getOAuth2Client();
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: [
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/calendar'
            ]
        });
        res.json({ url });
    } catch (err: unknown) {
        console.error('[HR Agent] Error generating auth URL:', err);
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

// OAuth Helper: Callback — auto-saves token to .env and live-updates the running server
router.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
        return res.status(400).send('<h1>Error: No authorization code provided</h1>');
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code as string);
        const appUrl = process.env.APP_URL || 'http://127.0.0.1:3003';

        if (tokens.refresh_token) {
            // 1. Live-update the running oauth2Client — no restart needed
            setGoogleCredentials(tokens.refresh_token);

            // 2. Persist to DB (AES-256-GCM encrypted) so it survives restarts
            try {
                const db = await getDb();
                const encrypted = encryptToken(tokens.refresh_token);
                await db.run(
                    `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                    ['google_refresh_token', encrypted]
                );
                console.log('[HR Agent] Refresh token saved to database');
            } catch (dbErr: any) {
                console.warn('[HR Agent] Could not persist token to database:', errMsg(dbErr));
            }

            // 3. Redirect straight back to the app Settings page
            res.redirect(`${appUrl}/settings?oauth=success`);
        } else {
            // Google didn't return a refresh_token — most likely already authorized before.
            // Use the access_token to set credentials so the session still works.
            if (tokens.access_token) {
                oauth2Client.setCredentials(tokens);
            }
            res.redirect(`${appUrl}/settings?oauth=no_refresh_token`);
        }
    } catch (error: any) {
        console.error('[HR Agent] OAuth callback error:', error);
        const appUrl = process.env.APP_URL || 'http://127.0.0.1:3003';
        res.redirect(`${appUrl}/settings?oauth=error&detail=${encodeURIComponent(error.message || 'OAuth callback failed')}`);
    }
});

// PATCH job (update status and/or other fields)
router.patch('/jobs/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Job id must be a positive integer' });
        }

        const validStatuses = ['Open', 'Closed', 'On Hold'];
        const { status, title, department, location, description, requirements } = req.body;

        if (status !== undefined && !validStatuses.includes(status)) {
            return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        const db = await getDb();
        const existing = await db.get('SELECT * FROM jobs WHERE id = ?', id);
        if (!existing) return res.status(404).json({ error: 'Job not found' });

        const fields: string[] = [];
        const values: unknown[] = [];

        if (status !== undefined)      { fields.push('status = ?');      values.push(status); }
        if (title !== undefined)       { fields.push('title = ?');       values.push(String(title)); }
        if (department !== undefined)  { fields.push('department = ?');  values.push(String(department)); }
        if (location !== undefined)    { fields.push('location = ?');    values.push(String(location)); }
        if (description !== undefined) { fields.push('description = ?'); values.push(String(description)); }
        if (requirements !== undefined) {
            fields.push('requirements = ?');
            values.push(JSON.stringify(requirements));
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No updatable fields provided' });
        }

        values.push(id);
        await db.run(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`, values);
        const updated = await db.get('SELECT * FROM jobs WHERE id = ?', id);
        res.json(updated);
    } catch (err: unknown) {
        console.error('[HR Agent] Error updating job:', err);
        res.status(500).json({ error: 'Failed to update job' });
    }
});

// DELETE job
router.delete('/jobs/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Job id must be a positive integer' });
        }
        const db = await getDb();
        const job = await db.get('SELECT id FROM jobs WHERE id = ?', id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        await db.run('DELETE FROM jobs WHERE id = ?', id);
        res.json({ success: true, id });
    } catch (err: unknown) {
        console.error('[HR Agent] Error deleting job:', err);
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

// DELETE candidate
router.delete('/candidates/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }
        const db = await getDb();
        const candidate = await db.get('SELECT id FROM candidates WHERE id = ?', id);
        if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
        await db.run('DELETE FROM candidates WHERE id = ?', id);
        res.json({ success: true, id });
    } catch (err: unknown) {
        console.error('[HR Agent] Error deleting candidate:', err);
        res.status(500).json({ error: 'Failed to delete candidate' });
    }
});

// Send outreach email to a candidate
router.post('/candidates/:id/outreach', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }
        const db = await getDb();
        const candidate = await db.get('SELECT * FROM candidates WHERE id = ?', id);
        if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
        if (!candidate.email) return res.status(400).json({ error: 'Candidate has no email address' });

        const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Candidate';
        const role = candidate.applied_role || candidate.current_role || 'the role';
        const status = candidate.decision_status || 'Review Required';

        await sendAutomatedReply(candidate.email, fullName, status, role);

        await db.run(
            `UPDATE candidates SET communication_status = 'Outreach Sent' WHERE id = ?`,
            id
        );

        await logCandidateEvent(db, id, 'outreach_sent',
            `Outreach email sent to ${candidate.email}`,
            { email: candidate.email, role, status }
        );

        const updated = await db.get('SELECT * FROM candidates WHERE id = ?', id);
        res.json({ success: true, emailSent: true, message: `Outreach sent to ${candidate.email}`, candidate: updated });
    } catch (err: unknown) {
        console.error('[HR Agent] Outreach error:', err);
        res.status(500).json({ error: errMsg(err) || 'Failed to send outreach email' });
    }
});

// Integration status — live-tests Google token, reports real connection health
router.get('/integration-status', async (_req, res) => {
    try {
        const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
        const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);
        const oauthConfigured = hasClientId && hasClientSecret;

        // Ensure the stored DB token is loaded into the oauth2Client before checking.
        // This is the only token source on Vercel (env var GOOGLE_REFRESH_TOKEN is optional).
        if (oauthConfigured) await loadTokenFromDb();

        // hasRefreshToken is true if a token is available from either the env var OR the DB.
        const hasRefreshToken = hasCredentials();

        // Always generate an auth URL so the UI can offer re-authorization
        let authUrl: string | null = null;
        if (oauthConfigured) {
            try {
                authUrl = getOAuth2Client().generateAuthUrl({
                    access_type: 'offline',
                    prompt: 'consent',
                    scope: [
                        'https://www.googleapis.com/auth/gmail.modify',
                        'https://www.googleapis.com/auth/drive.file',
                        'https://www.googleapis.com/auth/spreadsheets',
                        'https://www.googleapis.com/auth/calendar',
                    ],
                });
            } catch { /* oauth2Client unavailable */ }
        }

        // Live-test the token — don't trust env vars alone
        let tokenValid = false;
        let tokenError: string | null = null;
        let connectedEmail: string | null = null;
        if (oauthConfigured && hasRefreshToken) {
            try {
                const gmail = (await import('../services/hr_agent/google_client')).getGmailClient();
                const profile = await gmail.users.getProfile({ userId: 'me' });
                tokenValid = true;
                connectedEmail = profile.data.emailAddress ?? null;
            } catch (err: unknown) {
                const msg: string = (err as any)?.response?.data?.error || errMsg(err);
                tokenError = msg.includes('invalid_grant')
                    ? 'Refresh token expired or revoked — re-authorization required.'
                    : msg.includes('invalid_client')
                    ? 'OAuth client credentials are invalid.'
                    : msg;
            }
        }

        const connected = tokenValid;

        res.json({
            google: {
                oauthConfigured,
                connected,
                connectedEmail,
                tokenValid,
                tokenError,
                gmail: connected,
                drive: connected,
                sheets: connected,
                calendar: connected,
                authUrl,
                missingVars: [
                    !hasClientId     ? 'GOOGLE_CLIENT_ID'     : null,
                    !hasClientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
                    // Only flag token missing if there's really no token (env var AND DB)
                    !hasRefreshToken ? 'GOOGLE_REFRESH_TOKEN (env) or OAuth authorization' : null,
                ].filter(Boolean) as string[],
            },
            whatsapp: {
                enabled: process.env.WHATSAPP_ENABLED === 'true',
                configured: Boolean(
                    process.env.TWILIO_ACCOUNT_SID &&
                    process.env.TWILIO_AUTH_TOKEN &&
                    process.env.TWILIO_WHATSAPP_FROM
                ),
                provider: process.env.WHATSAPP_PROVIDER || 'twilio',
            },
            gemini: {
                configured: Boolean(process.env.GEMINI_API_KEY),
            },
            openrouter: {
                configured: Boolean(process.env.OPENROUTER_API_KEY),
            },
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Integration status error:', err);
        res.status(500).json({ error: 'Failed to fetch integration status' });
    }
});

// Bulk import candidates from JSON array
router.post('/import', async (req, res) => {
    try {
        const rows: any[] = req.body?.candidates;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'Body must contain a non-empty "candidates" array' });
        }
        if (rows.length > 2000) {
            return res.status(400).json({ error: 'Maximum 2000 candidates per import batch' });
        }

        const db = await getDb();
        const openJobs = await db.all("SELECT id, title FROM jobs WHERE status = 'Open'") as { id: number; title: string }[];

        let inserted = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const firstName = String(row.first_name ?? '').trim().slice(0, 100);
                const lastName  = String(row.last_name  ?? '').trim().slice(0, 100);
                const email     = String(row.email      ?? '').trim().slice(0, 200);

                if (!firstName || !email) {
                    errors.push(`Row ${i + 1}: missing first_name or email`);
                    continue;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    errors.push(`Row ${i + 1}: invalid email "${email}"`);
                    continue;
                }

                const currentRole   = String(row.current_role    ?? '').trim().slice(0, 200);
                const appliedRole   = String(row.applied_role    ?? currentRole).trim().slice(0, 200);
                const source        = String(row.source          ?? 'CSV Import').trim().slice(0, 100);
                const location      = String(row.location        ?? '').trim().slice(0, 200);
                const phone         = String(row.phone           ?? '').trim().slice(0, 50);
                const expectedSalary = String(row.expected_salary ?? '').trim().slice(0, 100);
                const noticePeriod  = String(row.notice_period   ?? '').trim().slice(0, 100);
                const company       = String(row.company         ?? '').trim().slice(0, 200);
                const yearsExp      = Math.min(Math.max(parseFloat(row.years_experience) || 0, 0), 80);

                let skills: string[] = [];
                if (Array.isArray(row.skills)) {
                    skills = row.skills.map((s: any) => String(s).trim()).filter(Boolean);
                } else if (typeof row.skills === 'string' && row.skills.trim()) {
                    skills = row.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
                }

                // Auto-match to an open job by title
                let jobId: number | null = null;
                if (appliedRole) {
                    const matched = openJobs.find(j =>
                        j.title.toLowerCase().includes(appliedRole.toLowerCase()) ||
                        appliedRole.toLowerCase().includes(j.title.toLowerCase())
                    );
                    if (matched) jobId = matched.id;
                }

                const importResult = await db.run(`
                    INSERT INTO candidates (
                        job_id, first_name, last_name, email, phone, location,
                        years_experience, current_role, skills, applied_role,
                        expected_salary, notice_period, company, decision_status, source,
                        communication_status, reply_status, interview_status,
                        workflow_state, next_action
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO NOTHING
                `, [
                    jobId, firstName, lastName, email, phone, location,
                    yearsExp, currentRole, JSON.stringify(skills), appliedRole,
                    expectedSalary, noticePeriod, company, 'Review Required', source,
                    'Not Contacted', 'No Reply', 'Not Scheduled',
                    'New Intake', 'Screen candidate',
                ]);

                if (importResult.changes > 0) inserted++;
                else skipped++;

            } catch (rowErr: any) {
                errors.push(`Row ${i + 1}: ${errMsg(rowErr)}`);
            }
        }

        res.json({ success: true, inserted, skipped, errors: errors.slice(0, 50) });
    } catch (err: unknown) {
        console.error('[HR Agent] Import error:', err);
        res.status(500).json({ error: 'Import failed' });
    }
});

// Candidate activity event log
router.get('/candidates/:id/events', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }
        const db = await getDb();
        const events = await db.all(
            `SELECT * FROM candidate_events WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 50`,
            id
        );
        res.json(events);
    } catch (err: unknown) {
        console.error('[HR Agent] Error fetching candidate events:', err);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Batch re-screen — re-run decision engine on all Review Required candidates
router.post('/batch-screen', async (req, res) => {
    try {
        const db = await getDb();
        const candidates = await db.all(`
            SELECT id, first_name, last_name, email, current_role, applied_role,
                   location, years_experience, skills, application_content, source, decision_status
            FROM candidates
            WHERE decision_status = 'Review Required'
            ORDER BY created_at ASC
        `);

        const openJobs = await db.all(`
            SELECT id, title, location, description, requirements, status
            FROM jobs WHERE status = 'Open'
        `);

        let shortlisted = 0, rejected = 0, reviewRequired = 0;
        const results: Array<{ id: number; status: string; score: number }> = [];

        for (const candidate of candidates) {
            try {
                let skills: string[] = [];
                try { skills = JSON.parse(candidate.skills || '[]'); } catch { /* keep empty */ }

                const syntheticAnalysis = {
                    analysis_meta: { source: 'batch-rescore', confidence: 'medium' },
                    candidate: {
                        first_name: candidate.first_name,
                        last_name: candidate.last_name,
                        email: candidate.email,
                        location: candidate.location || '',
                    },
                    summary: {
                        years_experience: Number(candidate.years_experience) || 0,
                        current_role: candidate.current_role || '',
                        technical_skills: skills,
                        key_achievements: [],
                    },
                };

                const assessment = assessCandidateAgainstJobs(syntheticAnalysis, openJobs, {
                    applicationContent: candidate.application_content || '',
                    subject: candidate.applied_role || candidate.current_role || '',
                });

                const reasoningPayload = JSON.stringify({
                    matchedJobId: assessment.matchedJobId,
                    matchedJobTitle: assessment.matchedJobTitle,
                    inferredTargetRole: assessment.inferredTargetRole,
                    analysisSource: 'batch-rescore',
                    confidence: assessment.confidence,
                    matchedSkills: assessment.matchedSkills,
                    hardFlags: assessment.hardFlags,
                    reasons: assessment.reasons,
                });

                const newWorkflow = assessment.status === 'Shortlisted' ? 'Interview Ready'
                    : assessment.status === 'Rejected' ? 'Closed'
                    : 'Awaiting Review';
                const newNextAction = assessment.status === 'Shortlisted' ? 'Send shortlist outreach'
                    : assessment.status === 'Rejected' ? 'No action required'
                    : 'Recruiter review required against matched job criteria';

                await db.run(`
                    UPDATE candidates
                    SET decision_status = ?, overall_score = ?, breakdown_score = ?,
                        ai_reasoning = ?, workflow_state = ?, next_action = ?
                    WHERE id = ?
                `, [
                    assessment.status,
                    assessment.overallScore,
                    JSON.stringify(assessment.breakdown),
                    reasoningPayload,
                    newWorkflow,
                    newNextAction,
                    candidate.id,
                ]);

                await logCandidateEvent(db, candidate.id, 'rescreened',
                    `Batch re-screen: score ${assessment.overallScore}%, decision → ${assessment.status}`,
                    { score: assessment.overallScore, status: assessment.status, matchedJob: assessment.matchedJobTitle }
                );

                if (assessment.status === 'Shortlisted') shortlisted++;
                else if (assessment.status === 'Rejected') rejected++;
                else reviewRequired++;

                results.push({ id: candidate.id, status: assessment.status, score: assessment.overallScore });
            } catch (candidateErr: any) {
                console.warn(`[HR Agent] Failed to re-screen candidate ${candidate.id}:`, candidateErr?.message);
            }
        }

        res.json({ success: true, processed: candidates.length, shortlisted, rejected, reviewRequired, results });
    } catch (err: unknown) {
        console.error('[HR Agent] Batch screen error:', err);
        res.status(500).json({ error: 'Batch re-screen failed' });
    }
});

// ---------------------------------------------------------------------------
// Individual agent triggers
// ---------------------------------------------------------------------------

// Screener — re-score every candidate that is not yet finalized
router.post('/trigger/screener', async (_req, res) => {
    try {
        const db = await getDb();
        const candidates = await db.all(`
            SELECT id, first_name, last_name, email, current_role, applied_role,
                   location, years_experience, skills, application_content, decision_status
            FROM candidates
            WHERE decision_status NOT IN ('Shortlisted', 'Rejected')
            ORDER BY created_at ASC
        `);

        const openJobs = await db.all(`SELECT id, title, location, description, requirements, status FROM jobs WHERE status = 'Open'`);

        let shortlisted = 0, rejected = 0, reviewRequired = 0;

        for (const candidate of candidates) {
            try {
                let skills: string[] = [];
                try { skills = JSON.parse(candidate.skills || '[]'); } catch { /* ok */ }

                const syntheticAnalysis = {
                    analysis_meta: { source: 'screener-trigger', confidence: 'medium' },
                    candidate: { first_name: candidate.first_name, last_name: candidate.last_name, email: candidate.email, location: candidate.location || '' },
                    summary: { years_experience: Number(candidate.years_experience) || 0, current_role: candidate.current_role || '', technical_skills: skills, key_achievements: [] },
                };

                const assessment = assessCandidateAgainstJobs(syntheticAnalysis, openJobs, {
                    applicationContent: candidate.application_content || '',
                    subject: candidate.applied_role || candidate.current_role || '',
                });

                await db.run(
                    `UPDATE candidates SET decision_status = ?, overall_score = ?, breakdown_score = ?, ai_reasoning = ?,
                     workflow_state = ?, next_action = ? WHERE id = ?`,
                    [
                        assessment.status,
                        assessment.overallScore,
                        JSON.stringify(assessment.breakdown),
                        JSON.stringify({ matchedJobId: assessment.matchedJobId, matchedJobTitle: assessment.matchedJobTitle, analysisSource: 'screener-trigger', matchedSkills: assessment.matchedSkills, reasons: assessment.reasons }),
                        assessment.status === 'Shortlisted' ? 'Interview Ready' : assessment.status === 'Rejected' ? 'Closed' : 'Awaiting Review',
                        assessment.status === 'Shortlisted' ? 'Send shortlist outreach' : assessment.status === 'Rejected' ? 'No action required' : 'Recruiter review required',
                        candidate.id,
                    ]
                );

                await logCandidateEvent(db, candidate.id, 'rescreened',
                    `Screener agent: score ${assessment.overallScore}%, decision → ${assessment.status}`,
                    { score: assessment.overallScore, status: assessment.status }
                );

                if (assessment.status === 'Shortlisted') shortlisted++;
                else if (assessment.status === 'Rejected') rejected++;
                else reviewRequired++;
            } catch { /* skip individual failures */ }
        }

        res.json({ success: true, processed: candidates.length, shortlisted, rejected, reviewRequired });
    } catch (err: unknown) {
        console.error('[HR Agent] Screener trigger error:', err);
        res.status(500).json({ error: 'Screener trigger failed' });
    }
});

// Sourcer — source candidates from ScrapeGraphAI, LinkedIn Scout, and Merge.dev; AI-assess every import
router.post('/trigger/sourcer', async (req, res) => {
    try {
        const { roles: roleFilter, limitsPerSource } = (req.body ?? {}) as { roles?: string[]; limitsPerSource?: number };
        const perRoleLimit = (typeof limitsPerSource === 'number' && limitsPerSource > 0) ? limitsPerSource : 5;

        const db = await getDb();
        let openJobs = await db.all(
            `SELECT id, title, location, description, requirements, status FROM jobs WHERE status = 'Open' LIMIT 20`
        ) as OpenJob[];

        if (Array.isArray(roleFilter) && roleFilter.length > 0) {
            openJobs = openJobs.filter(j => roleFilter.includes(j.title));
        }

        if (openJobs.length === 0) {
            return res.json({ success: true, message: 'No open jobs to source candidates for.', imported: 0 });
        }

        const jobsForScouting = openJobs.map(j => ({ title: j.title, limit: perRoleLimit }));
        const sgStatus = getScrapeGraphStatus();
        const fcStatus = getFirecrawlStatus();
        const liStatus = getLinkedInSessionStatus();
        const mergeStatus = getMergeStatus();

        type SummaryRow = { source: string; role: string; found: number; imported: number; shortlisted: number; review: number; rejected: number; error?: string };
        const summary: SummaryRow[] = [];

        // ── Firecrawl ─────────────────────────────────────────────────────
        if (fcStatus.configured) {
            console.log('[Sourcer] Firecrawl: sourcing', openJobs.length, 'roles...');
            const fcResults = await sourceWithFirecrawlForRoles(jobsForScouting);
            for (const { role, candidates, error } of fcResults) {
                if (error) { summary.push({ source: 'Firecrawl', role, found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error }); continue; }
                let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                for (const c of candidates) {
                    try {
                        const r = await importFirecrawlCandidate(db, c, openJobs);
                        if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                    } catch { /* skip */ }
                }
                summary.push({ source: 'Firecrawl', role, found: candidates.length, imported, shortlisted, review, rejected });
            }
        }

        // ── ScrapeGraphAI ─────────────────────────────────────────────────
        if (sgStatus.configured) {
            console.log('[Sourcer] ScrapeGraphAI: sourcing', openJobs.length, 'roles...');
            const sgResults = await sourceForRoles(jobsForScouting);
            for (const { role, candidates, error } of sgResults) {
                if (error) { summary.push({ source: 'ScrapeGraph', role, found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error }); continue; }
                let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                for (const c of candidates) {
                    try {
                        const r = await importScrapeGraphCandidate(db, c, openJobs);
                        if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                    } catch { /* skip */ }
                }
                summary.push({ source: 'ScrapeGraph', role, found: candidates.length, imported, shortlisted, review, rejected });
            }
        }

        // ── LinkedIn Scout ────────────────────────────────────────────────
        if (liStatus.hasSession && liStatus.scriptExists) {
            console.log('[Sourcer] LinkedIn Scout: running Playwright scout...');
            try {
                await writeJobsInput(jobsForScouting);
                const result = await runLinkedInScout();
                if (result.success && result.outputFile) {
                    const liCandidates = await parseLinkedInOutput(result.outputFile);
                    let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                    for (const c of liCandidates) {
                        try {
                            const r = await importLinkedInCandidate(db, c, openJobs);
                            if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                        } catch { /* skip */ }
                    }
                    summary.push({ source: 'LinkedIn', role: 'All roles', found: liCandidates.length, imported, shortlisted, review, rejected });
                } else {
                    summary.push({ source: 'LinkedIn', role: 'All roles', found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error: result.error });
                }
            } catch (err: unknown) {
                summary.push({ source: 'LinkedIn', role: 'All roles', found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error: errMsg(err) });
            }
        }

        // ── GitHub (free — always runs) ───────────────────────────────────
        {
            const locationHint = openJobs[0]?.location || 'India';
            console.log('[Sourcer] GitHub: sourcing', openJobs.length, 'roles from', locationHint, '...');
            try {
                const ghResults = await sourceFromGitHub(jobsForScouting, locationHint);
                for (const { role, candidates, error } of ghResults) {
                    if (error) { summary.push({ source: 'GitHub', role, found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error }); continue; }
                    let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                    for (const c of candidates) {
                        try {
                            const r = await importGitHubCandidate(db, c, openJobs);
                            if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                        } catch { /* skip */ }
                    }
                    summary.push({ source: 'GitHub', role, found: candidates.length, imported, shortlisted, review, rejected });
                }
            } catch (err: unknown) {
                summary.push({ source: 'GitHub', role: 'All roles', found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error: errMsg(err) });
            }
        }

        // ── Stack Overflow (free — always runs) ───────────────────────────
        {
            const locationHint = openJobs[0]?.location || 'India';
            console.log('[Sourcer] Stack Overflow: sourcing', openJobs.length, 'roles...');
            try {
                const soResults = await sourceFromStackOverflow(jobsForScouting, locationHint);
                for (const { role, candidates, error } of soResults) {
                    if (error) { summary.push({ source: 'Stack Overflow', role, found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error }); continue; }
                    let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                    for (const c of candidates) {
                        try {
                            const r = await importStackOverflowCandidate(db, c, openJobs);
                            if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                        } catch { /* skip */ }
                    }
                    summary.push({ source: 'Stack Overflow', role, found: candidates.length, imported, shortlisted, review, rejected });
                }
            } catch (err: unknown) {
                summary.push({ source: 'Stack Overflow', role: 'All roles', found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error: errMsg(err) });
            }
        }

        // ── Python Scraper (Naukri + Wellfound via Selenium/DDG) ──────────
        const pythonRunning = await isPythonSourcerRunning();
        if (pythonRunning) {
            const locationHint = openJobs[0]?.location || 'India';
            console.log('[Sourcer] Python service online — sourcing via Naukri + Wellfound...');
            try {
                const pyResults = await sourceFromPython(jobsForScouting, locationHint);
                for (const { role, candidates, error } of pyResults) {
                    if (error) { summary.push({ source: 'Python Scraper', role, found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error }); continue; }
                    let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                    for (const c of candidates) {
                        try {
                            const r = await importPythonCandidate(db, c, openJobs);
                            if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                        } catch { /* skip */ }
                    }
                    summary.push({ source: 'Python Scraper', role, found: candidates.length, imported, shortlisted, review, rejected });
                }
            } catch (err: unknown) {
                summary.push({ source: 'Python Scraper', role: 'All roles', found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error: errMsg(err) });
            }
        }

        // ── Merge.dev ATS ─────────────────────────────────────────────────
        if (mergeStatus.enabled) {
            console.log('[Sourcer] Merge.dev: pulling candidates from connected ATS...');
            try {
                const mergeData = await getMergeCandidates(50);
                const mergeCandidates: any[] = mergeData?.results ?? [];
                let imported = 0, shortlisted = 0, review = 0, rejected = 0;
                for (const c of mergeCandidates) {
                    try {
                        const r = await importMergeCandidate(db, c, openJobs);
                        if (r.imported) { imported++; if (r.status === 'Shortlisted') shortlisted++; else if (r.status === 'Rejected') rejected++; else review++; }
                    } catch { /* skip */ }
                }
                summary.push({ source: 'Merge.dev', role: 'All roles', found: mergeCandidates.length, imported, shortlisted, review, rejected });
            } catch (err: unknown) {
                summary.push({ source: 'Merge.dev', role: 'All roles', found: 0, imported: 0, shortlisted: 0, review: 0, rejected: 0, error: errMsg(err) });
            }
        }

        const totalImported = summary.reduce((s, r) => s + r.imported, 0);
        const totalFound    = summary.reduce((s, r) => s + r.found, 0);
        const totalShortlisted = summary.reduce((s, r) => s + r.shortlisted, 0);
        const totalReview   = summary.reduce((s, r) => s + r.review, 0);
        const totalRejected = summary.reduce((s, r) => s + r.rejected, 0);

        const activeSources = [
            'GitHub',
            'Stack Overflow',
            fcStatus.configured && 'Firecrawl',
            sgStatus.configured && 'ScrapeGraph',
            liStatus.hasSession && liStatus.scriptExists && 'LinkedIn',
            mergeStatus.enabled && 'Merge.dev',
        ].filter(Boolean).join(' + ');

        const message = totalImported > 0
            ? `Sourced ${totalImported} new candidate${totalImported !== 1 ? 's' : ''} via ${activeSources} — ${totalShortlisted} shortlisted, ${totalReview} for review, ${totalRejected} rejected.`
            : `Sourcer scanned ${openJobs.length} role${openJobs.length !== 1 ? 's' : ''} via ${activeSources}. ${totalFound > 0 ? `Found ${totalFound} but all were duplicates.` : 'No new candidates found.'}`;

        res.json({ success: true, imported: totalImported, found: totalFound, shortlisted: totalShortlisted, review: totalReview, rejected: totalRejected, summary, message });
    } catch (err: unknown) {
        console.error('[HR Agent] Sourcer trigger error:', err);
        res.status(500).json({ error: 'Sourcer trigger failed', detail: errMsg(err) });
    }
});

// Sourcer config — session status and API status for all sourcing providers
router.get('/sourcer/config', async (_req, res) => {
    try {
        const liStatus = getLinkedInSessionStatus();
        const sgStatus = getScrapeGraphStatus();
        const mergeStatus = getMergeStatus();

        const db = await getDb();
        const sourcedCount = await db.get(`SELECT COUNT(*) as count FROM candidates WHERE is_sourced = 1`) as { count: number };
        const recentSourced = await db.all(`
            SELECT first_name, last_name, applied_role, source, created_at
            FROM candidates
            WHERE is_sourced = 1
            ORDER BY created_at DESC
            LIMIT 5
        `) as { first_name: string; last_name: string; applied_role: string; source: string; created_at: string }[];

        const fcStatus2 = getFirecrawlStatus();
        const pyRunning = await isPythonSourcerRunning();
        res.json({
            github: {
                configured: true,
                enabled: true,
                authenticated: !!process.env.GITHUB_TOKEN,
                rateLimit: process.env.GITHUB_TOKEN ? '5000 req/hour' : '60 req/hour (unauthenticated)',
            },
            stackoverflow: {
                configured: true,
                enabled: true,
                authenticated: !!process.env.STACKOVERFLOW_KEY,
                rateLimit: process.env.STACKOVERFLOW_KEY ? '10000 req/day' : '300 req/day (unauthenticated)',
            },
            pythonScraper: {
                running: pyRunning,
                url: process.env.PYTHON_SOURCER_URL || 'http://localhost:5000',
                sources: ['Naukri', 'Wellfound'],
                note: pyRunning ? 'Online' : 'Offline — start with: cd job_sourcing && python api_service.py',
            },
            linkedin: {
                sessionActive: liStatus.hasSession,
                scriptReady: liStatus.scriptExists,
                sessionPath: liStatus.sessionPath,
                sourcerDir: liStatus.sourcerDir,
            },
            scrapeGraph: {
                configured: sgStatus.configured,
                enabled: sgStatus.enabled,
                baseUrl: sgStatus.baseUrl,
            },
            firecrawl: {
                configured: fcStatus2.configured,
                enabled: fcStatus2.enabled,
                baseUrl: fcStatus2.baseUrl,
            },
            merge: {
                configured: mergeStatus.configured,
                enabled: mergeStatus.enabled,
                hasAccountToken: mergeStatus.hasAccountToken,
            },
            stats: {
                totalSourced: sourcedCount.count,
                recentSourced,
            },
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Sourcer config error:', err);
        res.status(500).json({ error: 'Failed to load sourcer config' });
    }
});

// ── Candidate import helpers ──────────────────────────────────────────────────

type OpenJob = { id: number; title: string; location: string; description: string; requirements: string; status: string };
type ImportResult = { imported: boolean; status?: string; score?: number };

function splitName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function runSourcerAssessment(
    firstName: string, lastName: string, email: string, location: string,
    skills: string[], headline: string, content: string, targetRole: string, openJobs: OpenJob[]
) {
    const synthetic = {
        analysis_meta: { source: 'sourcer-import', confidence: 'low' as const },
        candidate: { first_name: firstName, last_name: lastName, email, location },
        summary: { years_experience: 0, current_role: headline, technical_skills: skills, key_achievements: [] as string[] },
    };
    return assessCandidateAgainstJobs(synthetic, openJobs, { applicationContent: content, subject: targetRole });
}

async function applyAssessment(db: any, email: string, assessment: ReturnType<typeof assessCandidateAgainstJobs>) {
    const workflowState = assessment.status === 'Shortlisted' ? 'Qualified'
        : assessment.status === 'Rejected' ? 'Rejected' : 'Review Required';
    const nextAction = assessment.status === 'Shortlisted' ? 'Contact candidate for initial conversation'
        : assessment.status === 'Rejected' ? 'Archive — profile below threshold'
        : 'Recruiter review required against matched job criteria';

    await db.run(`
        UPDATE candidates SET
            job_id = ?, applied_role = ?, overall_score = ?, breakdown_score = ?,
            decision_status = ?, ai_reasoning = ?, workflow_state = ?, next_action = ?
        WHERE email = ?
    `, [
        assessment.matchedJobId ?? null,
        assessment.matchedJobTitle ?? null,
        assessment.overallScore,
        JSON.stringify(assessment.breakdown),
        assessment.status,
        JSON.stringify({ matchedJobId: assessment.matchedJobId, matchedJobTitle: assessment.matchedJobTitle, matchedSkills: assessment.matchedSkills, reasons: assessment.reasons, analysisSource: 'sourcer-import' }),
        workflowState,
        nextAction,
        email,
    ]);
}

async function importScrapeGraphCandidate(db: any, c: ScrapeGraphCandidate, openJobs: OpenJob[]): Promise<ImportResult> {
    const { firstName, lastName } = splitName(c.name);
    const email = c.email && c.email.includes('@')
        ? c.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.sg@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const skillsJson = JSON.stringify(c.skills.slice(0, 20));
    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            skills, source, applied_role, is_sourced, sourcing_stage,
            profile_url, application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, c.headline.slice(0, 200), c.location.slice(0, 200), skillsJson,
        'ScrapeGraphAI', c.jobRole, c.profileUrl.slice(0, 500), c.about.slice(0, 2000), c.headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, c.location, c.skills, c.headline, c.about, c.jobRole, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

async function importLinkedInCandidate(db: any, c: import('../services/sourcer/linkedin_sourcer').LinkedInCandidate, openJobs: OpenJob[]): Promise<ImportResult> {
    const { firstName, lastName } = splitName(c.name);
    const email = c.email && c.email.includes('@')
        ? c.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.li@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const skillsList = c.skills ? c.skills.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 20) : [];
    const skillsJson = JSON.stringify(skillsList);
    const content = [c.about, c.experience, c.education].filter(Boolean).join('\n\n').slice(0, 3000);

    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            phone, company, skills, source, applied_role,
            is_sourced, sourcing_stage, profile_url,
            application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, c.headline.slice(0, 200), c.location.slice(0, 200),
        c.phone.slice(0, 50), c.company.slice(0, 200), skillsJson, 'LinkedIn Sourcer', c.jobRole,
        c.profileUrl.slice(0, 500), content, c.headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, c.location, skillsList, c.headline, content, c.jobRole, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

async function importFirecrawlCandidate(db: any, c: FirecrawlCandidate, openJobs: OpenJob[]): Promise<ImportResult> {
    const { firstName, lastName } = splitName(c.name);
    const email = c.email && c.email.includes('@')
        ? c.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.fc@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const skillsJson = JSON.stringify(c.skills.slice(0, 20));
    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            skills, source, applied_role, is_sourced, sourcing_stage,
            profile_url, application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, c.headline.slice(0, 200), c.location.slice(0, 200), skillsJson,
        'Firecrawl', c.jobRole, c.profileUrl.slice(0, 500), c.about.slice(0, 2000), c.headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, c.location, c.skills, c.headline, c.about, c.jobRole, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

async function importMergeCandidate(db: any, c: any, openJobs: OpenJob[]): Promise<ImportResult> {
    const firstName = String(c.first_name || c.name?.split(' ')[0] || '').trim();
    const lastName = String(c.last_name || c.name?.split(' ').slice(1).join(' ') || '').trim();
    if (!firstName) return { imported: false };

    const emailObj = Array.isArray(c.email_addresses) ? c.email_addresses[0] : null;
    const email = emailObj?.value
        ? String(emailObj.value).trim()
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.merge@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const headline = String(c.title || c.current_role || '').slice(0, 200);
    const location = String(c.locations?.[0]?.name || c.location || '').slice(0, 200);
    const skills: string[] = Array.isArray(c.tags) ? c.tags.map((t: any) => String(t)).slice(0, 20) : [];
    const content = String(c.summary || c.description || '').slice(0, 2000);
    const skillsJson = JSON.stringify(skills);

    // Best-guess the target role from open jobs
    const targetRole = openJobs[0]?.title ?? 'Unknown';

    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            skills, source, applied_role, is_sourced, sourcing_stage,
            application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, headline, location, skillsJson,
        'Merge.dev', targetRole, content, headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, location, skills, headline, content, targetRole, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

async function importGitHubCandidate(db: any, c: GitHubCandidate, openJobs: OpenJob[]): Promise<ImportResult> {
    const { firstName, lastName } = splitName(c.name || c.profileUrl.split('/').pop() || 'Unknown');
    const email = c.email && c.email.includes('@')
        ? c.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.gh@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const skillsJson = JSON.stringify(c.skills.slice(0, 20));
    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            skills, source, applied_role, is_sourced, sourcing_stage,
            profile_url, application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, c.headline.slice(0, 200), c.location.slice(0, 200), skillsJson,
        'GitHub', c.jobRole, c.profileUrl.slice(0, 500), c.about.slice(0, 2000), c.headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, c.location, c.skills, c.headline, c.about, c.jobRole, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

async function importStackOverflowCandidate(db: any, c: StackOverflowCandidate, openJobs: OpenJob[]): Promise<ImportResult> {
    const { firstName, lastName } = splitName(c.name || 'Unknown User');
    const email = c.email && c.email.includes('@')
        ? c.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.so@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const skillsJson = JSON.stringify(c.skills.slice(0, 20));
    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            skills, source, applied_role, is_sourced, sourcing_stage,
            profile_url, application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, c.headline.slice(0, 200), c.location.slice(0, 200), skillsJson,
        'Stack Overflow', c.jobRole, c.profileUrl.slice(0, 500), c.about.slice(0, 2000), c.headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, c.location, c.skills, c.headline, c.about, c.jobRole, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

async function importPythonCandidate(db: any, c: PythonSourcedCandidate, openJobs: OpenJob[]): Promise<ImportResult> {
    const { firstName, lastName } = splitName(c.name || 'Unknown');
    const suffix = c.source.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4) || 'py';
    const email = c.email && c.email.includes('@')
        ? c.email
        : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${suffix}@sourced.kairos`.replace(/\s+/g, '').replace(/\.+/g, '.');

    const existing = await db.get(`SELECT id FROM candidates WHERE email = ?`, [email]);
    if (existing) return { imported: false };

    const skillsJson = JSON.stringify(c.skills.slice(0, 20));
    await db.run(`
        INSERT INTO candidates (
            first_name, last_name, email, current_role, location,
            skills, source, applied_role, is_sourced, sourcing_stage,
            profile_url, application_content, quick_summary,
            decision_status, communication_status, reply_status, interview_status,
            workflow_state, next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Discovered', ?, ?, ?, 'Review Required', 'Not Contacted', 'No Reply', 'Not Scheduled', 'New Intake', 'Screen candidate')
    `, [firstName, lastName, email, c.headline.slice(0, 200), c.location.slice(0, 200), skillsJson,
        c.source, c.job_role, c.profile_url.slice(0, 500), c.about.slice(0, 2000), c.headline.slice(0, 300)]);

    const assessment = runSourcerAssessment(firstName, lastName, email, c.location, c.skills, c.headline, c.about, c.job_role, openJobs);
    await applyAssessment(db, email, assessment);
    return { imported: true, status: assessment.status, score: assessment.overallScore };
}

// Outreach — send outreach emails to shortlisted candidates not yet contacted
router.post('/trigger/outreach', async (_req, res) => {
    try {
        const db = await getDb();
        const pending = await db.all(`
            SELECT id, first_name, last_name, email, applied_role, current_role
            FROM candidates
            WHERE decision_status = 'Shortlisted'
              AND (communication_status = 'Acknowledged' OR communication_status IS NULL)
            ORDER BY created_at ASC
            LIMIT 50
        `) as { id: number; first_name: string; last_name: string; email: string; applied_role: string; current_role: string }[];

        let sent = 0;
        let failed = 0;

        for (const c of pending) {
            try {
                const role = c.applied_role || c.current_role || 'the role';
                await sendAutomatedReply(c.email, c.first_name, 'Shortlisted', role);
                await db.run(
                    `UPDATE candidates SET communication_status = 'Outreach Sent', reply_status = 'Awaiting Reply' WHERE id = ?`,
                    [c.id]
                );
                await logCandidateEvent(db, c.id, 'outreach_sent',
                    `Outreach agent sent shortlist email for ${role}`,
                    { role, trigger: 'outreach-agent' }
                );
                sent++;
            } catch {
                failed++;
            }
        }

        res.json({
            success: true,
            sent,
            failed,
            skipped: 0,
            message: sent > 0
                ? `Outreach sent to ${sent} shortlisted candidate${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}.`
                : 'No shortlisted candidates pending outreach.',
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Outreach trigger error:', err);
        res.status(500).json({ error: 'Outreach trigger failed' });
    }
});

// Scheduler — queue interview slots for shortlisted candidates who replied
router.post('/trigger/scheduler', async (_req, res) => {
    try {
        const db = await getDb();
        const eligible = await db.all(`
            SELECT id, first_name, last_name, email, applied_role, current_role
            FROM candidates
            WHERE decision_status = 'Shortlisted'
              AND interview_status = 'Not Scheduled'
              AND communication_status = 'Outreach Sent'
            ORDER BY created_at ASC
            LIMIT 20
        `) as { id: number; first_name: string; last_name: string; email: string; applied_role: string; current_role: string }[];

        let queued = 0;

        for (const c of eligible) {
            try {
                await db.run(
                    `UPDATE candidates SET interview_status = 'Pending Confirmation', next_action = 'Awaiting candidate reply to confirm slot' WHERE id = ?`,
                    [c.id]
                );
                await logCandidateEvent(db, c.id, 'interview_scheduled',
                    `Scheduler agent queued interview confirmation for ${c.applied_role || c.current_role || 'the role'}`,
                    { trigger: 'scheduler-agent' }
                );
                queued++;
            } catch { /* skip */ }
        }

        res.json({
            success: true,
            queued,
            message: queued > 0
                ? `Interview confirmation queued for ${queued} candidate${queued !== 1 ? 's' : ''}. Awaiting their reply to confirm slots.`
                : 'No candidates currently eligible for interview scheduling. Ensure outreach has been sent first.',
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Scheduler trigger error:', err);
        res.status(500).json({ error: 'Scheduler trigger failed' });
    }
});

// Coordinator — run full pipeline health check and sync
router.post('/trigger/coordinator', async (_req, res) => {
    try {
        const db = await getDb();
        const [total, shortlisted, rejected, review, pending, interviews] = await Promise.all([
            db.get(`SELECT COUNT(*) as n FROM candidates`) as Promise<{ n: number }>,
            db.get(`SELECT COUNT(*) as n FROM candidates WHERE decision_status = 'Shortlisted'`) as Promise<{ n: number }>,
            db.get(`SELECT COUNT(*) as n FROM candidates WHERE decision_status = 'Rejected'`) as Promise<{ n: number }>,
            db.get(`SELECT COUNT(*) as n FROM candidates WHERE decision_status = 'Review Required'`) as Promise<{ n: number }>,
            db.get(`SELECT COUNT(*) as n FROM candidates WHERE communication_status = 'Acknowledged' AND decision_status = 'Shortlisted'`) as Promise<{ n: number }>,
            db.get(`SELECT COUNT(*) as n FROM candidates WHERE interview_status = 'Scheduled'`) as Promise<{ n: number }>,
        ]);

        const openJobs = await db.all(`SELECT COUNT(*) as n FROM jobs WHERE status = 'Open'`) as { n: number }[];

        const health = (review as any).n > 5 ? 'warning' : (pending as any).n > 3 ? 'attention' : 'healthy';
        const actions: string[] = [];
        if ((review as any).n > 0) actions.push(`${(review as any).n} candidate${(review as any).n !== 1 ? 's' : ''} need recruiter review`);
        if ((pending as any).n > 0) actions.push(`${(pending as any).n} shortlisted candidate${(pending as any).n !== 1 ? 's' : ''} awaiting outreach`);

        res.json({
            success: true,
            health,
            pipeline: {
                total: (total as any).n,
                shortlisted: (shortlisted as any).n,
                rejected: (rejected as any).n,
                reviewRequired: (review as any).n,
                pendingOutreach: (pending as any).n,
                interviewsScheduled: (interviews as any).n,
                openJobs: openJobs[0]?.n ?? 0,
            },
            actions,
            message: actions.length > 0
                ? `Pipeline health: ${health}. Action needed: ${actions.join('; ')}.`
                : `Pipeline health: ${health}. All ${(total as any).n} candidates are processed with no blockers.`,
        });
    } catch (err: unknown) {
        console.error('[HR Agent] Coordinator trigger error:', err);
        res.status(500).json({ error: 'Coordinator trigger failed' });
    }
});

// ---------------------------------------------------------------------------
// Direct CV / PDF upload
// ---------------------------------------------------------------------------

router.post(
    '/upload-cv',
    express.raw({ type: 'application/pdf', limit: '10mb' }),
    async (req, res) => {
        try {
            const buffer = req.body as Buffer;
            if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                return res.status(400).json({ error: 'Request body must be a PDF file (Content-Type: application/pdf)' });
            }

            const fileName = typeof req.query.fileName === 'string'
                ? req.query.fileName.slice(0, 200)
                : 'resume.pdf';
            const subjectHint = typeof req.query.subject === 'string'
                ? req.query.subject.slice(0, 300)
                : '';

            // 1. Extract text
            let cvText: string;
            try {
                cvText = await extractTextFromPdf(buffer);
            } catch (err: unknown) {
                return res.status(422).json({ error: `PDF parsing failed: ${errMsg(err)}` });
            }

            // 2. AI analysis
            let aiData: any;
            try {
                aiData = await analyzeCandidateCV(cvText);
            } catch (err: unknown) {
                return res.status(422).json({ error: `AI analysis failed: ${errMsg(err)}` });
            }

            const db = await getDb();
            const openJobs = await db.all(
                `SELECT id, title, location, description, requirements, status FROM jobs WHERE status = 'Open'`
            );

            // 3. Decision engine
            const assessment = assessCandidateAgainstJobs(aiData, openJobs, {
                subject: subjectHint || aiData.summary?.current_role || '',
                applicationContent: cvText.substring(0, 2000),
            });

            const quickSummary = (() => {
                const name = [aiData.candidate?.first_name, aiData.candidate?.last_name].filter(Boolean).join(' ') || 'Candidate';
                const role = assessment.matchedJobTitle || assessment.inferredTargetRole || 'the role';
                if (assessment.status === 'Shortlisted') return `${name} is a strong match for ${role}, with solid alignment on skills and experience.`;
                if (assessment.status === 'Rejected') return `${name} is not a close fit for ${role}. ${assessment.reasons[assessment.reasons.length - 1] || ''}`.substring(0, 500);
                return `${name} needs recruiter review for ${role}. ${assessment.reasons[assessment.reasons.length - 1] || ''}`.substring(0, 500);
            })();

            const workflowState = assessment.status === 'Shortlisted' ? 'Interview Ready'
                : assessment.status === 'Rejected' ? 'Closed'
                : 'Awaiting Review';
            const nextAction = assessment.status === 'Shortlisted' ? 'Send shortlist outreach'
                : assessment.status === 'Rejected' ? 'No action required'
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
                reasons: assessment.reasons,
            });

            // 4. Insert / update candidate
            await db.run(`
                INSERT INTO candidates (
                    job_id, first_name, last_name, email, phone, location,
                    years_experience, current_role, skills, achievements,
                    overall_score, breakdown_score, decision_status,
                    ai_reasoning, source, applied_role, expected_salary, notice_period,
                    communication_status, reply_status, interview_status,
                    workflow_state, next_action, application_content, quick_summary
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    communication_status = excluded.communication_status,
                    reply_status        = excluded.reply_status,
                    interview_status    = excluded.interview_status,
                    workflow_state      = excluded.workflow_state,
                    next_action         = excluded.next_action,
                    application_content = excluded.application_content,
                    quick_summary       = excluded.quick_summary
            `, [
                assessment.matchedJobId,
                aiData.candidate.first_name, aiData.candidate.last_name,
                aiData.candidate.email, aiData.candidate.phone,
                aiData.candidate.location,
                aiData.summary.years_experience,
                aiData.summary.current_role,
                JSON.stringify(aiData.summary.technical_skills),
                JSON.stringify(aiData.summary.key_achievements),
                assessment.overallScore,
                JSON.stringify(assessment.breakdown),
                assessment.status,
                reasoningPayload,
                'Direct Upload',
                assessment.matchedJobTitle || assessment.inferredTargetRole,
                '', '',
                'Acknowledged', 'No Reply', 'Not Scheduled',
                workflowState, nextAction,
                cvText.substring(0, 5000),
                quickSummary,
            ]);

            const saved = await db.get(
                `SELECT * FROM candidates WHERE email = ?`,
                [aiData.candidate.email]
            );

            if (saved) {
                await logCandidateEvent(db, saved.id, 'cv_uploaded',
                    `CV uploaded directly: ${fileName}`,
                    { fileName, score: assessment.overallScore, status: assessment.status }
                );
            }

            res.status(201).json({
                success: true,
                candidate: saved,
                assessment: {
                    status: assessment.status,
                    overallScore: assessment.overallScore,
                    matchedJobTitle: assessment.matchedJobTitle,
                    inferredTargetRole: assessment.inferredTargetRole,
                    confidence: assessment.confidence,
                    matchedSkills: assessment.matchedSkills,
                    hardFlags: assessment.hardFlags,
                    reasons: assessment.reasons,
                },
                quickSummary,
            });
        } catch (err: unknown) {
            console.error('[HR Agent] CV upload error:', err);
            res.status(500).json({ error: errMsg(err) || 'CV upload failed' });
        }
    }
);

// ── WhatsApp ──────────────────────────────────────────────────────────────────

// Health / probe
router.get('/whatsapp/status', async (_req, res) => {
    try {
        const probe = await probeWhatsApp();
        res.json({ whatsapp: probe });
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Recent message log
router.get('/whatsapp/messages', async (req, res) => {
    try {
        const limit = Math.min(Number((req as any).query?.limit ?? 50), 200);
        const messages = await getRecentMessages(limit);
        res.json({ messages });
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Conversation by phone number
router.get('/whatsapp/conversation/:phone', async (req, res) => {
    try {
        const phone = decodeURIComponent(req.params.phone);
        const messages = await getConversation(phone, 100);
        res.json({ phone, messages });
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Manual send (from UI or API)
router.post('/whatsapp/send', async (req, res) => {
    try {
        const { phone, message, candidateEmail } = req.body as {
            phone: string;
            message: string;
            candidateEmail?: string;
        };
        if (!phone || !message) {
            return res.status(400).json({ error: 'phone and message required' });
        }
        const result = await sendWhatsAppMessage(phone, message, candidateEmail);
        res.json(result);
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

// Inbound webhook — OpenClaw posts here when a WhatsApp message arrives
router.post('/whatsapp/inbound', async (req, res) => {
    try {
        const { phone, body, candidateEmail } = req.body as {
            phone: string;
            body: string;
            candidateEmail?: string;
        };
        if (!phone || !body) {
            return res.status(400).json({ error: 'phone and body required' });
        }
        await recordInbound(phone, body, candidateEmail);

        // Queue receive_whatsapp task for the WhatsAppAgent to process
        const queue = getKairosQueue();
        if (queue) {
            const { randomUUID } = await import('crypto');
            await queue.enqueue({
                taskId: randomUUID(),
                taskType: 'receive_whatsapp',
                status: 'pending',
                priority: 3,
                maxRetries: 2,
                payload: { phone, body, candidateEmail },
            });
        }

        res.json({ received: true });
    } catch (err: unknown) {
        res.status(500).json({ error: errMsg(err) });
    }
});

export default router;
