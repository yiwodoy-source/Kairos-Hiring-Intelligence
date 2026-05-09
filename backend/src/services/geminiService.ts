import { GoogleGenerativeAI } from '@google/generative-ai';
import { Candidate } from '../types';
import { searchWithFirecrawl } from './integrations/firecrawl';
import { searchPublicProfiles } from './integrations/scrapegraph';

const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_URL = 'https://google.serper.dev/search';
const MODEL = 'gemini-2.0-flash-exp';

let genAI: GoogleGenerativeAI | null = null;
if (API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(API_KEY);
    console.info('[AI] Gemini initialized successfully');
  } catch (err) {
    console.error('[AI] CRITICAL: Failed to initialize Gemini AI. Candidate analysis will throw — no silent mock fallback.', err);
    genAI = null;
  }
} else {
  console.error('[AI] CRITICAL: No Gemini API key found (GEMINI_API_KEY). Candidate analysis is disabled. Add GEMINI_API_KEY to backend/.env.');
}

const mockAnalyze = (candidate: Candidate, jobDescription: string) => {
  const summary = `${candidate.name} appears to be a reasonable fit for the role. Resume length: ${candidate.resumeText?.length || 0} chars.`;
  return {
    Scoring: '6',
    Summary: summary,
    CV: candidate.resumeText || '',
    'Quick Read': `${candidate.name} — ${candidate.email}`
  };
};

export async function analyzeCandidate(
  candidate: Candidate, 
  jobDescription: string, 
  options?: { mockMode?: boolean }
): Promise<{
  Scoring: string;
  Summary: string;
  CV: string;
  'Quick Read': string;
}> {
  if (!genAI) {
    if (options?.mockMode) return mockAnalyze(candidate, jobDescription);
    throw new Error('[AI] Gemini AI is not initialized. Set GEMINI_API_KEY in backend/.env. Refusing to produce mock hiring decisions.');
  }
  try {
    
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    });

    function sanitizeInput(input: string): string {
      if (typeof input !== 'string') return '';
      return input
        .substring(0, 4000)
        .replace(/<\/?cv_content|script|prompt|instruction[^>]*>/gi, '')
        .replace(/```/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    const safeJobDesc = sanitizeInput(jobDescription);
    const safeResume = sanitizeInput(candidate.resumeText || '');
    const safeName = candidate.name?.toString().substring(0, 200) || 'Unknown';
    const safeEmail = candidate.email?.toString().substring(0, 200) || 'Unknown';

    const prompt = `You are an expert HR recruiter. Analyze this candidate's resume.

Job: """
${safeJobDesc}
"""

Candidate: """
Name: ${safeName}
Email: ${safeEmail}
Resume: ${safeResume}
"""

Return JSON:
{
  "Scoring": "<1-10>",
  "Summary": "<paragraph>",
  "CV": "<text>",
  "Quick Read": "<line>"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.Scoring || !parsed.Summary) throw new Error('Missing fields');
      return {
        Scoring: String(parsed.Scoring).substring(0, 10),
        Summary: String(parsed.Summary).substring(0, 2000),
        CV: String(parsed.CV || safeResume).substring(0, 10000),
        'Quick Read': String(parsed['Quick Read'] || safeName).substring(0, 500)
      };
    } catch (parseErr) {
      console.warn('[AI] JSON Parse failed', parseErr);
      return {
        Scoring: (text.match(/Scoring[^0-9]*([0-9]+)/)?.[1]) || '5',
        Summary: text.split('\n').find((l: string) => l.length > 20)?.substring(0, 1000) || safeResume.substring(0, 1000),
        CV: safeResume,
        'Quick Read': safeName
      };
    }
  } catch (err) {
    // Re-throw — callers must handle AI failures explicitly rather than
    // silently receiving fabricated scores that flow into real hiring decisions.
    console.error('[AI] analyzeCandidate error:', err);
    throw err;
  }
}

export const generateJobDescription = async (title: string, skills: string) => {
  if (!genAI) return `Mock JD for ${title}. Skills: ${skills}`;
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `Write a professional job description for ${title}. Skills: ${skills}

Return as plain text, not JSON. Include sections for role overview, responsibilities, requirements, and benefits.
Maximum 800 words.`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('generateJobDescription error', err);
    return `Mock JD for ${title}. Skills: ${skills}`;
  }
};

export const generatePerformanceReview = async (employeeName: string, role: string, notes: string, rating: number) => {
  if (!genAI) return `Performance review for ${employeeName} (${role}): ${notes} — Rating: ${rating}/5.`;
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `Write a professional performance review for ${employeeName} (${role}).

Performance notes: ${notes}
Overall rating: ${rating}/5

Include:
- Overall assessment
- Key strengths
- Areas for development
- Goals for next period
- Final rating

Keep it constructive and professional. Maximum 500 words.`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('generatePerformanceReview error', err);
    return `Performance review for ${employeeName} (${role}) — Rating: ${rating}/5.`;
  }
};

export const sourceCandidates = async (role: string, skills: string, location: string) => {
  console.info(`🚀 Starting Profile-Based Discovery for: ${role} in ${location}`);

  const transportLayer_fetchSerperOrDDG = async (query: string): Promise<Array<{ title: string, link: string, snippet: string }>> => {
    if (process.env.SCRAPEGRAPH_API_KEY) {
      try {
        const response = await searchPublicProfiles(query, 8);
        const results = response?.data?.results || response?.results || [];
        if (Array.isArray(results) && results.length > 0) {
          return results.map((result: any) => ({
            title: result.title || result.metadata?.title || result.url || 'Untitled',
            link: result.url || result.sourceURL || '',
            snippet: result.description || result.markdown || result.content || ''
          })).filter((result: any) => Boolean(result.link));
        }
      } catch (e) { console.warn("ScrapeGraphAI search failed", e); }
    }

    if (process.env.FIRECRAWL_API_KEY) {
      try {
        const results = await searchWithFirecrawl(query, 10);
        if (results.length > 0) {
          return results.map(result => ({
            title: result.title,
            link: result.url,
            snippet: result.description || result.markdown || ''
          }));
        }
      } catch (e) { console.warn("Firecrawl search failed", e); }
    }

    if (process.env.SERPER_API_KEY) {
      try {
        const resp = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.SERPER_API_KEY },
          body: JSON.stringify({ q: query, num: 20, gl: 'in', hl: 'en' }),
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const data: any = await resp.json();
          return (data.organic || []).map((r: any) => ({ title: r.title, link: r.link, snippet: r.snippet }));
        }
      } catch (e) { console.warn("Serper API failed", e); }
    }

    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=in-en`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      if (resp.ok) {
        const html = await resp.text();
        const results: Array<{ title: string, link: string, snippet: string }> = [];
        const anchorRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = anchorRegex.exec(html)) && results.length < 15) {
          let link = match[1];
          const m = /uddg=([^&]+)/.exec(link);
          if (m) link = decodeURIComponent(m[1]);
          results.push({
            title: match[2].replace(/<[^>]+>/g, '').trim(),
            link,
            snippet: match[2].replace(/<[^>]+>/g, '').trim()
          });
        }
        return results;
      }
    } catch (e) { console.warn("DDG fallback failed", e); }
    return [];
  };

  const searchWebForCandidates = () => {
    throw new Error("Web search is disabled for candidate discovery. Use ProfileAdapter only.");
  };

  const BLOCKED_HOSTS = [
    'linkedin.com', 'indeed.com', 'naukri.com', 'foundit.in', 'monster.com'
  ];

  type PageType = 'PERSON_PROFILE' | 'PORTFOLIO' | 'RESUME' | 'ARTICLE' | 'JOB_POSTING' | 'COMPANY_PAGE' | 'OTHER';

  const isSearchEngineRedirect = (url: string): boolean => {
    const lowerUrl = (url || '').toLowerCase();
    return lowerUrl.includes('duckduckgo.com/y.js') || lowerUrl.includes('bing.com/aclick') || lowerUrl.includes('google.com/aclk');
  };

  const classifyPage = (title: string, snippet: string, url: string): PageType => {
    const t = (title || '').toLowerCase();
    const s = (snippet || '').toLowerCase();
    const u = (url || '').toLowerCase();
    const text = `${t} ${s}`;
    if (/how to|resume tips|career guide|best skills|step[- ]by[- ]step|examples of|job description|writing services/.test(text)) return 'ARTICLE';
    if (u.includes('/jobs') || t.includes('job') || s.includes('hiring')) return 'JOB_POSTING';
    if (u.includes('linkedin.com/in/') || u.includes('indeed.com/r/') || u.includes('indeed.com/resume') || u.includes('naukri.com')) return 'PERSON_PROFILE';
    if (u.includes('behance.net') || u.includes('dribbble.com') || u.includes('github.com')) return 'PORTFOLIO';
    if (t.includes('resume') || s.includes('cv')) return 'RESUME';
    return 'OTHER';
  };

  abstract class ProfileAdapter {
    abstract sourceName: string;
    abstract buildQuery(role: string, skills: string, location: string): string;

    isValidProfileUrl(url: string): boolean {
      return true;
    }

    allowDomain(url: string): boolean {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return !isSearchEngineRedirect(url) && !BLOCKED_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`));
      } catch {
        return false;
      }
    }

    async fetch(role: string, skills: string, location: string): Promise<Candidate[]> {
      const query = this.buildQuery(role, skills, location);
      console.log(`[${this.sourceName}] Searching: ${query}`);
      const rawResults = await transportLayer_fetchSerperOrDDG(query);

      return rawResults
        .filter(r => this.allowDomain(r.link))
        .filter(r => {
          const pt = classifyPage(r.title, r.snippet, r.link);
          return pt === 'PERSON_PROFILE' || pt === 'PORTFOLIO' || pt === 'RESUME';
        })
        .filter(r => this.isValidProfileUrl(r.link))
        .map(r => this.parseToCandidate(r, role, skills, location))
        .filter((c): c is Candidate => c !== null);
    }

    protected parseToCandidate(r: { title: string, link: string, snippet: string }, role: string, skills: string, location: string): Candidate | null {
      if (!r.link) return null;

      const name = this.extractName(r.title);
      if (!name) return null;

      return {
        id: `${this.sourceName.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        jobId: 'general',
        name: name,
        email: '',
        phone: '',
        location: location,
        resumeText: `SOURCE: ${this.sourceName}\nSUMMARY: ${r.snippet}\nLINK: ${r.link}`,
        sourcingSource: this.sourceName,
        isSourced: true,
        sourcingStage: 'Discovered',
        skills: skills.split(',').map((s: string) => s.trim()),
        experience: [],
        linkedinUrl: '',
        portfolioUrl: r.link,
        aiMatchScore: 0
      };
    }

    protected extractName(title: string): string | null {
      const t = (title || '').split('|')[0].split('...')[0].trim();
      const lower = t.toLowerCase();
      const ban = /(how to|guide|template|example|sample|tutorial|tips|best practices|writing|format|checklist|career advice|job description|resume)/;
      if (ban.test(lower)) return null;
      const parts = t.split(/ - | – | on /);
      if (parts.length > 0) {
        const name = parts[0].trim();
        if (/^[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}$/.test(name)) return name;
      }
      return null;
    }
  }

  class GitHubAdapter extends ProfileAdapter {
    sourceName = "GitHub";
    buildQuery(role: string, skills: string, location: string) {
      return `site:github.com "${role}" ${skills} ${location} -tab=repositories -tab=projects -tab=stars`;
    }
    isValidProfileUrl(url: string) {
      const u = url.toLowerCase();
      const path = u.replace(/^https?:\/\/(www\.)?github\.com\//, '');
      const segments = path.split('/').filter(Boolean);
      return u.includes('github.com/')
        && !u.includes('/topics/')
        && !u.includes('/search')
        && !u.includes('/orgs/')
        && segments.length === 1;
    }
    protected extractName(title: string): string | null {
      const m = title.match(/^([^(]+)\s\(/);
      const candidate = m ? m[1].trim() : title.split(' ')[0];
      return candidate && candidate.length > 1 ? candidate : null;
    }
  }

  class BehanceAdapter extends ProfileAdapter {
    sourceName = "Behance";
    buildQuery(role: string, skills: string, location: string) {
      return `site:behance.net "${role}" ${skills} ${location} -gallery`;
    }
    isValidProfileUrl(url: string) {
      return url.includes('behance.net/');
    }
  }

  class DribbbleAdapter extends ProfileAdapter {
    sourceName = "Dribbble";
    buildQuery(role: string, skills: string, location: string) {
      return `site:dribbble.com "${role}" ${skills} ${location} -shots -jobs`;
    }
    isValidProfileUrl(url: string) {
      return url.includes('dribbble.com');
    }
  }

  class PublicWebAdapter extends ProfileAdapter {
    sourceName = "Public Web";
    buildQuery(role: string, skills: string, location: string) {
      const primarySkill = skills.split(',').map((s: string) => s.trim()).filter(Boolean)[0] || role;
      return `"${role}" "${primarySkill}" ${location} ("portfolio" OR "resume" OR "profile" OR "about me") -site:linkedin.com -site:indeed.com -site:naukri.com -site:foundit.in`;
    }
    isValidProfileUrl(url: string) {
      const u = url.toLowerCase();
      return !isSearchEngineRedirect(url)
        && !u.includes('/jobs')
        && !u.includes('/careers')
        && !u.includes('/job/')
        && !u.includes('/vacancy')
        && !u.includes('/blog/')
        && !u.includes('/article/')
        && !u.includes('/resources/')
        && !u.includes('/templates/')
        && !u.includes('/resume-builder');
    }
    protected extractName(title: string): string | null {
      const baseName = super.extractName(title);
      if (baseName) return baseName;
      const cleaned = (title || '').replace(/\|.*$/, '').replace(/-.*$/, '').trim();
      if (/^[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}$/.test(cleaned)) return cleaned;
      return null;
    }
  }

  function detectRoleCategory(role: string) {
    const r = role.toLowerCase();
    if (r.match(/designer|ui|ux|graphic|visual|product designer|art director|creative/)) return "DESIGN";
    if (r.match(/developer|engineer|programmer|software|frontend|backend|full stack|devops|architect/)) return "TECH";
    if (r.match(/accountant|finance|financial|auditor|cpa/)) return "FINANCE";
    if (r.match(/sales|marketing|business development|seo|digital marketing|growth/)) return "BUSINESS";
    if (r.match(/hr|recruiter|talent|human resource|people ops/)) return "HR";
    return "GENERAL";
  }

  const category = detectRoleCategory(role);

  console.log(`\n🔵 STARTING PIPELINE: Candidate Discovery`);
  console.log(`📌 Query: Role="${role}", Skills="${skills}", Location="${location}"`);
  console.log(`🔍 Category: ${category}`);

  let adapters: ProfileAdapter[] = [
    new PublicWebAdapter()
  ];

  if (category === 'DESIGN') {
    adapters.push(new BehanceAdapter());
    adapters.push(new DribbbleAdapter());
  }
  if (category === 'TECH') {
    adapters.push(new GitHubAdapter());
  }

  console.log(`🛠️ Active Sources: ${adapters.map(a => a.sourceName).join(', ')}`);

  let allCandidates: Candidate[] = [];

  const results = await Promise.all(adapters.map(async a => {
    try {
      const cands = await a.fetch(role, skills, location);
      console.log(`✅ [${a.sourceName}] Retrieved ${cands.length} raw profiles`);
      return cands;
    } catch (err) {
      console.error(`❌ [${a.sourceName}] Failed:`, err);
      return [];
    }
  }));

  allCandidates = results.flat();

  const validCandidates = allCandidates.filter(c => {
    if (!c.linkedinUrl && !c.portfolioUrl) return false;
    if (!c.name || c.name.includes("Unknown")) return false;
    return true;
  });

  const uniqueCandidates = Array.from(new Map(validCandidates.map(c => [c.linkedinUrl || c.portfolioUrl, c])).values());

  const scoredCandidates = uniqueCandidates.map(c => {
    let score = 0;
    const text = (c.name + " " + c.resumeText).toLowerCase();
    const qRole = role.toLowerCase();
    const qSkills = skills.toLowerCase().split(',').map((s: string) => s.trim());

    if (text.includes(qRole)) score += 30;
    qSkills.forEach((s: string) => { if (text.includes(s)) score += 10; });
    if (text.includes(location.toLowerCase())) score += 15;

    if (c.sourcingSource === 'GitHub' && (qRole.includes('engineer') || qRole.includes('developer'))) score += 10;
    if (c.sourcingSource === 'Behance' && (qRole.includes('designer') || qRole.includes('creative'))) score += 10;
    if (c.sourcingSource === 'Public Web') score += 5;

    c.aiMatchScore = Math.min(95, score);
    (c as any).foundFor = { role, skills, location };

    return c;
  });
  const filteredCandidates = scoredCandidates.filter(c => (c.aiMatchScore || 0) >= 25);

  filteredCandidates.sort((a, b) => (b.aiMatchScore || 0) - (a.aiMatchScore || 0));

  console.info(`Pipeline finished: found ${filteredCandidates.length} valid, verified candidates.`);

  if (filteredCandidates.length > 0) return filteredCandidates;

  console.warn("No valid candidates found. Returning empty set. Mock data generation is disabled.");
  return [];
};

export const parseCandidateProfile = async (profileText: string) => {
  if (!genAI) {
    return {
      name: 'Parsed Candidate (Mock)',
      email: 'mock@example.com',
      skills: ['Mock Skill 1', 'Mock Skill 2'],
      experience: [],
      resumeText: profileText.substring(0, 200) + '...',
      sourcingSource: 'Manual Import',
      aiMatchScore: 70,
      isSourced: true,
      sourcingStage: 'Discovered',
      id: `parsed-${Date.now()}`
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `You are a recruitment sourcing AI.
Only return real human candidate profiles, resumes, or portfolios.
Never return blogs, guides, articles, or job descriptions.
If a result is not about a specific person, exclude it.

Extract structured candidate data from the following profile text/resume.

Profile Text:
"${profileText.substring(0, 5000)}"

Return ONLY a valid JSON object with the following fields:
- name (string)
- email (string, or empty if not found)
- phone (string, or empty if not found)
- location (string, or empty if not found)
- currentCompany (string, infer from experience)
- currentRole (string, infer from experience)
- skills (array of strings)
- experience (array of objects with role, company, duration, description)
- education (array of objects with degree, institution, year)
- linkedinUrl (string, or empty)
- portfolioUrl (string, or empty)
- summary (string, brief professional summary)

JSON:`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr);

    return {
      name: parsed.name || 'Unknown Candidate',
      email: parsed.email,
      phone: parsed.phone,
      location: parsed.location,
      company: parsed.currentCompany || (parsed.experience?.[0]?.company),
      resumeText: `Bio: ${parsed.summary || 'No summary available.'}`,
      sourcingSource: 'Manual Import',
      aiMatchScore: 85,
      isSourced: true,
      sourcingStage: 'Discovered',
      skills: parsed.skills || [],
      experience: parsed.experience || [],
      education: parsed.education || [],
      linkedinUrl: parsed.linkedinUrl,
      portfolioUrl: parsed.portfolioUrl,
      id: `parsed-${Date.now()}`
    };
  } catch (err) {
    console.error('parseCandidateProfile error', err);
    throw new Error('Failed to parse profile');
  }
};
