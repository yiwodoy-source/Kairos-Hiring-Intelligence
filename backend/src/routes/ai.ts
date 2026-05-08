import express from 'express';
import { getDb } from '../db';
import { analyzeCandidate, generateJobDescription, generatePerformanceReview, sourceCandidates, parseCandidateProfile } from '../services/geminiService';

const router = express.Router();

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function buildInternalCandidateScore(candidate: any, role: string, skills: string, location: string): number {
  const roleNeedle = role.toLowerCase();
  const skillNeedles = skills.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const haystack = [
    candidate.first_name,
    candidate.last_name,
    candidate.current_role,
    candidate.applied_role,
    candidate.location,
    candidate.quick_summary,
    candidate.ai_reasoning,
    candidate.skills
  ].join(' ').toLowerCase();

  let score = 0;
  if (roleNeedle && haystack.includes(roleNeedle)) score += 35;
  for (const skill of skillNeedles) {
    if (skill && haystack.includes(skill)) score += 12;
  }
  if (location && haystack.includes(location.toLowerCase())) score += 15;
  score += Math.min(25, Number(candidate.overall_score || 0) / 4);
  return Math.min(95, Math.round(score));
}

async function sourceInternalCandidates(role: string, skills: string, location: string) {
  const db = await getDb();
  const rows = await db.all(`
    SELECT id, job_id, first_name, last_name, email, phone, location, current_role,
           skills, overall_score, decision_status, quick_summary, ai_reasoning,
           applied_role, source, profile_url, company, created_at
    FROM candidates
    ORDER BY created_at DESC
    LIMIT 50
  `);

  const mapped = rows.map((row: any) => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    const parsedSkills = parseStringArray(row.skills);
    const profileUrl = row.profile_url || '';
    return {
      id: String(row.id),
      jobId: row.job_id ? String(row.job_id) : 'unassigned',
      name: fullName || 'Unnamed Candidate',
      email: row.email || '',
      phone: row.phone || '',
      location: row.location || location || '',
      resumeText: row.quick_summary || row.ai_reasoning || 'Internal candidate profile',
      sourcingSource: 'Internal Database',
      isSourced: true,
      sourcingStage: 'Discovered',
      status: row.decision_status || 'Review Required',
      aiMatchScore: buildInternalCandidateScore(row, role, skills, location),
      currentRole: row.current_role || '',
      appliedRole: row.applied_role || '',
      profileUrl: profileUrl || undefined,
      portfolioUrl: profileUrl || undefined,
      company: row.company || undefined,
      skills: parsedSkills,
      experience: []
    };
  });

  return mapped
    .filter((candidate: any) => (candidate.aiMatchScore || 0) >= 25)
    .sort((a: any, b: any) => (b.aiMatchScore || 0) - (a.aiMatchScore || 0))
    .slice(0, 12);
}

router.post('/analyzeCandidate', async (req, res) => {
  try {
    const { candidate, jobDescription } = req.body;
    const result = await analyzeCandidate(candidate, jobDescription);
    res.json(result);
  } catch (err: any) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: err.message || 'AI error' });
  }
});

router.post('/generateJobDescription', async (req, res) => {
  try {
    const { title, skills } = req.body;
    const text = await generateJobDescription(title, skills);
    res.json({ text });
  } catch (err: any) {
    console.error('AI generateJobDescription error:', err);
    res.status(500).json({ error: err.message || 'AI error' });
  }
});

router.post('/generatePerformanceReview', async (req, res) => {
  try {
    const { employeeName, role, notes, rating } = req.body;
    const text = await generatePerformanceReview(employeeName, role, notes, rating);
    res.json({ text });
  } catch (err: any) {
    console.error('AI generatePerformanceReview error:', err);
    res.status(500).json({ error: err.message || 'AI error' });
  }
});

router.post('/sourceCandidates', async (req, res) => {
  try {
    const { role, skills, location } = req.body;
    const [externalCandidates, internalCandidates] = await Promise.all([
      sourceCandidates(role, skills, location),
      sourceInternalCandidates(role, skills, location)
    ]);

    const seen = new Set<string>();
    const merged = [...internalCandidates, ...externalCandidates].filter((candidate: any) => {
      const key = [
        candidate.email || '',
        candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl || '',
        candidate.name || ''
      ].join('|').toLowerCase();

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ candidates: merged });
  } catch (err: any) {
    console.error('AI sourceCandidates error:', err);
    res.status(500).json({ error: err.message || 'AI error' });
  }
});

router.post('/parseCandidateProfile', async (req, res) => {
  try {
    const { profileText } = req.body;
    const candidate = await parseCandidateProfile(profileText);
    res.json({ candidate });
  } catch (err: any) {
    console.error('AI parseCandidateProfile error:', err);
    res.status(500).json({ error: err.message || 'AI error' });
  }
});

export default router;
