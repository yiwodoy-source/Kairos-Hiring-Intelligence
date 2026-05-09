import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Users,
    CheckCircle2,
    AlertTriangle,
    Play,
    StopCircle,
    RefreshCcw,
    ExternalLink,
    Download,
    Filter,
    Search,
    Terminal,
    ShieldCheck,
    Mail,
    Clock3,
    Database,
    CircleX,
    X,
    MessageSquareText,
    MapPin,
    Briefcase,
    FileText
} from 'lucide-react';
import { apiFetch, getAuthToken } from '../services/apiClient';

interface Candidate {
    id: number;
    job_id?: number | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    location: string;
    years_experience: number;
    current_role: string;
    applied_role?: string;
    overall_score: number;
    decision_status: string;
    workflow_state?: string;
    next_action?: string;
    quick_summary?: string;
    application_content?: string;
    ai_reasoning?: string;
    skills?: string;
    drive_file_link: string;
    created_at: string;
}

interface Job {
    id: number;
    title: string;
    location: string;
    requirements?: string;
    status?: string;
}

type ReviewReasoning = {
    matchedJobId?: number | null;
    matchedJobTitle?: string | null;
    inferredTargetRole?: string;
    analysisSource?: string;
    confidence?: 'high' | 'medium' | 'low' | string;
    requiredSkills?: string[];
    matchedSkills?: string[];
    hardFlags?: string[];
    reasons?: string[];
    recruiterReview?: string | {
        updatedAt?: string;
        decisionStatus?: string;
        note?: string;
    };
};

interface Stats {
    total: number;
    shortlisted: number;
    rejected: number;
    review: number;
    avg_score: number;
}

interface SyncHealth {
    state: 'idle' | 'running' | 'success' | 'error';
    lastAttemptAt: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    lastSummary: {
        candidateCount: number;
        syncedToSheets: number;
        driveLinked: number;
        missingDriveLinks: number;
    } | null;
}

function formatTimestamp(value: string | null): string {
    if (!value) return 'Not yet run';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unavailable';
    return parsed.toLocaleString();
}

function getStatusTone(status: string) {
    if (status === 'Shortlisted') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Rejected') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
}

function stripHtml(value?: string) {
    if (!value) return '';
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function parseJsonObject(value?: string) {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function parseSkills(value?: string) {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        }
    } catch {
        // fall through
    }

    return value.split(',').map(item => item.trim()).filter(Boolean);
}

function normalizeText(value?: string) {
    return (value || '').toLowerCase().replace(/[^a-z0-9\s+/&-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function humanizeAnalysisSource(value?: string) {
    if (!value) return 'Standard analysis';
    if (value === 'keyword-fallback') return 'Fallback parsing';
    if (value === 'openrouter') return 'Primary AI analysis';
    if (value === 'gemini') return 'Gemini analysis';
    return value.replace(/-/g, ' ');
}

function MetricCard({
    label,
    value,
    icon: Icon
}: {
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">{value}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
}

export function HrAgentDashboard() {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [status, setStatus] = useState<{ status: string; logs: string[]; syncHealth: SyncHealth }>({
        status: 'Stopped',
        logs: [],
        syncHealth: {
            state: 'idle',
            lastAttemptAt: null,
            lastSyncedAt: null,
            lastError: null,
            lastSummary: null
        }
    });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [reviewNote, setReviewNote] = useState('');
    const [reviewSaving, setReviewSaving] = useState(false);
    const [authUrl, setAuthUrl] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string; } | null>(null);

    const fetchData = useCallback(async () => {
        if (!getAuthToken()) {
            setStatus(prev => ({ ...prev, status: 'Error: No Session' }));
            setLoading(false);
            return;
        }

        try {
            const [candidateData, statsData, statusData, jobsData] = await Promise.all([
                apiFetch<Candidate[]>('/api/hr-agent/candidates'),
                apiFetch<Stats>('/api/hr-agent/stats'),
                apiFetch<{ status: string; logs: string[]; syncHealth: SyncHealth }>('/api/hr-agent/status'),
                apiFetch<Job[]>('/api/hr-agent/jobs')
            ]);
            setCandidates(candidateData);
            setStats(statsData);
            setStatus(statusData);
            setJobs(jobsData);
        } catch (err) {
            console.error('Error fetching HR Agent data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchAuthUrl = async () => {
        try {
            const data = await apiFetch<{ url: string }>('/api/hr-agent/auth/url');
            setAuthUrl(data.url);
        } catch (err) {
            console.error('Error fetching auth URL:', err);
        }
    };

    useEffect(() => {
        fetchData();
        fetchAuthUrl();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleRunNow = async () => {
        try {
            await apiFetch('/api/hr-agent/run', { method: 'POST' });
            setActionMessage({ type: 'success', text: 'A new processing cycle has started.' });
            fetchData();
        } catch {
            setActionMessage({ type: 'error', text: 'Unable to trigger the processing cycle right now.' });
        }
    };

    const handleToggle = async (action: 'start' | 'stop') => {
        try {
            await apiFetch('/api/hr-agent/toggle', {
                method: 'POST',
                body: JSON.stringify({ action })
            });
            setActionMessage({ type: 'success', text: action === 'start' ? 'Scheduler started.' : 'Scheduler stopped.' });
            fetchData();
        } catch {
            setActionMessage({ type: 'error', text: 'Unable to update scheduler state.' });
        }
    };

    const handleSyncCandidates = async () => {
        try {
            const result = await apiFetch<{ candidateCount: number; syncedToSheets: number; missingDriveLinks: number; driveLinked: number; }>('/api/hr-agent/sync-candidates', {
                method: 'POST'
            });
            setActionMessage({
                type: 'success',
                text: `Tracker sync completed: ${result.syncedToSheets} of ${result.candidateCount} candidates updated.`
            });
            fetchData();
        } catch {
            setActionMessage({ type: 'error', text: 'Candidate tracker sync could not be completed.' });
        }
    };

    const openCandidateReview = (candidate: Candidate) => {
        setSelectedCandidate(candidate);
        const parsedReasoning = parseJsonObject(candidate.ai_reasoning) as ReviewReasoning | null;
        const existingNote = typeof parsedReasoning?.recruiterReview === 'string'
            ? parsedReasoning.recruiterReview
            : parsedReasoning?.recruiterReview?.note || '';
        setReviewNote(existingNote);
    };

    const closeCandidateReview = () => {
        setSelectedCandidate(null);
        setReviewNote('');
    };

    const handleReviewDecision = async (decisionStatus: 'Shortlisted' | 'Review Required' | 'Rejected') => {
        if (!selectedCandidate) return;

        setReviewSaving(true);
        try {
            const reasoning = parseJsonObject(selectedCandidate.ai_reasoning);
            const nextReasoning = {
                ...(reasoning || {}),
                recruiterReview: {
                    updatedAt: new Date().toISOString(),
                    decisionStatus,
                    note: reviewNote.trim()
                }
            };

            const response = await apiFetch<{ candidate: Candidate }>(`/api/hr-agent/candidates/${selectedCandidate.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    decision_status: decisionStatus,
                    ai_reasoning: nextReasoning
                })
            });
            const updatedCandidate = response.candidate;

            setCandidates(previous =>
                previous.map(candidate =>
                    candidate.id === updatedCandidate.id ? updatedCandidate : candidate
                )
            );
            setSelectedCandidate(updatedCandidate);
            setActionMessage({
                type: 'success',
                text: decisionStatus === 'Shortlisted'
                    ? 'Candidate moved to shortlist successfully.'
                    : decisionStatus === 'Rejected'
                        ? 'Candidate marked as rejected.'
                        : 'Candidate kept in recruiter review.'
            });
            fetchData();
        } catch (error) {
            setActionMessage({ type: 'error', text: 'Unable to save the recruiter decision right now.' });
        } finally {
            setReviewSaving(false);
        }
    };

    const filteredCandidates = useMemo(() => {
        return candidates.filter(candidate => {
            const matchesFilter = filter === 'All' || candidate.decision_status === filter;
            const haystack = [
                candidate.first_name,
                candidate.last_name,
                candidate.email,
                candidate.applied_role,
                candidate.current_role
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return matchesFilter && haystack.includes(searchTerm.toLowerCase());
        });
    }, [candidates, filter, searchTerm]);

    const selectedReasoning = selectedCandidate ? (parseJsonObject(selectedCandidate.ai_reasoning) as ReviewReasoning | null) : null;
    const selectedJob = useMemo(() => {
        if (!selectedCandidate) return null;

        if (selectedReasoning?.matchedJobId) {
            const exact = jobs.find(job => job.id === selectedReasoning.matchedJobId);
            if (exact) return exact;
        }

        if (selectedCandidate.job_id) {
            const exact = jobs.find(job => job.id === selectedCandidate.job_id);
            if (exact) return exact;
        }

        const roleText = normalizeText(selectedReasoning?.matchedJobTitle || selectedCandidate.applied_role);
        if (!roleText) return null;

        return jobs.find(job => normalizeText(job.title) === roleText) || null;
    }, [jobs, selectedCandidate, selectedReasoning]);

    const selectedRequiredSkills = useMemo(() => {
        if (selectedReasoning?.requiredSkills?.length) return selectedReasoning.requiredSkills;
        return parseSkills(selectedJob?.requirements);
    }, [selectedJob, selectedReasoning]);

    const selectedMatchedSkills = useMemo(() => {
        if (selectedReasoning?.matchedSkills?.length) return selectedReasoning.matchedSkills;
        const candidateSkills = parseSkills(selectedCandidate?.skills);
        return selectedRequiredSkills.filter(requiredSkill => {
            const normalizedRequiredSkill = normalizeText(requiredSkill);
            return candidateSkills.some(candidateSkill => {
                const normalizedCandidateSkill = normalizeText(candidateSkill);
                return normalizedCandidateSkill.includes(normalizedRequiredSkill) || normalizedRequiredSkill.includes(normalizedCandidateSkill);
            });
        });
    }, [selectedCandidate?.skills, selectedReasoning, selectedRequiredSkills]);

    const selectedMissingSkills = useMemo(() => {
        const normalizedMatched = selectedMatchedSkills.map(normalizeText);
        return selectedRequiredSkills.filter(skill => !normalizedMatched.includes(normalizeText(skill)));
    }, [selectedMatchedSkills, selectedRequiredSkills]);

    const syncSummary = status.syncHealth.lastSummary;
    const syncBannerTone = status.syncHealth.state === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : status.syncHealth.state === 'running'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : status.syncHealth.state === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-700';

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <RefreshCcw className="h-5 w-5 animate-spin text-slate-600" />
                    <span className="text-sm font-medium text-slate-600">Loading operations workspace</span>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto h-full max-w-[1600px] space-y-6 overflow-y-auto">
            {selectedCandidate && (
                <div className="fixed inset-0 z-40 bg-white/60 backdrop-blur-sm" onClick={closeCandidateReview} aria-hidden="true" />
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Operations Agent</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">
                            Candidate intake, review, and tracker control
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                            This workspace is designed for live recruiting operations: intake monitoring, decision review,
                            tracker sync, and handoff into scheduling.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                            status.status === 'Running'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}>
                            <span className={`h-2 w-2 rounded-full ${status.status === 'Running' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            Agent {status.status}
                        </div>

                        <button onClick={handleRunNow} className="btn-primary flex items-center gap-2">
                            <RefreshCcw className="h-4 w-4" />
                            Run cycle
                        </button>

                        <button onClick={handleSyncCandidates} className="btn-secondary flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            Sync tracker
                        </button>

                        {status.status === 'Running' ? (
                            <button onClick={() => handleToggle('stop')} className="btn-secondary flex items-center gap-2">
                                <StopCircle className="h-4 w-4" />
                                Stop scheduler
                            </button>
                        ) : (
                            <button onClick={() => handleToggle('start')} className="btn-secondary flex items-center gap-2">
                                <Play className="h-4 w-4" />
                                Start scheduler
                            </button>
                        )}

                        {authUrl && (
                            <a
                                href={authUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary flex items-center gap-2"
                            >
                                <Mail className="h-4 w-4" />
                                Authorize Google
                            </a>
                        )}
                    </div>
                </div>
            </section>

            {actionMessage && (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    actionMessage.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : actionMessage.type === 'error'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}>
                    {actionMessage.text}
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Processed" value={stats?.total || 0} icon={Users} />
                <MetricCard label="Shortlisted" value={stats?.shortlisted || 0} icon={CheckCircle2} />
                <MetricCard label="Review Required" value={stats?.review || 0} icon={AlertTriangle} />
                <MetricCard label="Rejected" value={stats?.rejected || 0} icon={CircleX} />
                <MetricCard label="Average Fit" value={`${Math.round(stats?.avg_score || 0)}%`} icon={Clock3} />
            </section>

            <section className={`rounded-2xl border px-5 py-5 ${syncBannerTone}`}>
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">Tracker Health</p>
                        <h3 className="mt-2 text-xl font-semibold">Google Sheets and Drive status</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 opacity-90">
                            {status.syncHealth.state === 'error'
                                ? (status.syncHealth.lastError || 'The last sync did not complete successfully.')
                                : status.syncHealth.state === 'running'
                                    ? 'A tracker export is currently running.'
                                    : status.syncHealth.state === 'success'
                                        ? 'The tracker and file archive are currently in sync.'
                                        : 'No manual tracker sync has been run during this session.'}
                        </p>
                    </div>
                    <div className="grid min-w-[320px] grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Last attempt</p>
                            <p className="mt-1 text-sm font-medium">{formatTimestamp(status.syncHealth.lastAttemptAt)}</p>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Last success</p>
                            <p className="mt-1 text-sm font-medium">{formatTimestamp(status.syncHealth.lastSyncedAt)}</p>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Rows synced</p>
                            <p className="mt-1 text-sm font-medium">{syncSummary ? `${syncSummary.syncedToSheets}/${syncSummary.candidateCount}` : 'Not yet run'}</p>
                        </div>
                        <div className="rounded-xl bg-white/80 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Drive records</p>
                            <p className="mt-1 text-sm font-medium">{syncSummary ? `${syncSummary.driveLinked}` : 'Not yet run'}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_420px]">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h3 className="text-base font-semibold text-slate-800">Candidate review queue</h3>
                            <p className="mt-1 text-sm text-slate-500">
                                Review the latest candidates, understand their status, and open source documents quickly.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative min-w-[280px]">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by candidate, role, or email"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none ring-0 transition focus:border-slate-300"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                                <Filter className="h-4 w-4 text-slate-400" />
                                <select
                                    className="bg-transparent outline-none"
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                >
                                    <option value="All">All statuses</option>
                                    <option value="Shortlisted">Shortlisted</option>
                                    <option value="Review Required">Review Required</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Candidate</th>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Applied Role</th>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current Role</th>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fit</th>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Next Action</th>
                                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Document</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {filteredCandidates.map(candidate => (
                                    <tr key={candidate.id} className="hover:bg-slate-50">
                                        <td className="px-5 py-4">
                                            <div className="font-medium text-slate-800">
                                                {candidate.first_name} {candidate.last_name}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">{candidate.email}</div>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-700">
                                            {candidate.applied_role || 'Role pending'}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600">
                                            {candidate.current_role || 'Not specified'}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                                                    <div
                                                        className={`h-full rounded-full ${candidate.overall_score >= 75 ? 'bg-emerald-600' : candidate.overall_score >= 50 ? 'bg-amber-500' : 'bg-slate-500'}`}
                                                        style={{ width: `${candidate.overall_score}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-semibold text-slate-800">{candidate.overall_score}%</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getStatusTone(candidate.decision_status)}`}>
                                                {candidate.decision_status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600">
                                            <div className="max-w-[260px]">
                                                <div className="font-medium text-slate-800">{candidate.workflow_state || 'Awaiting review'}</div>
                                                <div className="mt-1 text-xs leading-5 text-slate-500">{candidate.next_action || candidate.quick_summary || 'Review candidate details.'}</div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openCandidateReview(candidate)}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                                >
                                                    Review
                                                </button>
                                                {candidate.drive_file_link ? (
                                                    <a
                                                        href={candidate.drive_file_link}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                        Open
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-slate-400">Not available</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredCandidates.length === 0 && (
                            <div className="py-12 text-center text-sm text-slate-500">
                                No candidates match the current search and filter criteria.
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-slate-800">Live activity</h3>
                                <p className="mt-1 text-sm text-slate-500">Recent agent operations and sync events.</p>
                            </div>
                            <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                Live
                            </div>
                        </div>
                        <div className="h-[420px] overflow-y-auto rounded-xl bg-white p-4 font-mono text-xs text-slate-200">
                            <div className="mb-3 flex items-center gap-2 text-slate-400">
                                <Terminal className="h-4 w-4" />
                                System activity log
                            </div>
                            <div className="space-y-2">
                                {status.logs.length > 0 ? (
                                    status.logs.map((log, index) => (
                                        <p key={index} className="leading-6 text-slate-300">
                                            <span className="mr-2 text-slate-500">[{index}]</span>
                                            {log}
                                        </p>
                                    ))
                                ) : (
                                    <p className="py-12 text-center italic text-slate-500">No agent activity recorded yet.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                                <Database className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-slate-800">Autonomous mode</h3>
                                <p className="text-sm text-slate-500">What the system is currently responsible for.</p>
                            </div>
                        </div>
                        <div className="space-y-3 text-sm text-slate-600">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                Watches Gmail application intake
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                Scores candidates against active roles
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                Stores resumes in Drive and updates Sheets
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                Keeps recruiter review as the final gate for weak or partial matches
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {selectedCandidate && (
                <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recruiter Review</p>
                            <h3 className="mt-2 text-2xl font-semibold text-slate-800">
                                {selectedCandidate.first_name} {selectedCandidate.last_name}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">{selectedCandidate.email}</p>
                        </div>
                        <button
                            onClick={closeCandidateReview}
                            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                            aria-label="Close candidate review"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Decision Status</p>
                                <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getStatusTone(selectedCandidate.decision_status)}`}>
                                    {selectedCandidate.decision_status}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fit Score</p>
                                <p className="mt-3 text-2xl font-semibold text-slate-800">{selectedCandidate.overall_score}%</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <Briefcase className="h-4 w-4" />
                                    Role Match
                                </div>
                                <div className="mt-3 space-y-2 text-sm text-slate-600">
                                    <p><span className="font-medium text-slate-800">Applied Role:</span> {selectedCandidate.applied_role || 'Role pending'}</p>
                                    <p><span className="font-medium text-slate-800">Current Role:</span> {selectedCandidate.current_role || 'Not specified'}</p>
                                    <p><span className="font-medium text-slate-800">Experience:</span> {selectedCandidate.years_experience} years</p>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <MapPin className="h-4 w-4" />
                                    Contact and Location
                                </div>
                                <div className="mt-3 space-y-2 text-sm text-slate-600">
                                    <p><span className="font-medium text-slate-800">Location:</span> {selectedCandidate.location || 'Not specified'}</p>
                                    <p><span className="font-medium text-slate-800">Phone:</span> {selectedCandidate.phone || 'Not specified'}</p>
                                    <p><span className="font-medium text-slate-800">Next Action:</span> {selectedCandidate.next_action || 'Review candidate fit'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">Matched job criteria</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                        This is the requirement set the reviewer should use before changing candidate status.
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Confidence</p>
                                    <p className="mt-1 text-sm font-medium capitalize text-slate-800">
                                        {selectedReasoning?.confidence || 'manual review'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="rounded-xl bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Matched role</p>
                                    <p className="mt-2 text-base font-semibold text-slate-800">
                                        {selectedJob?.title || selectedReasoning?.matchedJobTitle || 'No open role matched'}
                                    </p>
                                    <p className="mt-2 text-sm text-slate-600">
                                        {selectedJob?.location ? `Hiring location: ${selectedJob.location}` : 'Role location not defined'}
                                    </p>
                                    <p className="mt-2 text-sm text-slate-600">
                                        Analysis source: {humanizeAnalysisSource(selectedReasoning?.analysisSource)}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Review guidance</p>
                                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                                        <li>Confirm the candidate is being evaluated against the correct role.</li>
                                        <li>Check missing must-have skills before shortlisting.</li>
                                        <li>Use the recruiter note for salary, notice period, or communication observations.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">Required skills</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {selectedRequiredSkills.length > 0 ? selectedRequiredSkills.map(skill => (
                                            <span key={skill} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                                {skill}
                                            </span>
                                        )) : (
                                            <span className="text-sm text-slate-500">No structured requirements saved for this role yet.</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">Matched skills</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {selectedMatchedSkills.length > 0 ? selectedMatchedSkills.map(skill => (
                                            <span key={skill} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                                {skill}
                                            </span>
                                        )) : (
                                            <span className="text-sm text-slate-500">No direct requirement matches found yet.</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedMissingSkills.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-sm font-semibold text-slate-800">Gaps to check</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {selectedMissingSkills.map(skill => (
                                            <span key={skill} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(selectedReasoning?.hardFlags?.length || selectedReasoning?.reasons?.length) && (
                                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <p className="text-sm font-semibold text-amber-800">Why this candidate is still in review</p>
                                        <ul className="mt-3 space-y-2 text-sm text-amber-900/80">
                                            {(selectedReasoning?.hardFlags || ['Recruiter validation is still required before changing status.']).map(flag => (
                                                <li key={flag}>• {flag}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-sm font-semibold text-slate-800">Assessment notes</p>
                                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                            {(selectedReasoning?.reasons || []).map(reason => (
                                                <li key={reason}>• {reason}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <FileText className="h-4 w-4" />
                                Recruiter Summary
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                {stripHtml(selectedCandidate.quick_summary) || 'No summary available yet.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <MessageSquareText className="h-4 w-4" />
                                Application Content
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                {stripHtml(selectedCandidate.application_content) || 'No application message captured for this candidate.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-4">
                            <p className="text-sm font-semibold text-slate-800">Skills found</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {parseSkills(selectedCandidate.skills).length > 0 ? parseSkills(selectedCandidate.skills).map(skill => (
                                    <span key={skill} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                        {skill}
                                    </span>
                                )) : (
                                    <span className="text-sm text-slate-500">No structured skills captured yet.</span>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 p-4">
                            <p className="text-sm font-semibold text-slate-800">Recruiter note</p>
                            <textarea
                                value={reviewNote}
                                onChange={(event) => setReviewNote(event.target.value)}
                                placeholder="Add your decision note or follow-up context for this candidate."
                                className="mt-3 h-28 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-300"
                            />
                        </div>
                    </div>

                    <div className="border-t border-slate-200 px-6 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => handleReviewDecision('Shortlisted')}
                                    disabled={reviewSaving}
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    Shortlist
                                </button>
                                <button
                                    onClick={() => handleReviewDecision('Review Required')}
                                    disabled={reviewSaving}
                                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                                >
                                    Keep in Review
                                </button>
                                <button
                                    onClick={() => handleReviewDecision('Rejected')}
                                    disabled={reviewSaving}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                >
                                    Reject
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                {selectedCandidate.drive_file_link && (
                                    <a
                                        href={selectedCandidate.drive_file_link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Open CV
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>
            )}
        </div>
    );
}
