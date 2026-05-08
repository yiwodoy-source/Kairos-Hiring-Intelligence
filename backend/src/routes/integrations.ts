import express from 'express';
import { getFirecrawlStatus, probeFirecrawl, scrapeWithFirecrawl, searchWithFirecrawl } from '../services/integrations/firecrawl';
import { getMergeApplications, getMergeCandidates, getMergeJobs, getMergeStatus, probeMerge } from '../services/integrations/merge';
import { extractPublicProfile, getScrapeGraphStatus, probeScrapeGraph, scrapePublicPage, searchPublicProfiles } from '../services/integrations/scrapegraph';
import { buildCandidateWhatsAppMessage, getWhatsAppStatus, probeWhatsApp, sendWhatsAppMessage } from '../services/integrations/whatsapp';
import { getDb } from '../db';

const router = express.Router();

router.get('/status', async (_req, res) => {
    const [firecrawlProbe, mergeProbe, scrapeGraphProbe, whatsappProbe] = await Promise.all([
        probeFirecrawl(),
        probeMerge(),
        probeScrapeGraph(),
        probeWhatsApp()
    ]);

    res.json({
        firecrawl: {
            ...getFirecrawlStatus(),
            probe: firecrawlProbe
        },
        merge: {
            ...getMergeStatus(),
            probe: mergeProbe
        },
        scrapegraph: {
            ...getScrapeGraphStatus(),
            probe: scrapeGraphProbe
        },
        whatsapp: {
            ...getWhatsAppStatus(),
            probe: whatsappProbe
        }
    });
});

router.post('/whatsapp/send-candidate', async (req, res) => {
    try {
        const candidateId = Number(req.body?.candidateId);

        if (!Number.isInteger(candidateId) || candidateId <= 0) {
            return res.status(400).json({ error: 'candidateId must be a positive integer' });
        }

        const db = await getDb();
        const candidate = await db.get(`
            SELECT id, first_name, last_name, phone, applied_role, current_role, decision_status, communication_status
            FROM candidates
            WHERE id = ?
        `, candidateId);

        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        if (!candidate.phone) {
            return res.status(400).json({ error: 'Candidate phone number is missing' });
        }

        const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Candidate';
        const role = candidate.applied_role || candidate.current_role || 'the role';
        const body = typeof req.body?.body === 'string' && req.body.body.trim()
            ? req.body.body.trim()
            : buildCandidateWhatsAppMessage(fullName, role, candidate.decision_status || 'Applied');

        const result = await sendWhatsAppMessage(candidate.phone, body);

        await db.run(`
            UPDATE candidates
            SET communication_status = ?
            WHERE id = ?
        `, ['WhatsApp Sent', candidateId]);

        res.json({
            success: true,
            provider: 'twilio',
            candidateId,
            sid: result.sid,
            status: result.status
        });
    } catch (error: any) {
        console.error('[Integrations] WhatsApp send failed:', error);
        res.status(500).json({ error: error.message || 'WhatsApp send failed' });
    }
});

router.post('/firecrawl/search', async (req, res) => {
    try {
        const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
        const limit = Number(req.body?.limit || 8);

        if (!query) {
            return res.status(400).json({ error: 'query is required' });
        }

        const results = await searchWithFirecrawl(query, Number.isFinite(limit) ? limit : 8);
        res.json({ success: true, results });
    } catch (error: any) {
        console.error('[Integrations] Firecrawl search failed:', error);
        res.status(500).json({ error: error.message || 'Firecrawl search failed' });
    }
});

router.post('/firecrawl/scrape', async (req, res) => {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        if (!url) {
            return res.status(400).json({ error: 'url is required' });
        }

        const result = await scrapeWithFirecrawl(url);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[Integrations] Firecrawl scrape failed:', error);
        res.status(500).json({ error: error.message || 'Firecrawl scrape failed' });
    }
});

router.get('/merge/candidates', async (_req, res) => {
    try {
        const data = await getMergeCandidates();
        res.json(data);
    } catch (error: any) {
        console.error('[Integrations] Merge candidates failed:', error);
        res.status(500).json({ error: error.message || 'Merge candidates request failed' });
    }
});

router.get('/merge/jobs', async (_req, res) => {
    try {
        const data = await getMergeJobs();
        res.json(data);
    } catch (error: any) {
        console.error('[Integrations] Merge jobs failed:', error);
        res.status(500).json({ error: error.message || 'Merge jobs request failed' });
    }
});

router.get('/merge/applications', async (_req, res) => {
    try {
        const data = await getMergeApplications();
        res.json(data);
    } catch (error: any) {
        console.error('[Integrations] Merge applications failed:', error);
        res.status(500).json({ error: error.message || 'Merge applications request failed' });
    }
});

router.post('/scrapegraph/search-public', async (req, res) => {
    try {
        const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
        const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : undefined;
        const schema = req.body?.schema && typeof req.body.schema === 'object' ? req.body.schema : undefined;
        const numResults = Number(req.body?.numResults || 5);

        if (!query) {
            return res.status(400).json({ error: 'query is required' });
        }

        const result = await searchPublicProfiles(query, Number.isFinite(numResults) ? numResults : 5, prompt, schema);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[Integrations] ScrapeGraph search failed:', error);
        res.status(500).json({ error: error.message || 'ScrapeGraph search failed' });
    }
});

router.post('/scrapegraph/scrape-public', async (req, res) => {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        if (!url) {
            return res.status(400).json({ error: 'url is required' });
        }

        const result = await scrapePublicPage(url);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[Integrations] ScrapeGraph scrape failed:', error);
        res.status(500).json({ error: error.message || 'ScrapeGraph scrape failed' });
    }
});

router.post('/scrapegraph/extract-public-profile', async (req, res) => {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
        const schema = req.body?.schema && typeof req.body.schema === 'object' ? req.body.schema : undefined;

        if (!url || !prompt) {
            return res.status(400).json({ error: 'url and prompt are required' });
        }

        const result = await extractPublicProfile(url, prompt, schema);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[Integrations] ScrapeGraph extract failed:', error);
        res.status(500).json({ error: error.message || 'ScrapeGraph extract failed' });
    }
});

export default router;
