export interface Candidate {
  id: string;
  jobId: string;
  name: string;
  email: string;
  phone: string;
  resumeText: string;
  emailContent?: string;
  status?: string;
  aiMatchScore?: number;
  aiAnalysis?: string;
  appliedDate?: string;
  [key: string]: any;
}
