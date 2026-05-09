import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logAgentActivity } from './logger';
import { CvAnalysisSchema } from '../../lib/ai-schemas';
import { withRetry } from '../../lib/retry';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'NexusHR AI Agent',
  }
});

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

async function analyzeWithGemini(prompt: string): Promise<any> {
  if (!genAI) throw new Error('Gemini API key not configured');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const result = await model.generateContent(prompt);
  const content = result.response.text();
  if (!content) throw new Error('Empty response from Gemini');

  // Robust extraction
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;

  const raw = JSON.parse(jsonStr);
  if (!raw.candidate || !raw.fit_score) throw new Error('Invalid JSON structure from Gemini');

  return CvAnalysisSchema.parse(raw);
}

async function keywordMatchingFallback(cvText: string): Promise<any> {
  logAgentActivity('AI services unavailable. Triggering Keyword Matching Fallback (Local Brain)...', 'INFO');

  const emailMatch = cvText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = cvText.match(/(\+?\d{1,3}[- ]?)?\d{10}/);

  // Basic Name extraction (first line or before email)
  const lines = cvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const firstName = lines[0] ? lines[0].split(' ')[0] : 'Unknown';
  const lastName = lines[0] ? lines[0].split(' ').slice(1).join(' ') : 'Candidate';

  const techStack = [
    'React', 'Node', 'TypeScript', 'JavaScript', 'Python', 'Java', 'SQL',
    'AWS', 'Docker', 'Kubernetes', 'Tailwind', 'Next.js', 'Express',
    'MongoDB', 'PostgreSQL', 'Redux', 'GraphQL'
  ];

  const foundSkills = techStack.filter(skill =>
    new RegExp(`\\b${skill}\\b`, 'i').test(cvText)
  );

  // Naive scoring
  const skillScore = Math.min(60, foundSkills.length * 10);
  const overallScore = 40 + skillScore / 2; // Base 40 + up to 30 = 70 max for keyword matching

  return CvAnalysisSchema.parse({
    analysis_meta: { source: 'keyword-fallback', confidence: 'low' },
    candidate: {
      first_name: firstName,
      last_name: lastName,
      email: emailMatch ? emailMatch[0] : 'missing@example.com',
      location: 'Remote/Unknown',
      phone: phoneMatch ? phoneMatch[0] : '0000000000',
    },
    summary: {
      years_experience: 1,
      current_role: lines[1] || 'Professional',
      technical_skills: foundSkills,
      key_achievements: ['Extracted via Keyword Matching fallback'],
    },
    fit_score: {
      overall: overallScore,
      breakdown: { experience: 50, technical_skills: skillScore, achievements: 40, education: 50 },
      reasoning: [
        `Detected ${foundSkills.length} key technical skills: ${foundSkills.join(', ')}`,
        'Processed via local keyword matcher due to AI service downtime.',
      ],
    },
  });
}

export async function analyzeCandidateCV(cvText: string): Promise<any> {
  const prompt = `
    Analyze the following CV text and return a STRICT JSON object according to this schema:
    {
      "candidate": {
        "first_name": "string",
        "last_name": "string",
        "email": "string",
        "location": "string",
        "phone": "string"
      },
      "summary": {
        "years_experience": number,
        "current_role": "string",
        "technical_skills": ["string"],
        "key_achievements": ["string"]
      },
      "fit_score": {
        "overall": number,
        "breakdown": {
          "experience": number,
          "technical_skills": number,
          "achievements": number,
          "education": number
        },
        "reasoning": ["string"]
      }
    }

    CV TEXT:
    <cv_content>
    ${cvText.replace(/<\/cv_content>/g, '')}
    </cv_content>
  `;

  // Try OpenRouter first (up to 3 attempts with exponential backoff)
  try {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === '') {
      throw new Error('OpenRouter API key missing');
    }

    const response = await withRetry(
      () => openai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      { label: 'openrouter-cv-analysis', maxAttempts: 3, baseDelayMs: 800 }
    );

    const content = response.choices[0].message.content;
    if (!content) throw new Error('Empty response from OpenRouter');

    // Robust extraction: find the first { and last } to handle potential markdown wrappers
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;

    const raw = JSON.parse(jsonStr);
    if (!raw.candidate || !raw.fit_score) throw new Error('Incomplete JSON structure');

    return CvAnalysisSchema.parse({
      ...raw,
      analysis_meta: { source: 'openrouter', confidence: 'high' },
    });
  } catch (orError: any) {
    logAgentActivity(`OpenRouter analysis failed: ${orError.message}. Trying Gemini fallback...`, 'WARN');

    // Fallback to Gemini (up to 2 attempts)
    try {
      const geminiResult = await withRetry(
        () => analyzeWithGemini(prompt),
        { label: 'gemini-cv-analysis', maxAttempts: 2, baseDelayMs: 1000 }
      );
      return CvAnalysisSchema.parse({
        ...geminiResult,
        analysis_meta: { source: 'gemini', confidence: 'medium' },
      });
    } catch (geminiError: any) {
      logAgentActivity(`Gemini analysis failed: ${geminiError.message}. Falling back to Keyword Matching...`, 'WARN');

      // Final local fallback
      try {
        return await keywordMatchingFallback(cvText);
      } catch (fallbackError: any) {
        logAgentActivity(`Critical: Keyword Matcher also failed: ${fallbackError.message}`, 'ERROR');
        throw new Error(`AI Analysis failed completely (OR: ${orError.message}, Gemini: ${geminiError.message}, Local: ${fallbackError.message})`);
      }
    }
  }
}
