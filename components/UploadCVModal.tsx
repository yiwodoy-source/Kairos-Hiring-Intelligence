import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Zap } from 'lucide-react';
import { apiFetch } from '../services/apiClient';

interface UploadResult {
  candidate: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    applied_role: string;
    overall_score: number;
    decision_status: string;
    quick_summary: string;
  };
  assessment: {
    status: string;
    overallScore: number;
    matchedJobTitle: string | null;
    inferredTargetRole: string;
    confidence: string;
    matchedSkills: string[];
    hardFlags: string[];
    reasons: string[];
  };
  quickSummary: string;
}

interface UploadCVModalProps {
  onClose: () => void;
  onCandidateAdded: () => void;
}

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';

const STATUS_COLORS: Record<string, string> = {
  Shortlisted: 'text-emerald-500 bg-emerald-500/10',
  'Review Required': 'text-amber-500 bg-amber-500/10',
  Rejected: 'text-red-500 bg-red-500/10',
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-slate-400';

export const UploadCVModal: React.FC<UploadCVModalProps> = ({ onClose, onCandidateAdded }) => {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phaseLabel, setPhaseLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File too large (max 10 MB).');
      return;
    }
    setError(null);
    setFile(f);
    setResult(null);
    setPhase('idle');
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile],
  );

  const upload = useCallback(async () => {
    if (!file) return;
    setPhase('uploading');
    setError(null);

    const phases = ['Extracting text…', 'Running AI analysis…', 'Scoring against open roles…'];
    let idx = 0;
    setPhaseLabel(phases[0]);
    const ticker = setInterval(() => {
      idx = Math.min(idx + 1, phases.length - 1);
      setPhaseLabel(phases[idx]);
    }, 2800);

    try {
      const buffer = await file.arrayBuffer();
      const params = new URLSearchParams({ fileName: file.name });
      const data = await apiFetch<UploadResult>(
        `/api/hr-agent/upload-cv?${params}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: buffer,
        },
      );
      clearInterval(ticker);
      setResult(data);
      setPhase('done');
      onCandidateAdded();
    } catch (err: any) {
      clearInterval(ticker);
      setError(err.message || 'Upload failed. Please try again.');
      setPhase('error');
    }
  }, [file, onCandidateAdded]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">Upload CV</h2>
              <p className="text-xs text-slate-500">AI-powered instant screening</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          {phase !== 'done' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all
                ${dragging
                  ? 'border-amber-500 bg-amber-400/5'
                  : file
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 hover:border-violet-400 hover:bg-amber-50'
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onInputChange}
              />
              {file ? (
                <>
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-800 truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024).toFixed(0)} KB · PDF</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Drop a PDF here, or <span className="text-amber-500">browse</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">PDF only · max 10 MB</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Uploading state */}
          {phase === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
                <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
                <Zap className="absolute inset-0 m-auto w-5 h-5 text-amber-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Analyzing CV…</p>
                <p className="text-xs text-slate-400 mt-1 transition-all">{phaseLabel}</p>
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="text-sm font-semibold">CV processed successfully</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                {/* Name + status */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {result.candidate.first_name} {result.candidate.last_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {result.candidate.email}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[result.assessment.status] ?? 'text-slate-500 bg-slate-100'}`}>
                    {result.assessment.status}
                  </span>
                </div>

                {/* Matched role */}
                <div>
                  <p className="text-xs text-slate-500">Matched role</p>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">
                    {result.assessment.matchedJobTitle || result.assessment.inferredTargetRole || '—'}
                  </p>
                </div>

                {/* Score bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> AI Fit Score
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      {result.assessment.overallScore}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${SCORE_BAR_COLOR(result.assessment.overallScore)}`}
                      style={{ width: `${result.assessment.overallScore}%` }}
                    />
                  </div>
                </div>

                {/* Skills */}
                {result.assessment.matchedSkills.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">Matched skills</p>
                    <div className="flex flex-wrap gap-1">
                      {result.assessment.matchedSkills.slice(0, 6).map((s) => (
                        <span key={s} className="rounded-full bg-amber-400/10 text-amber-600 px-2 py-0.5 text-[11px] font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick summary */}
                {result.quickSummary && (
                  <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-3">
                    {result.quickSummary}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end gap-2.5">
          {phase === 'done' ? (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Upload another
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-slate-800 transition-colors"
              >
                View in pipeline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={upload}
                disabled={!file || phase === 'uploading'}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 transition-colors"
              >
                {phase === 'uploading' && <Loader2 className="w-4 h-4 animate-spin" />}
                {phase === 'uploading' ? 'Analyzing…' : 'Upload & Screen'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
