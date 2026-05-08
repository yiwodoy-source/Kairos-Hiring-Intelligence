import React from 'react';
import { Candidate, CandidateEvaluation } from '../../types.ts';
import { Plus, User } from 'lucide-react';

interface CandidateListProps {
  candidates: Candidate[];
  selectedCandidateId: string | undefined;
  onSelectCandidate: (candidate: Candidate) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  emailContentInput: string;
  setEmailContentInput: (value: string) => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onFileUpload,
  emailContentInput,
  setEmailContentInput
}) => {
  const getAnalysisData = (cand: Candidate): CandidateEvaluation | null => {
    if (!cand.aiAnalysis) return null;
    try {
      return JSON.parse(cand.aiAnalysis);
    } catch {
      return null;
    }
  };

  return (
    <div className="xl:w-[360px] xl:min-w-[360px] bg-slate-900 rounded-2xl shadow-sm border border-slate-700 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold text-slate-100">Applicants</h3>
          <label className="cursor-pointer text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-xl flex items-center gap-1 transition-colors shadow-sm whitespace-nowrap">
            <Plus className="w-3 h-3" /> Add Candidate
            <input type="file" className="hidden" onChange={onFileUpload} accept=".pdf,.txt,.docx" />
          </label>
        </div>
        <textarea
          placeholder="Optional: paste candidate email content before upload"
          className="w-full min-h-[88px] resize-none rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={emailContentInput}
          onChange={(e) => setEmailContentInput(e.target.value)}
        />
      </div>

      <div className="overflow-y-auto flex-1">
        {candidates.map((cand) => {
          const analysis = getAnalysisData(cand);
          const score = cand.aiMatchScore ?? 0;
          const scoreTone =
            score >= 80
              ? 'bg-green-500/10 text-green-300'
              : score >= 50
                ? 'bg-amber-500/10 text-amber-300'
                : 'bg-rose-500/10 text-rose-300';

          return (
            <button
              key={cand.id}
              onClick={() => onSelectCandidate(cand)}
              className={`w-full border-b border-slate-700 px-4 py-4 text-left transition-colors ${
                selectedCandidateId === cand.id
                  ? 'bg-slate-800 ring-1 ring-indigo-400/40'
                  : 'hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate font-semibold text-slate-100">{cand.name}</h4>
                  <p className="mt-1 text-xs text-slate-400">Applied: {cand.appliedDate}</p>
                  {(analysis || cand.quickSummary) && (
                    <p className="mt-2 truncate text-xs italic text-slate-400">
                      "{analysis ? analysis['Quick Read'] : cand.quickSummary}"
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    {(cand.appliedRole || cand.currentRole || 'Role pending')} • {(cand.sourcingSource || 'Source pending')}
                  </p>
                </div>
                {cand.aiMatchScore !== undefined && (
                  <span className={`inline-flex min-w-[64px] justify-center rounded-full px-2.5 py-1 text-xs font-bold ${scoreTone}`}>
                    {score / 10}/10
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {candidates.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No candidates found.</p>
          </div>
        )}
      </div>
    </div>
  );
};
