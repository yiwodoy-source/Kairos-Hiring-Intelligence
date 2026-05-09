import express from 'express';
import { getDb } from '../db';
import { getOpenClawStatus, probeOpenClaw } from '../services/openclaw/client';
import { runCandidateWorkflowWithOpenClaw } from '../services/openclaw/recruitment_orchestrator';
import { logAgentActivity } from '../services/hr_agent/logger';
import { log } from '../lib/logger';

const router = express.Router();

router.get('/status', async (_req, res) => {
    const status = getOpenClawStatus();
    const probe = await probeOpenClaw();
    res.json({
        ...status,
        probe
    });
});

router.post('/candidate/:id/run', async (req, res) => {
    try {
        console.log('[OpenClaw] candidate run handler entered', {
            path: req.originalUrl,
            method: req.method,
            params: req.params,
        });
        const candidateId = Number(req.params.id);
        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            console.log('[OpenClaw] invalid candidate id', req.params.id);
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }

        const db = await getDb();
        const candidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);
        if (!candidate) {
            console.log('[OpenClaw] candidate not found', candidateId);
            return res.status(404).json({ error: 'Candidate not found' });
        }

        const job = candidate.job_id
            ? await db.get('SELECT * FROM jobs WHERE id = ?', candidate.job_id)
            : null;

        log.info('openclaw orchestrator invoked', { candidateId, hasJob: Boolean(job) });

        const result = await runCandidateWorkflowWithOpenClaw(candidate, job);

        log.info('openclaw orchestrator completed', {
            candidateId,
            decision: result.parsed.recommended_decision_status,
        });

        res.json({
            success: true,
            candidateId,
            parsed: result.parsed,
            text: result.text,
            raw: result.raw,
        });
    } catch (error: any) {
        log.error('openclaw candidate orchestration failed', { error: error.message });
        res.status(500).json({
            error: error.message || 'OpenClaw candidate orchestration failed'
        });
    }
});

router.post('/candidate/:id/apply-recommendations', async (req, res) => {
    try {
        const candidateId = Number(req.params.id);
        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            return res.status(400).json({ error: 'Candidate id must be a positive integer' });
        }

        const {
            workflow_state,
            next_action,
            recommended_decision_status,
            recommended_communication_status,
            recommended_reply_status,
            recommended_interview_status,
            recommended_sourcing_stage
        } = req.body || {};

        const db = await getDb();
        const candidate = await db.get('SELECT id FROM candidates WHERE id = ?', candidateId);
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        await db.run(`
            UPDATE candidates
            SET workflow_state = COALESCE(?, workflow_state),
                next_action = COALESCE(?, next_action),
                decision_status = COALESCE(?, decision_status),
                communication_status = COALESCE(?, communication_status),
                reply_status = COALESCE(?, reply_status),
                interview_status = COALESCE(?, interview_status),
                sourcing_stage = COALESCE(?, sourcing_stage)
            WHERE id = ?
        `, [
            workflow_state || null,
            next_action || null,
            recommended_decision_status || null,
            recommended_communication_status || null,
            recommended_reply_status || null,
            recommended_interview_status || null,
            recommended_sourcing_stage || null,
            candidateId
        ]);

        const updatedCandidate = await db.get('SELECT * FROM candidates WHERE id = ?', candidateId);

        // Log the event in candidate timeline
        try {
            const parts: string[] = [];
            if (workflow_state) parts.push(`workflow → ${workflow_state}`);
            if (recommended_decision_status) parts.push(`decision → ${recommended_decision_status}`);
            if (next_action) parts.push(`next: ${next_action}`);
            await db.run(
                `INSERT INTO candidate_events (candidate_id, event_type, description, actor, metadata) VALUES (?, ?, ?, ?, ?)`,
                [candidateId, 'openclaw_advice', `AI Advisor applied: ${parts.join(', ')}`, 'openclaw', JSON.stringify(req.body)]
            );
        } catch { /* non-critical */ }

        logAgentActivity(`OpenClaw recommendations applied to candidate ${candidateId}`);

        res.json({
            success: true,
            candidate: updatedCandidate
        });
    } catch (error: any) {
        console.error('[OpenClaw] Failed to apply recommendations:', error);
        res.status(500).json({ error: error.message || 'Failed to apply OpenClaw recommendations' });
    }
});

// Bulk sweep — run OpenClaw on all Review Required candidates and auto-apply safe fields
router.post('/bulk-sweep', async (_req, res) => {
    const db = await getDb();

    const candidates = await db.all(`
        SELECT * FROM candidates
        WHERE decision_status = 'Review Required'
        ORDER BY created_at ASC
        LIMIT 50
    `);

    if (candidates.length === 0) {
        return res.json({ success: true, processed: 0, updated: 0, errors: 0, message: 'No Review Required candidates to process.' });
    }

    let updated = 0;
    let errors = 0;
    const details: Array<{ id: number; name: string; result?: string; error?: string }> = [];

    for (const candidate of candidates) {
        const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ');
        try {
            const job = candidate.job_id
                ? await db.get('SELECT * FROM jobs WHERE id = ?', candidate.job_id)
                : null;

            const result = await runCandidateWorkflowWithOpenClaw(candidate, job);

            // result.parsed is already Zod-validated with safe defaults
            const advice = result.parsed;

            // Only apply safe fields — never auto-advance decision_status to Shortlisted
            // (recruiter must confirm that). We do update workflow meta fields freely.
            const safeStatus = advice.recommended_decision_status === 'Rejected' ? 'Rejected' : null;

            await db.run(`
                UPDATE candidates
                SET workflow_state = COALESCE(?, workflow_state),
                    next_action    = COALESCE(?, next_action),
                    decision_status = COALESCE(?, decision_status),
                    sourcing_stage  = COALESCE(?, sourcing_stage)
                WHERE id = ?
            `, [
                advice.workflow_state || null,
                advice.next_action || null,
                safeStatus,
                advice.recommended_sourcing_stage || null,
                candidate.id,
            ]);

            try {
                const parts: string[] = [];
                if (advice.workflow_state) parts.push(`workflow → ${advice.workflow_state}`);
                if (safeStatus) parts.push(`decision → ${safeStatus}`);
                if (advice.next_action) parts.push(`next: ${advice.next_action}`);
                await db.run(
                    `INSERT INTO candidate_events (candidate_id, event_type, description, actor, metadata) VALUES (?, ?, ?, ?, ?)`,
                    [candidate.id, 'openclaw_advice', `Bulk AI Advisor: ${parts.join(', ') || 'workflow updated'}`, 'openclaw-bulk', JSON.stringify(advice)]
                );
            } catch { /* non-critical */ }

            updated++;
            details.push({ id: candidate.id, name: fullName, result: advice.recommended_decision_status || advice.workflow_state });
        } catch (err: any) {
            errors++;
            details.push({ id: candidate.id, name: fullName, error: err.message });
            logAgentActivity(`[OpenClaw bulk] Failed for candidate ${candidate.id}: ${err.message}`, 'WARN');
        }
    }

    const message = `AI Advisor processed ${candidates.length} candidate${candidates.length !== 1 ? 's' : ''}: ${updated} updated, ${errors} error${errors !== 1 ? 's' : ''}.`;
    logAgentActivity(message);

    res.json({ success: true, processed: candidates.length, updated, errors, details, message });
});

export default router;
