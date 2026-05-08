import React from 'react';
import { JobPosting, JobStatus, Candidate } from '../../types.ts';
import { Plus, Trash2, Users } from 'lucide-react';

interface JobBoardProps {
  jobs: JobPosting[];
  candidates: Candidate[];
  onSelectJob: (job: JobPosting) => void;
  onDeleteJob: (id: string, e: React.MouseEvent) => void;
  onCreateNew: () => void;
}

export const JobBoard: React.FC<JobBoardProps> = ({ jobs, candidates, onSelectJob, onDeleteJob, onCreateNew }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
      <button
        onClick={onCreateNew}
        className="h-64 rounded-2xl border-2 border-dashed border-slate-600 bg-slate-900 shadow-sm flex flex-col items-center justify-center transition-all hover:border-indigo-400 hover:bg-slate-800 group"
      >
        <Plus className="mb-3 h-10 w-10 text-slate-500 group-hover:text-indigo-300" />
        <span className="text-base font-semibold text-slate-100 group-hover:text-indigo-300">
          Create New Job Posting
        </span>
        <span className="mt-2 px-6 text-sm text-slate-400">
          Open a new hiring request with role, location, and AI-assisted description.
        </span>
      </button>

      {jobs.map((job) => {
        const applicantCount = candidates.filter(c => c.jobId === job.id).length;
        return (
          <div
            key={job.id}
            className="relative flex min-h-[256px] flex-col justify-between rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-sm transition-all hover:border-indigo-400 hover:shadow-lg group"
          >
            <button
              onClick={(e) => onDeleteJob(job.id, e)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
              title="Delete Job"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div>
              <div className="mb-2 flex items-start justify-between gap-3 pr-8">
                <h3 className="truncate text-lg font-bold text-slate-100">{job.title}</h3>
                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    job.status === JobStatus.OPEN
                      ? 'bg-green-500/10 text-green-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {job.status}
                </span>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                {job.department} • {job.location}
              </p>
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-300">
                <Users className="h-4 w-4" />
                {applicantCount} {applicantCount === 1 ? 'Applicant' : 'Applicants'}
              </div>
              {job.requirements.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {job.requirements.slice(0, 4).map(req => (
                    <span key={req} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                      {req}
                    </span>
                  ))}
                  {job.requirements.length > 4 && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                      +{job.requirements.length - 4} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => onSelectJob(job)}
              className="w-full rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-indigo-400 hover:bg-slate-800"
            >
              View Details
            </button>
          </div>
        );
      })}
    </div>
  );
};
