import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  MapPin,
  Users,
  ChevronRight,
  Briefcase,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Sparkles,
} from 'lucide-react';
import { JobPosting, Candidate, JobStatus, CandidateStatus } from '../types.ts';
import { apiFetch } from '../services/apiClient';
import { GeminiService } from '../services/geminiService';
import { JobRow, mapJob } from '../services/hrDataMappers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface JobsPageProps {
  jobs: JobPosting[];
  candidates: Candidate[];
  setJobs: React.Dispatch<React.SetStateAction<JobPosting[]>>;
}

interface NewJobForm {
  title: string;
  department: string;
  location: string;
  skills: string;
  description: string;
}

const DEPARTMENT_OPTIONS = [
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'Operations',
  'HR',
  'Finance',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getStatusConfig(status: JobStatus): { label: string; className: string } {
  switch (status) {
    case JobStatus.OPEN:
      return {
        label: 'Open',
        className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
      };
    case JobStatus.CLOSED:
      return {
        label: 'Closed',
        className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
      };
    case JobStatus.ON_HOLD:
      return {
        label: 'On Hold',
        className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
      };
    default:
      return {
        label: String(status),
        className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      };
  }
}

function nextStatus(current: JobStatus): JobStatus {
  if (current === JobStatus.OPEN) return JobStatus.ON_HOLD;
  if (current === JobStatus.ON_HOLD) return JobStatus.CLOSED;
  return JobStatus.OPEN;
}

// ---------------------------------------------------------------------------
// Pipeline micro-stats
// ---------------------------------------------------------------------------
interface PipelineStats {
  applied: number;
  shortlisted: number;
  interview: number;
  avgScore: number;
}

function usePipelineStats(jobId: string, candidates: Candidate[]): PipelineStats {
  return useMemo(() => {
    const jobCandidates = candidates.filter(c => c.jobId === jobId);
    if (jobCandidates.length === 0) {
      return { applied: 0, shortlisted: 0, interview: 0, avgScore: 0 };
    }
    const shortlisted = jobCandidates.filter(c => c.status === CandidateStatus.SHORTLISTED).length;
    const interview = jobCandidates.filter(c => c.status === CandidateStatus.INTERVIEW).length;
    const scored = jobCandidates.filter(c => typeof c.aiMatchScore === 'number' && c.aiMatchScore > 0);
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((sum, c) => sum + (c.aiMatchScore ?? 0), 0) / scored.length)
        : 0;
    return { applied: jobCandidates.length, shortlisted, interview, avgScore };
  }, [jobId, candidates]);
}

// ---------------------------------------------------------------------------
// Job Card
// ---------------------------------------------------------------------------
interface JobCardProps {
  job: JobPosting;
  candidates: Candidate[];
  onToggleStatus: (job: JobPosting) => void;
  onDelete: (job: JobPosting) => void;
}

const JobCard = React.memo<JobCardProps>(({ job, candidates, onToggleStatus, onDelete }) => {
  const stats = usePipelineStats(job.id, candidates);
  const statusConfig = getStatusConfig(job.status);
  const visibleReqs = job.requirements.slice(0, 3);
  const extraReqs = job.requirements.length - 3;

  const handleDelete = () => {
    if (window.confirm(`Delete "${job.title}"? This cannot be undone.`)) {
      onDelete(job);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-150 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white text-base leading-tight truncate">
            {job.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {job.department}
            {job.location && (
              <>
                <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="w-3 h-3 inline-block" />
                  {job.location}
                </span>
              </>
            )}
          </p>
        </div>
        <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${statusConfig.className}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Pipeline stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill icon={<Users className="w-3 h-3" />} value={stats.applied} label="Applied" />
        <StatPill icon={<CheckCircle2 className="w-3 h-3" />} value={stats.shortlisted} label="Listed" />
        <StatPill icon={<Clock className="w-3 h-3" />} value={stats.interview} label="Interview" />
        <StatPill
          icon={<AlertTriangle className="w-3 h-3" />}
          value={`${stats.avgScore}%`}
          label="Avg Score"
          highlight={stats.avgScore > 70}
        />
      </div>

      {/* Requirements tags */}
      {job.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleReqs.map(req => (
            <span
              key={req}
              className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium"
            >
              {req}
            </span>
          ))}
          {extraReqs > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
              +{extraReqs} more
            </span>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
        <button className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors">
          View pipeline
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleStatus(job)}
            title={`Toggle status (currently ${job.status})`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {job.status === JobStatus.OPEN
              ? <ToggleRight className="w-4 h-4 text-emerald-500" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDelete}
            title="Delete job"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
JobCard.displayName = 'JobCard';

// ---------------------------------------------------------------------------
// Stat Pill (inside JobCard)
// ---------------------------------------------------------------------------
interface StatPillProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  highlight?: boolean;
}

const StatPill: React.FC<StatPillProps> = ({ icon, value, label, highlight }) => (
  <div className="flex flex-col items-center gap-0.5 rounded-xl py-2 px-1 bg-slate-50 dark:bg-slate-800/60">
    <div className={`flex items-center gap-1 ${highlight ? 'text-violet-500' : 'text-slate-400 dark:text-slate-500'}`}>
      {icon}
    </div>
    <span className={`text-sm font-semibold leading-none ${highlight ? 'text-violet-600 dark:text-violet-400' : 'text-slate-800 dark:text-slate-200'}`}>
      {value}
    </span>
    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">{label}</span>
  </div>
);

// ---------------------------------------------------------------------------
// New Job Modal
// ---------------------------------------------------------------------------
interface NewJobModalProps {
  onClose: () => void;
  onCreated: (job: JobPosting) => void;
}

const EMPTY_FORM: NewJobForm = {
  title: '',
  department: 'Engineering',
  location: '',
  skills: '',
  description: '',
};

const NewJobModal: React.FC<NewJobModalProps> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState<NewJobForm>(EMPTY_FORM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback(<K extends keyof NewJobForm>(key: K, value: NewJobForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerateDescription = async () => {
    if (!form.title.trim()) {
      setError('Enter a job title before generating a description.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await GeminiService.generateJobDescription(form.title.trim(), form.skills.trim());
      setField('description', generated);
    } catch {
      setError('Failed to generate description. You can write one manually.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Job title is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const skillsArray = form.skills
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const payload = {
      title: form.title.trim(),
      department: form.department,
      location: form.location.trim() || 'Remote',
      type: 'Full-time',
      status: JobStatus.OPEN,
      description: form.description.trim(),
      requirements: skillsArray,
    };

    try {
      const row = await apiFetch<JobRow>('/api/hr-agent/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCreated(mapJob(row));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to create job: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
      aria-modal="true"
      role="dialog"
      aria-label="Create new job"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">New Job Posting</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Fill in the details below</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Job Title */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Job Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-colors"
              required
            />
          </div>

          {/* Department + Location (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Department
              </label>
              <select
                value={form.department}
                onChange={e => setField('department', e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-colors"
              >
                {DEPARTMENT_OPTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={form.location}
                onChange={e => setField('location', e.target.value)}
                placeholder="Remote, Bangalore..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-colors"
              />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Required Skills
              <span className="ml-1 font-normal text-slate-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.skills}
              onChange={e => setField('skills', e.target.value)}
              placeholder="React, TypeScript, Node.js"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Job Description
              </label>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-pulse' : ''}`} />
                {isGenerating ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            <textarea
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Describe the role, responsibilities, and what you're looking for..."
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-colors resize-y min-h-[100px]"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !form.title.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Briefcase className="w-3.5 h-3.5" />
                  Create Job
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// JOBS PAGE
// ---------------------------------------------------------------------------
export const JobsPage: React.FC<JobsPageProps> = ({ jobs, candidates, setJobs }) => {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return jobs;
    return jobs.filter(
      j =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const handleToggleStatus = useCallback((job: JobPosting) => {
    const updated = nextStatus(job.status);
    setJobs(prev =>
      prev.map(j => (j.id === job.id ? { ...j, status: updated } : j))
    );
  }, [setJobs]);

  const handleDelete = useCallback((job: JobPosting) => {
    setJobs(prev => prev.filter(j => j.id !== job.id));
  }, [setJobs]);

  const handleJobCreated = useCallback((newJob: JobPosting) => {
    setJobs(prev => [newJob, ...prev]);
    setShowModal(false);
  }, [setJobs]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Job Postings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {jobs.length} position{jobs.length !== 1 ? 's' : ''} total
            {filtered.length !== jobs.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Job
        </button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Job cards grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(job => (
            <JobCard
              key={job.id}
              job={job}
              candidates={candidates}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <EmptyState hasSearch={!!search.trim()} onClearSearch={() => setSearch('')} />
      )}

      {/* New Job Modal */}
      {showModal && (
        <NewJobModal
          onClose={() => setShowModal(false)}
          onCreated={handleJobCreated}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
interface EmptyStateProps {
  hasSearch: boolean;
  onClearSearch: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ hasSearch, onClearSearch }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
      <Briefcase className="w-7 h-7 text-slate-400 dark:text-slate-500" />
    </div>
    <div>
      <p className="font-semibold text-slate-700 dark:text-slate-300">
        {hasSearch ? 'No jobs match your search' : 'No job postings yet'}
      </p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
        {hasSearch
          ? 'Try adjusting your search query'
          : 'Create your first job posting to get started'}
      </p>
    </div>
    {hasSearch && (
      <button
        onClick={onClearSearch}
        className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
      >
        Clear search
      </button>
    )}
  </div>
);
