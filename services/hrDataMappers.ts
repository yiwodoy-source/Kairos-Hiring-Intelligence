import { Candidate, CandidateStatus, Employee, EmployeeStatus, JobPosting, JobStatus } from '../types.ts';

export interface EmployeeRow {
  id: number | string;
  name?: string;
  role?: string;
  department?: string;
  email?: string;
  join_date?: string;
  status?: EmployeeStatus;
  performance_rating?: number;
  avatar?: string;
}

export interface JobRow {
  id: number | string;
  title?: string;
  department?: string;
  location?: string;
  type?: string;
  status?: JobStatus;
  description?: string;
  requirements?: string | string[] | null;
  posted_date?: string;
  applicants_count?: number;
}

export interface CandidateRow {
  id: number | string;
  job_id?: number | string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  current_role?: string;
  source?: string;
  applied_role?: string;
  expected_salary?: string;
  notice_period?: string;
  communication_status?: string;
  reply_status?: string;
  interview_status?: string;
  workflow_state?: string;
  next_action?: string;
  sourcing_stage?: string;
  is_sourced?: number | boolean;
  profile_url?: string;
  company?: string;
  application_content?: string;
  quick_summary?: string;
  skills?: string | string[] | null;
  ai_reasoning?: string;
  created_at?: string;
  decision_status?: CandidateStatus;
  overall_score?: number;
}

function parseStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function mapEmployee(row: EmployeeRow): Employee {
  return {
    id: String(row.id),
    name: row.name || 'Unnamed Employee',
    role: row.role || 'Unassigned',
    department: row.department || 'General',
    email: row.email || '',
    joinDate: row.join_date || '',
    status: row.status || EmployeeStatus.ACTIVE,
    performanceRating: Number(row.performance_rating || 0),
    avatar: row.avatar || ''
  };
}

export function mapJob(row: JobRow): JobPosting {
  return {
    id: String(row.id),
    title: row.title || 'Untitled Job',
    department: row.department || 'General',
    location: row.location || 'Remote',
    type: row.type || 'Full-time',
    status: row.status || JobStatus.OPEN,
    description: row.description || '',
    requirements: parseStringArray(row.requirements),
    postedDate: row.posted_date || '',
    applicantsCount: Number(row.applicants_count || 0)
  };
}

export function mapCandidate(row: CandidateRow): Candidate {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();

  return {
    id: String(row.id),
    jobId: row.job_id ? String(row.job_id) : 'unassigned',
    name: fullName || 'Unnamed Candidate',
    email: row.email || '',
    phone: row.phone || '',
    resumeText: row.ai_reasoning || 'No resume text available',
    emailContent: row.application_content || '',
    quickSummary: row.quick_summary || '',
    appliedDate: row.created_at || '',
    status: row.decision_status || CandidateStatus.REVIEW_REQUIRED,
    aiMatchScore: Number(row.overall_score || 0),
    currentRole: row.current_role || '',
    appliedRole: row.applied_role || '',
    expectedSalary: row.expected_salary || '',
    noticePeriod: row.notice_period || '',
    communicationStatus: row.communication_status || '',
    replyStatus: row.reply_status || '',
    interviewStatus: row.interview_status || '',
    workflowState: row.workflow_state || '',
    nextAction: row.next_action || '',
    sourcingSource: (row.source as any) || undefined,
    sourcingStage: (row.sourcing_stage as any) || undefined,
    isSourced: row.is_sourced === true || row.is_sourced === 1,
    profileUrl: row.profile_url || undefined,
    company: row.company || undefined,
    linkedinUrl: row.source === 'LinkedIn' ? row.profile_url || '' : '',
    portfolioUrl: row.source && row.source !== 'LinkedIn' ? row.profile_url || '' : '',
    location: row.location || undefined,
    skills: parseStringArray(row.skills)
  };
}
