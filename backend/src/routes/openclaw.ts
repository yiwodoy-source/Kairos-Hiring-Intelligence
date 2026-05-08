import express from 'express';
import { getDb } from '../db';
import { getOpenClawStatus, probeOpenClaw } from '../services/openclaw/client';
import { runCandidateWorkflowWithOpenClaw } from '../services/openclaw/recruitment_orchestrator';

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

        console.log('[OpenClaw] invoking orchestrator', {
            candidateId,
            hasJob: Boolean(job),
            email: candidate.email,
        });

        const result = await runCandidateWorkflowWithOpenClaw(candidate, job);

        console.log('[OpenClaw] orchestrator completed', {
            candidateId,
            textLength: result.text?.length || 0,
        });

        res.json({
            success: true,
            candidateId,
            text: result.text,
            raw: result.raw
        });
    } catch (error: any) {
        console.error('[OpenClaw] Candidate orchestration failed:', error);
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

        res.json({
            success: true,
            candidate: updatedCandidate
        });
    } catch (error: any) {
        console.error('[OpenClaw] Failed to apply recommendations:', error);
        res.status(500).json({ error: error.message || 'Failed to apply OpenClaw recommendations' });
    }
});

export default router;
