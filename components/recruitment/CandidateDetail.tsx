import React, { useEffect, useState } from 'react';
import { Candidate, CandidateEvaluation, CandidateStatus } from '../../types.ts';
import { Briefcase, CheckCircle2, Clock3, FileText, Mail, Save, Sparkles, Trash2, X, XCircle } from 'lucide-react';

interface CandidateDetailProps {
  candidate: Candidate;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onAnalyze: (c: Candidate) => void;
  onUpdateStatus: (candidate: Candidate, status: CandidateStatus) => void;
  onSaveDetails: (candidate: Candidate) => void;
  onClose: () => void;
  isAnalyzing: boolean;
  isUpdatingStatus: boolean;
}

export const CandidateDetail: React.FC<CandidateDetailProps> = ({
  candidate,
  onDelete,
  onAnalyze,
  onUpdateStatus,
  onSaveDetails,
  onClose,
  isAnalyzing,
  isUpdatingStatus
}) => {
  const [draft, setDraft] = useState(candidate);

  useEffect(() => {
    setDraft(candidate);
  }, [candidate]);

  const getAnalysisData = (cand: Candidate): CandidateEvaluation | null => {
    if (!cand.aiAnalysis) return null;
    try {
      return JSON.parse(cand.aiAnalysis);
    } catch {
      return null;
    }
  };

  const analysis = getAnalysisData(candidate);

  return (
    <div className="flex-1 bg-slate-900 rounded-2xl shadow-sm border border-slate-700 p-6 overflow-y-auto relative">
      <div className="absolute top-4 right-4">
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition-colors"
          title="Close Details"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6 pr-10">
        <div className="flex flex-col gap-4 xl:flex-row xl:justify-between xl:items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">{candidate.name}</h2>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-slate-400 text-sm">
              <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {candidate.email}</span>
              <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {candidate.appliedRole || candidate.currentRole || `Job ID: ${candidate.jobId}`}</span>
              {candidate.sourcingSource && <span>{candidate.sourcingSource}</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => onUpdateStatus(candidate, CandidateStatus.SHORTLISTED)}
              disabled={isUpdatingStatus}
              className="bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Shortlist
            </button>
            <button
              onClick={() => onUpdateStatus(candidate, CandidateStatus.REVIEW_REQUIRED)}
              disabled={isUpdatingStatus}
              className="bg-amber-500/10 text-amber-300 px-3 py-2 rounded-xl hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              <Clock3 className="w-4 h-4" />
              Review
            </button>
            <button
              onClick={() => onUpdateStatus(candidate, CandidateStatus.REJECTED)}
              disabled={isUpdatingStatus}
              className="bg-rose-500/10 text-rose-300 px-3 py-2 rounded-xl hover:bg-rose-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={(e) => onDelete(candidate.id, e)}
              className="bg-slate-900 border border-rose-900/50 text-rose-300 hover:bg-rose-500/10 px-3 py-2 rounded-xl flex items-center gap-2 transition-colors"
              title="Delete Candidate"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onSaveDetails(draft)}
              disabled={isUpdatingStatus}
              className="bg-sky-600 text-white px-4 py-2 rounded-xl hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save ATS Details
            </button>
            <button
              onClick={() => onAnalyze(candidate)}
              disabled={isAnalyzing}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isAnalyzing ? 'Screening...' : 'Run AI Screening'}
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>

        {candidate.aiAnalysis && analysis && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-indigo-900/40 bg-gradient-to-r from-indigo-500/10 to-sky-500/10 p-4 flex flex-col gap-4 md:flex-row md:items-center">
              <div className="rounded-full bg-slate-900 p-2 shadow-sm">
                <Sparkles className="w-5 h-5 text-indigo-300" />
              </div>
              <div className="flex-1">
                <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-indigo-300">Quick Read</p>
                <p className="font-medium text-slate-100">{analysis['Quick Read']}</p>
              </div>
              <div className="border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4 border-indigo-900/40">
                <span className="block text-2xl font-bold text-slate-100">{analysis.Scoring}</span>
                <span className="text-[10px] font-bold uppercase text-slate-400">Score (1-10)</span>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-100">Executive Summary</h3>
              <p className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm leading-relaxed text-slate-300">
                {analysis.Summary}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="overflow-hidden rounded-2xl border border-slate-700">
                <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800/60 px-4 py-3">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-200">Email Content Analysis</h3>
                </div>
                <div className="space-y-2 p-4 text-sm text-slate-300">
                  <p className="border-l-2 border-slate-700 pl-2 text-xs italic text-slate-400">
                    "{candidate.emailContent?.substring(0, 100)}..."
                  </p>
                  <p>{analysis['Email Content']}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-700">
                <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800/60 px-4 py-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-200">CV Analysis</h3>
                </div>
                <div className="p-4 text-sm text-slate-300">
                  <p>{analysis.CV}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-700 pt-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">ATS Workflow Fields</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Source</span>
              <input
                value={draft.sourcingSource || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, sourcingSource: e.target.value as any }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Manual, Gmail, LinkedIn, Internal DB"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Applied Role</span>
              <input
                value={draft.appliedRole || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, appliedRole: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Sales Development Representative"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Expected Salary</span>
              <input
                value={draft.expectedSalary || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, expectedSalary: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="6-8 LPA"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Notice Period</span>
              <input
                value={draft.noticePeriod || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, noticePeriod: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Immediate / 30 days"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Communication Status</span>
              <input
                value={draft.communicationStatus || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, communicationStatus: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Acknowledged, Contacted, Follow-up sent"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Reply Status</span>
              <input
                value={draft.replyStatus || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, replyStatus: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="No reply, Interested, Declined"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Interview Status</span>
              <input
                value={draft.interviewStatus || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, interviewStatus: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Not scheduled, Awaiting slots, Scheduled"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Status</span>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200">
              {candidate.status}
            </span>
          </div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Application Record</h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-xl bg-slate-800/60 p-4 border border-slate-700">
              <h4 className="mb-2 text-xs font-bold text-slate-200">Application Content</h4>
              <textarea
                value={draft.emailContent || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, emailContent: e.target.value }))}
                className="h-32 w-full resize-none rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="rounded-xl bg-slate-800/60 p-4 border border-slate-700">
              <h4 className="mb-2 text-xs font-bold text-slate-200">Quick Summary</h4>
              <textarea
                value={draft.quickSummary || ''}
                onChange={(e) => setDraft(prev => ({ ...prev, quickSummary: e.target.value }))}
                className="h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="rounded-xl bg-slate-800/60 p-4 border border-slate-700">
              <h4 className="mb-2 text-xs font-bold text-slate-200">Full Resume Text</h4>
              <div className="h-32 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-300">
                {candidate.resumeText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
