
export enum EmployeeStatus {
  ACTIVE = 'Active',
  ON_LEAVE = 'On Leave',
  TERMINATED = 'Terminated'
}

export enum JobStatus {
  OPEN = 'Open',
  CLOSED = 'Closed',
  ON_HOLD = 'On Hold'
}

export enum CandidateStatus {
  APPLIED = 'Applied',
  SCREENING = 'Screening',
  INTERVIEW = 'Interview',
  OFFER = 'Offer',
  REJECTED = 'Rejected',
  SHORTLISTED = 'Shortlisted',
  REVIEW_REQUIRED = 'Review Required'
}

export enum SourcingStage {
  DISCOVERED = 'Discovered',
  CONTACTED = 'Contacted',
  ENGAGED = 'Engaged',
  QUALIFIED = 'Qualified'
}

export enum SourcingSource {
  LINKEDIN = 'LinkedIn',
  GITHUB = 'GitHub',
  DRIBBBLE = 'Dribbble',
  NAUKRI = 'Naukri.com',
  INDEED = 'Indeed',
  SHINE = 'Shine.com',
  FOUNDIT = 'Foundit',
  GLASSDOOR = 'Glassdoor',
  TIMESJOBS = 'TimesJobs',
  FRESHERSWORLD = 'Freshersworld',
  INTERNSHALA = 'Internshala',
  APNA = 'Apna',
  HIRECT = 'Hirect',
  INSTAHYRE = 'Instahyre',
  HIRIST = 'Hirist',
  CUTSHORT = 'Cutshort',
  MANUAL = 'Manual'
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  joinDate: string;
  status: EmployeeStatus;
  performanceRating: number; // 1-5
  avatar: string;
}

export interface JobPosting {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string; // Full-time, Part-time
  status: JobStatus;
  description: string;
  requirements: string[];
  postedDate: string;
  applicantsCount: number;
}

export interface CandidateEvaluation {
  "First Name": string;
  "Last Name": string;
  "Email": string;
  "Email Content": string;
  "Summary": string;
  "CV": string;
  "Scoring": string;
  "Quick Read": string;
}

export interface Candidate {
  id: string;
  jobId: string;
  name: string;
  email?: string;
  phone?: string;
  resumeText: string;
  emailContent?: string;
  quickSummary?: string;
  status: CandidateStatus;
  aiMatchScore?: number;
  aiAnalysis?: string; // JSON string of CandidateEvaluation
  appliedDate: string;
  currentRole?: string;
  appliedRole?: string;
  expectedSalary?: string;
  noticePeriod?: string;
  communicationStatus?: string;
  replyStatus?: string;
  interviewStatus?: string;
  workflowState?: string;
  nextAction?: string;

  // Sourcing Fields
  isSourced?: boolean;
  sourcingSource?: SourcingSource;
  sourcingStage?: SourcingStage;
  profileUrl?: string;
  company?: string;
  location?: string;
  outreachCount?: number;

  // Enhanced Profile Data
  skills?: string[];
  experience?: {
    role: string;
    company: string;
    duration: string;
    description: string;
  }[];

  // Additional Contact Information
  linkedinUrl?: string;
  portfolioUrl?: string;
}
