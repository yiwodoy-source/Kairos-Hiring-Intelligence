import express from 'express';
import { getDb } from '../db';
import { runAgentCycle, startAgent, stopAgent, getAgentStatus } from '../services/hr_agent/scheduler';
import { getLogs } from '../services/hr_agent/logger';
import { getOAuth2Client } from '../services/hr_agent/google_client';
import { exportCandidateRecord } from '../services/hr_agent/candidate_export';
import { getInterviewAvailability, scheduleCandidateInterview } from '../services/hr_agent/interview_scheduler';
import { sendInterviewConfirmation, sendAutomatedReply } from '../services/hr_agent/email_responder';
import { assessCandidateAgainstJobs } from '../services/hr_agent/decision_engine';

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

async function syncCandidateExports(db: any, whereClause = ''): Promise<CandidateSyncSummary> {
    syncHealth.state = 'running';
    syncHealth.lastAttemptAt = new Date().toISOString();
    syncHealth.lastError = null;

    const candidatesToSync = await db.all(`
        SELECT id, first_name, last_name, email, phone, location, current_role, years_experience, skills, achievements, overall_score, decision_status, ai_reasoning, source, applied_role, expected_salary, notice_period, communication_status, reply_status, interview_status, interview_scheduled_at, interview_event_id, interview_meet_link, workflow_state, next_action, sourcing_stage, is_sourced, profile_url, company, application_content, quick_summary, drive_file_link
        FROM candidates
        ${whereClause}
        ORDER BY created_at DESC
    `);

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
    } catch (err: any) {
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
            console.warn('[HR Agent] Candidate created but export failed:', exportErr.message);
        }

        res.status(201).json(candidate);
    } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed')) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed')) {
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
    } catch (err: any) {
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
    } catch (err: any) {
        console.error('[HR Agent] Error adding job:', err);
        res.status(500).json({ error: 'Failed to add job' });
    }
});

// Run agent now
router.post('/run', async (req, res) => {
    try {
        runAgentCycle(); // Async run
        res.json({ message: 'Agent cycle triggered', timestamp: new Date().toISOString() });
    } catch (err: any) {
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
    } catch (err: any) {
        console.error('[HR Agent] Error toggling agent:', err);
        res.status(500).json({ error: 'Failed to toggle agent' });
    }
});

// Get status and logs
router.get('/status', async (req, res) => {
    try {
        const status = getAgentStatus();
        const logs = getLogs(20);
        res.json({ ...status, logs, syncHealth });
    } catch (err: any) {
        console.error('[HR Agent] Error fetching status:', err);
        res.status(500).json({ error: 'Failed to fetch status' });
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
        console.error('[HR Agent] Error syncing candidates:', err);
        syncHealth.state = 'error';
        syncHealth.lastAttemptAt = new Date().toISOString();
        syncHealth.lastError = err.message || 'Failed to sync candidates';
        res.status(500).json({ error: 'Failed to sync candidates' });
    }
});

router.post('/sync-shortlisted', async (_req, res) => {
    try {
        const db = await getDb();
        const result = await syncCandidateExports(db, "WHERE decision_status = 'Shortlisted'");

        res.json({
            success: true,
            shortlistedCount: result.candidateCount,
            ...result
        });
    } catch (err: any) {
        console.error('[HR Agent] Error syncing shortlisted candidates:', err);
        syncHealth.state = 'error';
        syncHealth.lastAttemptAt = new Date().toISOString();
        syncHealth.lastError = err.message || 'Failed to sync shortlisted candidates';
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
    } catch (err: any) {
        console.error('[HR Agent] Error generating auth URL:', err);
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

// OAuth Helper: Callback to get refresh token
router.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
        return res.status(400).send('<h1>Error: No authorization code provided</h1>');
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code as string);

        if (tokens.refresh_token) {
            const escapedRefreshToken = escapeHtml(tokens.refresh_token);
            const appUrl = process.env.APP_URL || 'http://127.0.0.1:3003';
            res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authorization Successful</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .token-box { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; }
                h1 { color: #2e7d32; }
                .warning { color: #d32f2f; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>✅ Authorization Successful</h1>
            <p>Your Google Refresh Token is:</p>
            <div class="token-box">${escapedRefreshToken}</div>
            <p class="warning">Please add this to your <b>backend/.env</b> as <code>GOOGLE_REFRESH_TOKEN</code> and restart the server.</p>
            <p>After restarting the server, return to <a href="${escapeHtml(appUrl)}">NexusHR</a> and open the HR AI Agent screen to verify the integration.</p>
        </body>
        </html>
      `);
        } else {
            res.status(400).send(`
        <h1>Error: No refresh token received</h1>
        <p>If you have already authorized, try revoking access at <a href="https://myaccount.google.com/permissions">Google Permissions</a> and try again.</p>
        <p>Make sure you're using the correct Google account.</p>
      `);
        }
    } catch (error: any) {
        console.error('[HR Agent] OAuth callback error:', error);
        res.status(500).send(`<h1>Error: ${escapeHtml(error.message || 'OAuth callback failed')}</h1><p>Check server logs for details.</p>`);
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
        console.error('[HR Agent] Outreach error:', err);
        res.status(500).json({ error: err.message || 'Failed to send outreach email' });
    }
});

// Integration status — which Google services are configured
router.get('/integration-status', async (_req, res) => {
    try {
        const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
        const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);
        const hasRefreshToken = Boolean(process.env.GOOGLE_REFRESH_TOKEN);
        const oauthConfigured = hasClientId && hasClientSecret;
        const connected = oauthConfigured && hasRefreshToken;

        let authUrl: string | null = null;
        if (oauthConfigured && !hasRefreshToken) {
            try {
                const oauth2Client = getOAuth2Client();
                authUrl = oauth2Client.generateAuthUrl({
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

        res.json({
            google: {
                oauthConfigured,
                connected,
                gmail: connected,
                drive: connected,
                sheets: connected,
                calendar: connected,
                authUrl,
                missingVars: [
                    !hasClientId     ? 'GOOGLE_CLIENT_ID'     : null,
                    !hasClientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
                    !hasRefreshToken ? 'GOOGLE_REFRESH_TOKEN' : null,
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
    } catch (err: any) {
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

                await db.run(`
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

                const { n } = await db.get('SELECT changes() as n') as { n: number };
                if (n > 0) inserted++;
                else skipped++;

            } catch (rowErr: any) {
                errors.push(`Row ${i + 1}: ${rowErr.message}`);
            }
        }

        res.json({ success: true, inserted, skipped, errors: errors.slice(0, 50) });
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
        console.error('[HR Agent] Batch screen error:', err);
        res.status(500).json({ error: 'Batch re-screen failed' });
    }
});

export default router;
