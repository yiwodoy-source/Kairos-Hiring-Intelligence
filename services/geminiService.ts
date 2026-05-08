import { CandidateEvaluation, Candidate } from '../types.ts';
import { apiFetch } from './apiClient';

export const GeminiService = {
  /**
   * Generates a detailed job description based on title and key skills.
   */
  generateJobDescription: async (title: string, skills: string): Promise<string> => {
    try {
      const data = await apiFetch<{ text: string }>('/api/ai/generateJobDescription', {
        method: 'POST',
        body: JSON.stringify({ title, skills })
      });
      return data.text;
    } catch (error) {
      console.error('Error generating job description:', error);
      return `Failed to generate job description for ${title}.`;
    }
  },

  /**
   * Analyzes a candidate's resume/profile against a job description.
   */
  analyzeCandidate: async (candidate: Candidate, jobDescription: string): Promise<CandidateEvaluation> => {
    try {
      return await apiFetch<CandidateEvaluation>('/api/ai/analyzeCandidate', {
        method: 'POST',
        body: JSON.stringify({ candidate, jobDescription })
      });
    } catch (error) {
      console.error('Error analyzing candidate:', error);
      // Return a mock/fallback on error to prevent UI crash
      return {
        'First Name': candidate.name.split(' ')[0] || candidate.name,
        'Last Name': candidate.name.split(' ').slice(1).join(' ') || '',
        'Email': candidate.email || '',
        'Email Content': candidate.emailContent || 'N/A',
        'Summary': 'Analysis failed. Please try again later.',
        'CV': candidate.resumeText || '',
        'Scoring': '0',
        'Quick Read': 'Analysis unavailable'
      };
    }
  },

  /**
   * Generates a performance review based on notes and rating.
   */
  generatePerformanceReview: async (employeeName: string, role: string, notes: string, rating: number): Promise<string> => {
    try {
      const data = await apiFetch<{ text: string }>('/api/ai/generatePerformanceReview', {
        method: 'POST',
        body: JSON.stringify({ employeeName, role, notes, rating })
      });
      return data.text;
    } catch (error) {
      console.error('Error generating performance review:', error);
      return `Failed to generate review for ${employeeName}.`;
    }
  },

  /**
   * Sources candidates based on role and skills.
   */
  sourceCandidates: async (role: string, skills: string, location: string): Promise<Candidate[]> => {
    try {
      const data = await apiFetch<{ candidates?: Candidate[] }>('/api/ai/sourceCandidates', {
        method: 'POST',
        body: JSON.stringify({ role, skills, location })
      });
      return data.candidates || [];
    } catch (error) {
      console.error('Error sourcing candidates:', error);
      return [];
    }
  },


  /**
   * Parses a raw candidate profile text into structured data.
   */
  parseCandidateProfile: async (profileText: string): Promise<Candidate | null> => {
    try {
      const data = await apiFetch<{ candidate?: Candidate }>('/api/ai/parseCandidateProfile', {
        method: 'POST',
        body: JSON.stringify({ profileText })
      });
      return data.candidate || null;
    } catch (error) {
      console.error('Error parsing candidate profile:', error);
      return null;
    }
  }
};
