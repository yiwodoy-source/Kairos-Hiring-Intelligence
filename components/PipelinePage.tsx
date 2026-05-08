import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  User,
  ChevronRight,
  X,
  Search,
  Filter,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  CalendarCheck,
  History,
  GitCommitHorizontal,
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';
import { Candidate, CandidateStatus, JobPosting } from '../types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelinePageProps {
  candidates: Candidate[];
  jobs: JobPosting[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
}

interface AvailabilitySlot {
  start: string;
  end: string;
  label: string;
}

interface AiReasoning {
  matchedJobTitle?: string;
  matchedSkills?: string[];
  hardFlags?: string[];
  reasons?: string[];
  confidence?: number;
}

interface CandidateEvent {
  id: number;
  candidate_id: number;
  event_type: string;
  description: string;
  actor: string;
  metadata: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIPELINE_STAGES: {
  id: CandidateStatus;
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
}[] = [
  {
    id: CandidateStatus.APPLIED,
    label: 'Applied',
    color: '#6366F1',
    bgClass: 'bg-indigo-500/10',
    textClass: 'text-indigo-400',
  },
  {
    id: CandidateStatus.SCREENING,
    label: 'Screening',
    color: '#06B6D4',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-400',
  },
  {
    id: CandidateStatus.REVIEW_REQUIRED,
    label: 'Under Review',
    color: '#F59E0B',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-400',
  },
  {
    id: CandidateStatus.SHORTLISTED,
    label: 'Shortlisted',
    color: '#10B981',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-400',
  },
  {
    id: CandidateStatus.INTERVIEW,
    label: 'Interview',
    color: '#EC4899',
    bgClass: 'bg-pink-500/10',
    textClass: 'text-pink-400',
  },
  {
    id: CandidateStatus.OFFER,
    label: 'Offer',
    color: '#8B5CF6',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-400',
  },
];

const ALL_STATUSES: CandidateStatus[] = [
  CandidateStatus.APPLIED,
  CandidateStatus.SCREENING,
  CandidateStatus.REVIEW_REQUIRED,
  CandidateStatus.SHORTLISTED,
  CandidateStatus.INTERVIEW,
  CandidateStatus.OFFER,
  CandidateStatus.REJECTED,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return 'Unknown date';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getSourceLabel(candidate: Candidate): { label: string; cls: string } {
  if (candidate.isSourced) {
    return {
      label: 'Sourced',
      cls: 'bg-emerald-500/10 text-emerald-400',
    };
  }
  const src = candidate.sourcingSource;
  if (src && src !== 'Manual') {
    return {
      label: src,
      cls: 'bg-cyan-500/10 text-cyan-400',
    };
  }
  if (candidate.emailContent || candidate.email) {
    return {
      label: 'Gmail Intake',
      cls: 'bg-violet-500/10 text-violet-400',
    };
  }
  return {
    label: 'Manual',
    cls: 'bg-slate-500/10 text-slate-400',
  };
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-slate-500';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CandidateCardProps {
  candidate: Candidate;
  onClick: (c: Candidate) => void;
}

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onClick }) => {
  const source = getSourceLabel(candidate);
  const score = candidate.aiMatchScore ?? 0;

  return (
    <button
      onClick={() => onClick(candidate)}
      className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 group"
    >
      {/* Name + role */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
            {candidate.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            {candidate.appliedRole || candidate.currentRole || 'Role pending'}
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </div>

      {/* Source badge */}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${source.cls}`}
        >
          {source.label}
        </span>
      </div>

      {/* AI fit score */}
      {score > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              AI Fit
            </span>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              {score}%
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${getScoreColor(score)} transition-all`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      )}

      {/* Date */}
      <div className="mt-2.5 flex items-center gap-1 text-[11px] text-slate-400">
        <Clock className="w-3 h-3" />
        {formatRelativeDate(candidate.appliedDate)}
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Detail Drawer
// ---------------------------------------------------------------------------

interface DetailDrawerProps {
  candidate: Candidate;
  jobs: JobPosting[];
  onClose: () => void;
  onStatusChange: (candidateId: string, newStatus: CandidateStatus) => Promise<void>;
  saving: boolean;
  onCandidateUpdate: (candidateId: string, patch: Partial<Candidate & Record<string, unknown>>) => void;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  candidate,
  jobs,
  onClose,
  onStatusChange,
  saving,
  onCandidateUpdate,
}) => {
  const [localStatus, setLocalStatus] = useState<CandidateStatus>(candidate.status);

  // Outreach state
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachMessage, setOutreachMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Interview scheduling state
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [bookingInterview, setBookingInterview] = useState(false);
  const [interviewMessage, setInterviewMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Activity timeline state
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const matchedJob = useMemo(
    () => jobs.find((j) => j.id === candidate.jobId) || null,
    [jobs, candidate.jobId]
  );

  const source = getSourceLabel(candidate);
  const score = candidate.aiMatchScore ?? 0;

  // Parse ai_reasoning JSON safely
  const reasoning = useMemo<AiReasoning | null>(() => {
    try {
      const raw = (candidate as any).ai_reasoning;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }, [candidate]);

  const hasReasoning =
    reasoning !== null &&
    (reasoning.matchedJobTitle ||
      (reasoning.matchedSkills && reasoning.matchedSkills.length > 0) ||
      (reasoning.hardFlags && reasoning.hardFlags.length > 0) ||
      (reasoning.reasons && reasoning.reasons.length > 0) ||
      reasoning.confidence !== undefined);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    apiFetch<CandidateEvent[]>(`/api/hr-agent/candidates/${candidate.id}/events`)
      .then((data) => { if (!cancelled) { setEvents(data ?? []); } })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [candidate.id]);

  const handleStatusSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as CandidateStatus;
    setLocalStatus(next);
    await onStatusChange(candidate.id, next);
  };

  // Send outreach email
  const handleSendOutreach = async () => {
    setOutreachSending(true);
    setOutreachMessage(null);
    try {
      await apiFetch(`/api/hr-agent/candidates/${candidate.id}/outreach`, {
        method: 'POST',
      });
      setOutreachMessage({ text: 'Email sent ✓', type: 'success' });
      onCandidateUpdate(candidate.id, { communicationStatus: 'Outreach Sent' });
      setTimeout(() => setOutreachMessage(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send email';
      setOutreachMessage({ text: message, type: 'error' });
    } finally {
      setOutreachSending(false);
    }
  };

  // Fetch availability slots
  const handleGetSlots = async () => {
    setLoadingSlots(true);
    setSlotsError(null);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const data = await apiFetch<{ slots: AvailabilitySlot[] }>(
        '/api/hr-agent/schedule/availability'
      );
      setSlots((data?.slots ?? []).slice(0, 5));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load slots';
      setSlotsError(message);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Book interview
  const handleBookInterview = async () => {
    if (!selectedSlot) return;
    setBookingInterview(true);
    setInterviewMessage(null);
    try {
      await apiFetch(`/api/hr-agent/candidates/${candidate.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ startTime: selectedSlot.start, durationMinutes: 30 }),
      });
      setInterviewMessage({ text: 'Interview booked ✓', type: 'success' });
      onCandidateUpdate(candidate.id, { interviewStatus: 'Scheduled' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to book interview';
      setInterviewMessage({ text: message, type: 'error' });
    } finally {
      setBookingInterview(false);
    }
  };

  const isShortlisted = localStatus === CandidateStatus.SHORTLISTED;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-lg flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-5 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Candidate Detail
            </p>
            <h3 className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white truncate">
              {candidate.name}
            </h3>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${source.cls}`}
              >
                {source.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            aria-label="Close detail panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Contact info */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contact
            </p>
            {candidate.email && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{candidate.email}</span>
              </div>
            )}
            {candidate.phone && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Phone className="w-4 h-4 text-slateink-400 shrink-0" />
                <span>{candidate.phone}</span>
              </div>
            )}
          </div>

          {/* Role info */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Role
            </p>
            {candidate.appliedRole && (
              <div className="flex items-start gap-2 text-sm">
                <Briefcase className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">Applied for:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {candidate.appliedRole}
                  </span>
                </div>
              </div>
            )}
            {candidate.currentRole && (
              <div className="flex items-start gap-2 text-sm">
                <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">Current role:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {candidate.currentRole}
                  </span>
                </div>
              </div>
            )}
            {matchedJob && (
              <div className="flex items-start gap-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">Matched job:</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {matchedJob.title}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Status dropdown */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Pipeline Status
            </p>
            <div className="flex items-center gap-3">
              <select
                value={localStatus}
                onChange={handleStatusSelect}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500 transition-colors disabled:opacity-60"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {saving && (
                <div className="w-4 h-4 rounded-full border-2 border-violet-600 border-t-transparent animate-spin shrink-0" />
              )}
            </div>
          </div>

          {/* Interview scheduling — only for shortlisted candidates */}
          {isShortlisted && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Schedule Interview
              </p>

              <button
                onClick={handleGetSlots}
                disabled={loadingSlots}
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
              >
                {loadingSlots ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                ) : (
                  <CalendarCheck className="w-3.5 h-3.5" />
                )}
                {loadingSlots ? 'Loading…' : 'Get Available Slots'}
              </button>

              {slotsError && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{slotsError}</p>
              )}

              {slots.length > 0 && (
                <div className="mt-3 space-y-2">
                  {slots.map((slot, idx) => (
                    <label
                      key={idx}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        selectedSlot?.start === slot.start
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="interview-slot"
                        value={slot.start}
                        checked={selectedSlot?.start === slot.start}
                        onChange={() => setSelectedSlot(slot)}
                        className="accent-violet-600 shrink-0"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-200">{slot.label}</span>
                    </label>
                  ))}

                  <button
                    onClick={handleBookInterview}
                    disabled={!selectedSlot || bookingInterview}
                    className="mt-1 flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                  >
                    {bookingInterview ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <CalendarCheck className="w-3.5 h-3.5" />
                    )}
                    {bookingInterview ? 'Booking…' : 'Book Interview'}
                  </button>
                </div>
              )}

              {interviewMessage && (
                <p
                  className={`mt-2 text-xs font-medium ${
                    interviewMessage.type === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {interviewMessage.text}
                </p>
              )}
            </div>
          )}

          {/* AI score */}
          {score > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  AI Fit Score
                </p>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{score}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${getScoreColor(score)} transition-all`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          )}

          {/* AI Reasoning Breakdown */}
          {hasReasoning && reasoning && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  AI Analysis
                </p>
                {reasoning.confidence !== undefined && (
                  <span className="rounded-full bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 text-[11px] font-semibold px-2.5 py-0.5">
                    {Math.round(reasoning.confidence * 100)}% confidence
                  </span>
                )}
              </div>

              {reasoning.matchedJobTitle && (
                <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Matched role: </span>
                  <span className="font-medium">{reasoning.matchedJobTitle}</span>
                </p>
              )}

              {reasoning.matchedSkills && reasoning.matchedSkills.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Matched Skills
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {reasoning.matchedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] px-2 py-0.5"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {reasoning.hardFlags && reasoning.hardFlags.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Flags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {reasoning.hardFlags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[11px] px-2 py-0.5"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {reasoning.reasons && reasoning.reasons.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Reasons
                  </p>
                  <ul className="space-y-1">
                    {reasoning.reasons.slice(0, 4).map((reason, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                      >
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Quick summary */}
          {candidate.quickSummary && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                AI Summary
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-6">
                {candidate.quickSummary}
              </p>
            </div>
          )}

          {/* Skills */}
          {candidate.skills && candidate.skills.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Skills
              </p>
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Activity timeline */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Activity
              </p>
            </div>
            {eventsLoading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
                <div className="w-3 h-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                Loading activity…
              </div>
            ) : events.length === 0 ? (
              <p className="py-3 text-xs text-slate-400 italic">No recorded activity yet.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-2.5 top-2 bottom-2 w-px bg-slate-100 dark:bg-slate-800" />
                <div className="space-y-3">
                  {events.map((ev) => {
                    const iconMap: Record<string, { Icon: React.ComponentType<{ className?: string }>; cls: string }> = {
                      status_change:       { Icon: GitCommitHorizontal, cls: 'text-violet-400 bg-violet-500/10' },
                      outreach_sent:       { Icon: Mail,                cls: 'text-cyan-400 bg-cyan-500/10' },
                      interview_scheduled: { Icon: CalendarCheck,       cls: 'text-emerald-400 bg-emerald-500/10' },
                      rescreened:          { Icon: Zap,                 cls: 'text-amber-400 bg-amber-500/10' },
                    };
                    const { Icon: EvIcon, cls } = iconMap[ev.event_type] ?? { Icon: Clock, cls: 'text-slate-400 bg-slate-100 dark:bg-slate-800' };
                    const dt = new Date(ev.created_at);
                    const label = isNaN(dt.getTime()) ? ev.created_at
                      : dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={ev.id} className="relative flex items-start gap-3 pl-7">
                        <div className={`absolute left-0 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${cls}`}>
                          <EvIcon className="w-2.5 h-2.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-4">{ev.description}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick action footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => onStatusChange(candidate.id, CandidateStatus.SHORTLISTED)}
              disabled={saving || localStatus === CandidateStatus.SHORTLISTED}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Shortlist
            </button>
            <button
              onClick={() => onStatusChange(candidate.id, CandidateStatus.REJECTED)}
              disabled={saving || localStatus === CandidateStatus.REJECTED}
              className="flex items-center gap-2 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300 transition hover:bg-rose-100 dark:hover:bg-rose-950/60 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={handleSendOutreach}
              disabled={outreachSending}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {outreachSending ? (
                <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {outreachSending ? 'Sending…' : 'Send Outreach ▸'}
            </button>
          </div>
          {outreachMessage && (
            <p
              className={`mt-2 text-xs font-medium ${
                outreachMessage.type === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {outreachMessage.text}
            </p>
          )}
        </div>
      </aside>
    </>
  );
};

// ---------------------------------------------------------------------------
// Kanban Column
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  stage: (typeof PIPELINE_STAGES)[0];
  candidates: Candidate[];
  onCardClick: (c: Candidate) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ stage, candidates, onCardClick }) => {
  const isEmpty = candidates.length === 0;

  return (
    <div
      className="w-72 flex-shrink-0 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 overflow-hidden"
      style={{ borderTop: `3px solid ${stage.color}` }}
    >
      {/* Column header */}
      <div className={`px-4 py-3 ${stage.bgClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full inline-block shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className={`text-xs font-semibold uppercase tracking-wider ${stage.textClass}`}>
            {stage.label}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${stage.bgClass} ${stage.textClass}`}
        >
          {candidates.length}
        </span>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[100px]">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <MoreHorizontal className="w-5 h-5 text-slate-300 dark:text-slate-600 mb-1" />
            <p className="text-xs text-slate-400 dark:text-slate-500">No candidates</p>
          </div>
        ) : (
          candidates.map((c) => (
            <CandidateCard key={c.id} candidate={c} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Rejected Panel
// ---------------------------------------------------------------------------

interface RejectedPanelProps {
  candidates: Candidate[];
  onCardClick: (c: Candidate) => void;
}

const RejectedPanel: React.FC<RejectedPanelProps> = ({ candidates, onCardClick }) => {
  const [expanded, setExpanded] = useState(false);

  if (candidates.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Rejected Candidates
          </span>
          <span className="rounded-full bg-rose-500/10 text-rose-400 px-2 py-0.5 text-[11px] font-bold">
            {candidates.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {candidates.map((c) => {
            const score = c.aiMatchScore ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => onCardClick(c)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                    <XCircle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {c.appliedRole || c.currentRole || 'Role pending'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {score > 0 && (
                    <span className="text-xs text-slate-400">{score}%</span>
                  )}
                  <span className="text-xs text-slate-400">
                    {formatRelativeDate(c.appliedDate)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const PipelinePage: React.FC<PipelinePageProps> = ({
  candidates,
  jobs,
  setCandidates,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [drawerCandidate, setDrawerCandidate] = useState<Candidate | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchesJob =
        selectedJobId === 'all' || c.jobId === selectedJobId;
      return matchesSearch && matchesJob;
    });
  }, [candidates, searchQuery, selectedJobId]);

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columnMap = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    for (const stage of PIPELINE_STAGES) {
      map[stage.id] = [];
    }
    map[CandidateStatus.REJECTED] = [];

    for (const c of filteredCandidates) {
      const key = c.status in map ? c.status : CandidateStatus.REVIEW_REQUIRED;
      map[key].push(c);
    }
    return map;
  }, [filteredCandidates]);

  const totalActive = filteredCandidates.filter(
    (c) => c.status !== CandidateStatus.REJECTED
  ).length;

  // ── Status update ──────────────────────────────────────────────────────────
  const handleStatusChange = async (
    candidateId: string,
    newStatus: CandidateStatus
  ) => {
    setSavingStatus(true);
    try {
      const response = await apiFetch<{ candidate: any }>(
        `/api/hr-agent/candidates/${candidateId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ decision_status: newStatus }),
        }
      );
      setCandidates((prev) =>
        prev.map((c) => {
          if (c.id !== candidateId) return c;
          const updated = response?.candidate;
          if (updated) {
            return { ...c, status: newStatus };
          }
          return { ...c, status: newStatus };
        })
      );
      // Keep drawer open and reflect new status
      if (drawerCandidate?.id === candidateId) {
        setDrawerCandidate((prev) =>
          prev ? { ...prev, status: newStatus } : prev
        );
      }
    } catch (err) {
      console.error('[PipelinePage] Status update failed:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  // ── Local candidate field update (for outreach / interview status) ──────────
  const handleCandidateUpdate = useCallback(
    (candidateId: string, patch: Partial<Candidate & Record<string, unknown>>) => {
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, ...patch } : c))
      );
      setDrawerCandidate((prev) =>
        prev && prev.id === candidateId ? { ...prev, ...patch } : prev
      );
    },
    [setCandidates]
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Hiring Pipeline
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Tracking{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {totalActive}
            </span>{' '}
            active candidate{totalActive !== 1 ? 's' : ''} across{' '}
            {PIPELINE_STAGES.length} stages
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search candidates…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Job filter */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">All Jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto pb-6">
        <div className="flex gap-4 min-h-[600px]" style={{ minWidth: 'max-content' }}>
          {PIPELINE_STAGES.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              candidates={columnMap[stage.id] ?? []}
              onCardClick={(c) => setDrawerCandidate(c)}
            />
          ))}
        </div>
      </div>

      {/* Rejected panel */}
      <RejectedPanel
        candidates={columnMap[CandidateStatus.REJECTED] ?? []}
        onCardClick={(c) => setDrawerCandidate(c)}
      />

      {/* Detail drawer */}
      {drawerCandidate && (
        <DetailDrawer
          candidate={drawerCandidate}
          jobs={jobs}
          onClose={() => setDrawerCandidate(null)}
          onStatusChange={handleStatusChange}
          saving={savingStatus}
          onCandidateUpdate={handleCandidateUpdate}
        />
      )}
    </div>
  );
};
