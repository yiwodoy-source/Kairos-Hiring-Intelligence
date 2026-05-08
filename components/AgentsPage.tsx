import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Zap,
  Search,
  Send,
  Calendar,
  Network,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  Terminal,
  Database,
  Download,
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface AgentStatus {
  status: string;
  logs: string[];
  syncHealth: SyncHealth;
}

interface Stats {
  total: number;
  shortlisted: number;
  rejected: number;
  review: number;
  avg_score: number;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ActionBanner {
  type: 'success' | 'error' | 'info';
  message: string;
}

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  Zap,
  Search,
  Send,
  Calendar,
  Network,
};

const AGENT_DEFS = [
  {
    id: 'intake',
    name: 'Intake Agent',
    subtitle: 'Gmail monitoring & CV parsing',
    description:
      'Watches inbound Gmail for CV emails, parses PDF attachments, and creates structured candidate records in the database.',
    icon: 'Mail',
    colorClass: 'text-violet-400',
    borderColor: '#8B5CF6',
    bgClass: 'bg-violet-500/10',
    capabilities: ['Gmail OAuth watch', 'PDF parsing', 'Deduplication', 'Auto-response'],
    triggerable: true,
  },
  {
    id: 'screener',
    name: 'Screener Agent',
    subtitle: 'AI scoring & JD matching',
    description:
      'Runs AI analysis on each new candidate against active job descriptions. Produces fit scores, skill gap analysis, and shortlist/review/reject decisions.',
    icon: 'Zap',
    colorClass: 'text-cyan-400',
    borderColor: '#06B6D4',
    bgClass: 'bg-cyan-500/10',
    capabilities: ['Gemini AI analysis', 'Skill matching', 'Fit scoring 0–100', 'Auto-shortlist'],
    triggerable: false,
  },
  {
    id: 'sourcer',
    name: 'Sourcer Agent',
    subtitle: 'Proactive candidate discovery',
    description:
      'Searches approved job boards and profile sources to proactively find candidates matching open roles. Tags and imports them into the pipeline.',
    icon: 'Search',
    colorClass: 'text-emerald-400',
    borderColor: '#10B981',
    bgClass: 'bg-emerald-500/10',
    capabilities: ['Multi-portal search', 'Profile enrichment', 'Duplicate detection', 'Role matching'],
    triggerable: false,
  },
  {
    id: 'outreach',
    name: 'Outreach Agent',
    subtitle: 'Candidate communication',
    description:
      'Sends personalized outreach emails to shortlisted candidates, tracks reply status, and queues follow-ups for non-responders.',
    icon: 'Send',
    colorClass: 'text-amber-400',
    borderColor: '#F59E0B',
    bgClass: 'bg-amber-500/10',
    capabilities: ['Email templates', 'Reply tracking', 'Follow-up scheduling', 'WhatsApp (planned)'],
    triggerable: false,
  },
  {
    id: 'scheduler',
    name: 'Scheduler Agent',
    subtitle: 'Interview booking & confirmation',
    description:
      'Confirms candidate availability, books Google Calendar interview slots, sends join links, and handles reschedule requests.',
    icon: 'Calendar',
    colorClass: 'text-pink-400',
    borderColor: '#EC4899',
    bgClass: 'bg-pink-500/10',
    capabilities: ['Calendar integration', 'Availability polling', 'Meet link generation', 'Reminders'],
    triggerable: false,
  },
  {
    id: 'coordinator',
    name: 'Coordinator',
    subtitle: 'Pipeline orchestrator',
    description:
      'Orchestrates all agents, detects pipeline bottlenecks, triggers exports to Google Drive and Sheets, and generates daily summary reports.',
    icon: 'Network',
    colorClass: 'text-indigo-400',
    borderColor: '#6366F1',
    bgClass: 'bg-indigo-500/10',
    capabilities: ['Agent orchestration', 'Drive/Sheets export', 'Health monitoring', 'Daily summaries'],
    triggerable: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not yet run';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Unavailable';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function makeToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const toneMap = {
    success:
      'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200',
    error:
      'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200',
    info: 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
  };
  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : toast.type === 'error'
      ? AlertTriangle
      : Activity;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm font-medium ${toneMap[toast.type]}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 text-current opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

interface AgentCardProps {
  def: (typeof AGENT_DEFS)[number];
  isRunning: boolean;
  isCoordinatorRunning: boolean;
  lastCycleAt: string | null;
  onTrigger: () => void;
  triggerLoading: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({
  def,
  isRunning,
  isCoordinatorRunning,
  lastCycleAt,
  onTrigger,
  triggerLoading,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const Icon = ICON_MAP[def.icon] ?? Activity;

  // Determine per-agent status
  let agentActive = false;
  if (def.id === 'intake' || def.id === 'screener') {
    agentActive = isRunning;
  } else if (def.id === 'coordinator') {
    agentActive = isCoordinatorRunning;
  }

  const statusLabel = agentActive ? 'Active' : 'Idle';
  const statusCls = agentActive
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';

  return (
    <div
      className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
      style={{ borderLeft: `4px solid ${def.borderColor}` }}
    >
      {/* Card header */}
      <div className="p-5 flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${def.bgClass}`}
        >
          <Icon className={`w-5 h-5 ${def.colorClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {def.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusCls}`}
            >
              {agentActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{def.subtitle}</p>
        </div>
      </div>

      {/* Description */}
      <div className="px-5 pb-4">
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-5">{def.description}</p>
      </div>

      {/* Capabilities */}
      <div className="px-5 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          Capabilities
        </p>
        <div className="flex flex-wrap gap-1.5">
          {def.capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] px-2 py-0.5"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {lastCycleAt ? `Last run ${formatTimestamp(lastCycleAt)}` : 'Not yet run'}
          </span>
        </div>

        {def.triggerable ? (
          <button
            onClick={onTrigger}
            disabled={triggerLoading}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            {triggerLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Trigger
          </button>
        ) : (
          <div className="relative">
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              Trigger
            </button>
            {showTooltip && (
              <div
                ref={tooltipRef}
                role="tooltip"
                className="absolute bottom-full right-0 mb-2 w-44 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs px-3 py-2 shadow-lg z-50 pointer-events-none"
              >
                Coming soon — this agent requires additional configuration
                <span className="absolute right-3 -bottom-1 w-2 h-2 bg-slate-900 dark:bg-slate-700 rotate-45" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sync health banner
// ---------------------------------------------------------------------------

interface SyncHealthBannerProps {
  syncHealth: SyncHealth;
}

const SyncHealthBanner: React.FC<SyncHealthBannerProps> = ({ syncHealth }) => {
  const summary = syncHealth.lastSummary;

  const toneCls =
    syncHealth.state === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
      : syncHealth.state === 'running'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
      : syncHealth.state === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';

  const stateLabel =
    syncHealth.state === 'error'
      ? syncHealth.lastError || 'Last sync encountered an error.'
      : syncHealth.state === 'running'
      ? 'A tracker export is currently in progress.'
      : syncHealth.state === 'success'
      ? 'Tracker and Drive archive are in sync.'
      : 'No sync has been run this session.';

  return (
    <div className={`rounded-2xl border px-5 py-4 ${toneCls}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Sync Health
          </p>
          <p className="mt-1.5 text-sm leading-5">{stateLabel}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(
            [
              { label: 'Last attempt', value: formatTimestamp(syncHealth.lastAttemptAt) },
              { label: 'Last success', value: formatTimestamp(syncHealth.lastSyncedAt) },
              {
                label: 'Rows synced',
                value: summary
                  ? `${summary.syncedToSheets}/${summary.candidateCount}`
                  : '—',
              },
              {
                label: 'Drive records',
                value: summary ? String(summary.driveLinked) : '—',
              },
            ] as { label: string; value: string }[]
          ).map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl bg-white/70 dark:bg-slate-900/60 px-4 py-2.5 min-w-[120px]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                {label}
              </p>
              <p className="mt-1 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

interface ActivityLogProps {
  logs: string[];
  onRefresh: () => void;
  refreshing: boolean;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ logs, onRefresh, refreshing }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Live activity log
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Recent agent operations and events
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-400 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto rounded-xl bg-slate-950 p-4 font-mono text-sm"
      >
        <div className="flex items-center gap-2 text-slate-500 mb-3 text-xs">
          <Terminal className="w-3.5 h-3.5" />
          System activity log
        </div>
        {logs.length > 0 ? (
          <div className="space-y-1.5">
            {logs.map((log, index) => (
              <p key={index} className="leading-5 text-slate-300">
                <span className="mr-2 text-slate-500">[{index}]</span>
                {log}
              </p>
            ))}
          </div>
        ) : (
          <p className="py-16 text-center italic text-slate-500 text-sm">
            No agent activity recorded yet.
          </p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

interface StatBarProps {
  stats: Stats | null;
}

const StatBar: React.FC<StatBarProps> = ({ stats }) => {
  const items = [
    { label: 'Processed', value: stats?.total ?? 0, Icon: Database },
    { label: 'Shortlisted', value: stats?.shortlisted ?? 0, Icon: CheckCircle2 },
    { label: 'Under Review', value: stats?.review ?? 0, Icon: AlertTriangle },
    { label: 'Rejected', value: stats?.rejected ?? 0, Icon: Activity },
    {
      label: 'Avg. Fit',
      value: `${Math.round(stats?.avg_score ?? 0)}%`,
      Icon: Zap,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
      {items.map(({ label, value, Icon }) => (
        <div
          key={label}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {value}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300">
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DEFAULT_SYNC_HEALTH: SyncHealth = {
  state: 'idle',
  lastAttemptAt: null,
  lastSyncedAt: null,
  lastError: null,
  lastSummary: null,
};

export const AgentsPage: React.FC = () => {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    status: 'Stopped',
    logs: [],
    syncHealth: DEFAULT_SYNC_HEALTH,
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [batchScreening, setBatchScreening] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionBanner, setActionBanner] = useState<ActionBanner | null>(null);

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = makeToastId();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [statusData, statsData] = await Promise.all([
        apiFetch<AgentStatus>('/api/hr-agent/status'),
        apiFetch<Stats>('/api/hr-agent/stats'),
      ]);
      setAgentStatus(statusData);
      setStats(statsData);
    } catch (err) {
      console.error('[AgentsPage] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    const interval = window.setInterval(() => fetchData(true), 30000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleRunCycle = async () => {
    setTriggerLoading(true);
    try {
      await apiFetch('/api/hr-agent/run', { method: 'POST' });
      addToast('success', 'Processing cycle started. Checking for new candidates…');
      await fetchData(true);
    } catch (err) {
      addToast('error', 'Unable to start the processing cycle right now.');
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleSyncTracker = async () => {
    setActionBanner(null);
    try {
      const result = await apiFetch<{
        candidateCount: number;
        syncedToSheets: number;
        missingDriveLinks: number;
        driveLinked: number;
      }>('/api/hr-agent/sync-candidates', { method: 'POST' });
      setActionBanner({
        type: 'success',
        message: `Tracker sync completed: ${result.syncedToSheets} of ${result.candidateCount} candidates updated. ${result.driveLinked} Drive records linked.`,
      });
      await fetchData(true);
    } catch (err) {
      setActionBanner({
        type: 'error',
        message: 'Tracker sync could not be completed. Please try again.',
      });
    }
  };

  const handleToggleScheduler = async () => {
    const isRunning = agentStatus.status === 'Running';
    const action = isRunning ? 'stop' : 'start';
    try {
      await apiFetch('/api/hr-agent/toggle', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      addToast('success', action === 'start' ? 'Scheduler started.' : 'Scheduler stopped.');
      await fetchData(true);
    } catch (err) {
      addToast('error', 'Unable to update scheduler state.');
    }
  };

  const handleAgentTrigger = async (agentId: string) => {
    if (agentId === 'intake') {
      await handleRunCycle();
    }
  };

  const handleBatchScreen = async () => {
    setBatchScreening(true);
    setActionBanner(null);
    try {
      const result = await apiFetch<{
        processed: number;
        shortlisted: number;
        rejected: number;
        reviewRequired: number;
      }>('/api/hr-agent/batch-screen', { method: 'POST' });
      setActionBanner({
        type: 'success',
        message: `Re-screened ${result.processed} candidate${result.processed !== 1 ? 's' : ''}: ${result.shortlisted} shortlisted, ${result.rejected} rejected, ${result.reviewRequired} still in review.`,
      });
      await fetchData(true);
    } catch {
      setActionBanner({ type: 'error', message: 'Batch re-screen could not be completed. Please try again.' });
    } finally {
      setBatchScreening(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const isRunning = agentStatus.status === 'Running';
  const isCoordinatorRunning = agentStatus.syncHealth.state === 'running';

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Loading agent control center…
          </span>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Top status bar ── */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Multi-Agent System
            </p>
            <h2 className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white">
              Agent Control Center
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Monitor and control all automated recruitment agents. Run cycles, sync the tracker, and inspect live activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status pill */}
            <div
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                isRunning
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              {isRunning ? 'Running' : 'Stopped'}
            </div>

            {/* Run cycle */}
            <button
              onClick={handleRunCycle}
              disabled={triggerLoading}
              className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              {triggerLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run cycle
            </button>

            {/* Re-screen pipeline */}
            <button
              onClick={handleBatchScreen}
              disabled={batchScreening}
              className="flex items-center gap-2 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-950/60 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-cyan-700 dark:text-cyan-300 transition-colors"
            >
              {batchScreening ? (
                <Zap className="w-4 h-4 animate-pulse" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {batchScreening ? 'Screening…' : 'Re-screen pipeline'}
            </button>

            {/* Sync tracker */}
            <button
              onClick={handleSyncTracker}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Sync tracker
            </button>

            {/* Start/Stop scheduler */}
            <button
              onClick={handleToggleScheduler}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              {isRunning ? (
                <>
                  <Square className="w-4 h-4" />
                  Stop scheduler
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start scheduler
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ── Action banner ── */}
      {actionBanner && (
        <div
          className={`rounded-2xl border px-5 py-3.5 text-sm font-medium flex items-start gap-3 ${
            actionBanner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
        >
          {actionBanner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{actionBanner.message}</span>
          <button
            onClick={() => setActionBanner(null)}
            className="opacity-60 hover:opacity-100 transition-opacity ml-2"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Stats bar ── */}
      <StatBar stats={stats} />

      {/* ── Sync health ── */}
      <SyncHealthBanner syncHealth={agentStatus.syncHealth} />

      {/* ── Agent cards grid ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Agents
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {AGENT_DEFS.map((def) => (
            <AgentCard
              key={def.id}
              def={def}
              isRunning={isRunning}
              isCoordinatorRunning={isCoordinatorRunning}
              lastCycleAt={agentStatus.syncHealth.lastAttemptAt}
              onTrigger={() => handleAgentTrigger(def.id)}
              triggerLoading={triggerLoading && def.id === 'intake'}
            />
          ))}
        </div>
      </section>

      {/* ── Activity log ── */}
      <ActivityLog
        logs={agentStatus.logs}
        onRefresh={() => fetchData(true)}
        refreshing={refreshing}
      />

      {/* ── Toast stack ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
          ))}
        </div>
      )}
    </div>
  );
};
