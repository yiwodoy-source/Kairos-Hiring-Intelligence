import React from 'react';
import { JobPosting, JobStatus, Candidate, CandidateStatus } from '../../types.ts';
import { ArrowLeft, Briefcase, CheckCircle, Trash2, User, Archive, RefreshCw } from 'lucide-react';

interface JobDetailProps {
  job: JobPosting;
  candidates: Candidate[];
  onBack: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onToggleStatus: (id: string) => void;
}

export const JobDetail: React.FC<JobDetailProps> = ({ job, candidates, onBack, onDelete, onToggleStatus }) => {
  const getStatusColor = (status: CandidateStatus) => {
    switch (status) {
      case CandidateStatus.APPLIED:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300';
      case CandidateStatus.SCREENING:
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300';
      case CandidateStatus.INTERVIEW:
        return 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300';
      case CandidateStatus.OFFER:
        return 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-300';
      case CandidateStatus.REJECTED:
        return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-sm animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-700 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-all hover:bg-slate-800 hover:text-indigo-300"
        >
          <div className="rounded-full bg-slate-800 p-1 transition-colors group-hover:bg-indigo-500/20">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Jobs
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onToggleStatus(job.id)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
              job.status === JobStatus.OPEN
                ? 'border-orange-900/50 text-orange-300 hover:bg-orange-500/10'
                : 'border-green-900/50 text-green-300 hover:bg-green-500/10'
            }`}
          >
            {job.status === JobStatus.OPEN ? (
              <>
                <Archive className="h-4 w-4" /> Close Job
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" /> Reopen Job
              </>
            )}
          </button>

          <button
            onClick={(e) => onDelete(job.id, e)}
            className="rounded-xl border border-rose-900/50 px-3 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" /> Delete Job
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">{job.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1"><Briefcase className="h-4 w-4" /> {job.department}</span>
            <span>•</span>
            <span>{job.location}</span>
            <span>•</span>
            <span>{job.type}</span>
          </div>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${job.status === JobStatus.OPEN ? 'bg-green-500/10 text-green-300' : 'bg-slate-800 text-slate-300'}`}>
          {job.status}
        </span>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 overflow-y-auto pr-2 lg:col-span-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5">
            <h3 className="mb-3 text-lg font-bold text-slate-100">About the Role</h3>
            <div className="prose prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-slate-300">
              {job.description}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-200">
              <CheckCircle className="h-4 w-4 text-indigo-300" />
              Requirements
            </h3>
            <ul className="space-y-3">
              {job.requirements.map((req, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-indigo-900/40 bg-indigo-500/10 p-4">
            <h3 className="mb-3 flex flex-shrink-0 items-center gap-2 text-sm font-bold text-indigo-200">
              <User className="h-4 w-4" /> Applicants
            </h3>
            <div className="mb-3 flex flex-shrink-0 items-baseline gap-2">
              <p className="text-3xl font-bold text-indigo-300">{candidates.length}</p>
              <p className="text-xs text-indigo-300/80 opacity-80">Candidates</p>
            </div>

            {candidates.length > 0 ? (
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {candidates.map((cand) => (
                  <div key={cand.id} className="rounded-xl border border-indigo-900/30 bg-slate-900 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{cand.name}</p>
                        <p className="text-xs text-slate-400">{cand.appliedDate}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(cand.status)}`}>
                        {cand.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-indigo-300/80">No applicants yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
