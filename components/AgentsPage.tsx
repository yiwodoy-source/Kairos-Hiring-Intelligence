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
  BrainCircuit,
  X,
  Settings2,
  Users,
  Minus,
  Plus,
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

interface SourcerConfig {
  linkedin: { sessionActive: boolean; scriptReady: boolean };
  scrapeGraph: { configured: boolean };
  firecrawl?: { configured: boolean };
  merge: { configured: boolean; enabled: boolean; hasAccountToken: boolean };
  stats: { totalSourced: number; recentSourced?: { first_name: string; last_name: string; applied_role: string; source: string; created_at: string }[] };
}

interface OpenJobItem {
  id: number;
  title: string;
  status: string;
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
    colorClass: 'text-amber-500',
    borderColor: '#E8962A',
    bgClass: 'bg-amber-400/10',
    capabilities: ['Gmail OAuth watch', 'PDF parsing', 'Deduplication', 'Auto-response'],
    triggerable: true,
    triggerEndpoint: '/api/hr-agent/run',
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
    triggerable: true,
    triggerEndpoint: '/api/hr-agent/trigger/screener',
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
    triggerable: true,
    triggerEndpoint: '/api/hr-agent/trigger/sourcer',
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
    triggerable: true,
    triggerEndpoint: '/api/hr-agent/trigger/outreach',
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
    triggerable: true,
    triggerEndpoint: '/api/hr-agent/trigger/scheduler',
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
    triggerable: true,
    triggerEndpoint: '/api/hr-agent/trigger/coordinator',
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
      'bg-emerald-50 border-emerald-200 text-emerald-800',
    error:
      'bg-rose-50 border-rose-200 text-rose-800',
    info: 'bg-slate-50 border-slate-200 text-slate-800',
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
// Sourcing control panel (slide-over)
// ---------------------------------------------------------------------------

interface SourcingPanelProps {
  open: boolean;
  onClose: () => void;
  sourcerConfig: SourcerConfig | null;
  openJobs: OpenJobItem[];
  onRun: (roles: string[], limit: number) => Promise<void>;
  running: boolean;
  lastResult: { shortlisted: number; review: number; rejected: number; imported: number; message?: string } | null;
}

const SourcingPanel: React.FC<SourcingPanelProps> = ({
  open, onClose, sourcerConfig, openJobs, onRun, running, lastResult,
}) => {
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [limit, setLimit] = useState(5);

  // Sync selectedRoles when jobs load
  useEffect(() => {
    if (openJobs.length > 0 && selectedRoles.length === 0) {
      setSelectedRoles(openJobs.map(j => j.title));
    }
  }, [openJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRole = (title: string) => {
    setSelectedRoles(prev =>
      prev.includes(title) ? prev.filter(r => r !== title) : [...prev, title]
    );
  };

  const sources = sourcerConfig ? [
    { label: 'ScrapeGraph', active: sourcerConfig.scrapeGraph.configured },
    { label: 'Firecrawl', active: !!sourcerConfig.firecrawl?.configured },
    { label: 'LinkedIn', active: sourcerConfig.linkedin.sessionActive },
    { label: 'Merge.dev', active: !!sourcerConfig.merge?.enabled },
  ] : [];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md z-50 flex flex-col bg-white shadow-2xl border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-800">Configure Sourcing Run</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Target roles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Target Roles
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedRoles(openJobs.map(j => j.title))}
                  className="text-[11px] text-amber-600 hover:underline"
                >
                  Select all
                </button>
                <span className="text-slate-400">·</span>
                <button
                  onClick={() => setSelectedRoles([])}
                  className="text-[11px] text-slate-400 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            {openJobs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No open jobs found.</p>
            ) : (
              <div className="space-y-1.5">
                {openJobs.map(j => (
                  <label
                    key={j.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(j.title)}
                      onChange={() => toggleRole(j.title)}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    <span className="text-sm text-slate-700 truncate">{j.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Candidates per source */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Candidates per Source
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLimit(l => Math.max(1, l - 1))}
                disabled={limit <= 1}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <Minus className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <span className="text-lg font-semibold text-slate-800 w-6 text-center">{limit}</span>
              <button
                onClick={() => setLimit(l => Math.min(20, l + 1))}
                disabled={limit >= 20}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <span className="text-xs text-slate-400">per role, per provider</span>
            </div>
          </div>

          {/* Active sources */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Active Sources
            </p>
            <div className="grid grid-cols-2 gap-2">
              {sources.map(s => (
                <div
                  key={s.label}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 border text-xs font-medium ${
                    s.active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {s.label}
                  <span className="ml-auto text-[10px] opacity-70">{s.active ? 'Ready' : 'Off'}</span>
                </div>
              ))}
            </div>
            {sources.every(s => !s.active) && (
              <p className="mt-2 text-xs text-amber-600">
                No sources are configured. Add API keys in Settings.
              </p>
            )}
          </div>

          {/* Last run result */}
          {lastResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700 mb-0.5">Last run</p>
              <p className="text-xs text-emerald-600">
                {lastResult.message ?? `${lastResult.imported} imported — ${lastResult.shortlisted} shortlisted, ${lastResult.review} for review, ${lastResult.rejected} rejected`}
              </p>
            </div>
          )}

          {/* Recent sourced */}
          {sourcerConfig?.stats?.recentSourced && sourcerConfig.stats.recentSourced.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Recently Sourced
              </p>
              <div className="space-y-1.5">
                {sourcerConfig.stats.recentSourced.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Users className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-slate-700 truncate">{c.first_name} {c.last_name}</span>
                    </div>
                    <span className="text-slate-400 shrink-0 text-[10px]">{c.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer action */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-slate-200">
          <button
            onClick={() => onRun(selectedRoles, limit)}
            disabled={running || selectedRoles.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Sourcing…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Sourcing
              </>
            )}
          </button>
          {selectedRoles.length === 0 && (
            <p className="mt-2 text-center text-xs text-slate-400">Select at least one role to run</p>
          )}
        </div>
      </div>
    </>
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
  sourcerConfig?: SourcerConfig | null;
  onConfigureSourcing?: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({
  def,
  isRunning,
  isCoordinatorRunning,
  lastCycleAt,
  onTrigger,
  triggerLoading,
  sourcerConfig,
  onConfigureSourcing,
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
    : 'bg-slate-100 text-slate-500';

  return (
    <div
      className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
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
            <h3 className="text-sm font-semibold text-slate-800">
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
          <p className="text-xs text-slate-500 mt-0.5">{def.subtitle}</p>
        </div>
      </div>

      {/* Description */}
      <div className="px-5 pb-4">
        <p className="text-sm text-slate-600 leading-5">{def.description}</p>
      </div>

      {/* Capabilities */}
      <div className="px-5 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Capabilities
        </p>
        <div className="flex flex-wrap gap-1.5">
          {def.capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-full bg-slate-100 text-slate-500 text-[11px] px-2 py-0.5"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Sourcer status indicators */}
      {def.id === 'sourcer' && sourcerConfig && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {[
            { label: 'LinkedIn', active: sourcerConfig.linkedin.sessionActive, ready: 'session ready', notReady: 'no session' },
            { label: 'ScrapeGraph', active: sourcerConfig.scrapeGraph.configured, ready: 'API ready', notReady: 'no API key' },
            { label: 'Merge.dev', active: sourcerConfig.merge?.enabled, ready: 'connected', notReady: 'not configured' },
          ].map(({ label, active, ready, notReady }) => (
            <span
              key={label}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {label} {active ? ready : notReady}
            </span>
          ))}
          {sourcerConfig.stats.totalSourced > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-400/10 text-amber-500">
              {sourcerConfig.stats.totalSourced} sourced total
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {lastCycleAt ? `Last run ${formatTimestamp(lastCycleAt)}` : 'Not yet run'}
          </span>
        </div>

        {def.triggerable ? (
          def.id === 'sourcer' ? (
            <button
              onClick={onConfigureSourcing}
              disabled={triggerLoading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              {triggerLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Settings2 className="w-3.5 h-3.5" />
              )}
              {triggerLoading ? 'Running…' : 'Configure & Run'}
            </button>
          ) : (
            <button
              onClick={onTrigger}
              disabled={triggerLoading}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              {triggerLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Trigger
            </button>
          )
        ) : (
          <div className="relative">
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              Trigger
            </button>
            {showTooltip && (
              <div
                ref={tooltipRef}
                role="tooltip"
                className="absolute bottom-full right-0 mb-2 w-44 rounded-lg bg-white text-slate-800 text-xs px-3 py-2 shadow-lg z-50 pointer-events-none"
              >
                Coming soon — this agent requires additional configuration
                <span className="absolute right-3 -bottom-1 w-2 h-2 bg-white rotate-45" />
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
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : syncHealth.state === 'running'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : syncHealth.state === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-slate-50 text-slate-700';

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
              className="rounded-xl bg-white/70 px-4 py-2.5 min-w-[120px]"
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Live activity log
            </h3>
            <p className="text-xs text-slate-500">
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
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto rounded-xl bg-white p-4 font-mono text-sm"
      >
        <div className="flex items-center gap-2 text-slate-500 mb-3 text-xs">
          <Terminal className="w-3.5 h-3.5" />
          System activity log
        </div>
        {logs.length > 0 ? (
          <div className="space-y-1.5">
            {logs.map((log, index) => (
              <p key={index} className="leading-5 text-slate-600">
                <span className="mr-2 text-slate-400">[{index}]</span>
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
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">
                {value}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
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
  const [triggerLoading, setTriggerLoading] = useState<Record<string, boolean>>({});
  const [batchScreening, setBatchScreening] = useState(false);
  const [bulkOcRunning, setBulkOcRunning] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionBanner, setActionBanner] = useState<ActionBanner | null>(null);
  const [sourcerConfig, setSourcerConfig] = useState<SourcerConfig | null>(null);
  const [sourcingPanelOpen, setSourcingPanelOpen] = useState(false);
  const [openJobs, setOpenJobs] = useState<OpenJobItem[]>([]);
  const [sourcingResult, setSourcingResult] = useState<{ shortlisted: number; review: number; rejected: number; imported: number; message?: string } | null>(null);

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
    }

    // Fetch sourcer config separately (non-critical)
    try {
      const cfg = await apiFetch<SourcerConfig>('/api/hr-agent/sourcer/config');
      setSourcerConfig(cfg);
    } catch { /* sourcer config is non-critical */ }

    // Fetch open jobs for sourcing panel (non-critical)
    try {
      const jobs = await apiFetch<OpenJobItem[]>('/api/hr-agent/jobs');
      setOpenJobs(jobs.filter((j: OpenJobItem) => j.status === 'Open'));
    } catch { /* non-critical */ }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData(false);
    const interval = window.setInterval(() => fetchData(true), 30000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleRunCycle = async () => {
    setTriggerLoading(prev => ({ ...prev, intake: true }));
    try {
      await apiFetch('/api/hr-agent/run', { method: 'POST' });
      addToast('success', 'Intake cycle started. Checking Gmail for new CVs…');
      await fetchData(true);
    } catch {
      addToast('error', 'Unable to start the intake cycle right now.');
    } finally {
      setTriggerLoading(prev => ({ ...prev, intake: false }));
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
      return;
    }

    const def = AGENT_DEFS.find(d => d.id === agentId);
    if (!def) return;

    setTriggerLoading(prev => ({ ...prev, [agentId]: true }));
    setActionBanner(null);
    try {
      const result = await apiFetch<{
        success: boolean;
        message?: string;
        imported?: number;
        shortlisted?: number;
        review?: number;
        rejected?: number;
        summary?: { source: string; role: string; imported: number; shortlisted: number; review: number; rejected: number; error?: string }[];
      }>(def.triggerEndpoint, { method: 'POST' });

      // Sourcer gets an enriched breakdown banner
      if (agentId === 'sourcer' && result.imported !== undefined) {
        const parts: string[] = [];
        if (result.shortlisted) parts.push(`${result.shortlisted} shortlisted`);
        if (result.review) parts.push(`${result.review} for review`);
        if (result.rejected) parts.push(`${result.rejected} rejected`);
        setActionBanner({
          type: result.imported > 0 ? 'success' : 'info',
          message: result.message ?? `Sourcer complete. ${parts.join(', ') || 'No new candidates.'}`,
        });
      } else {
        setActionBanner({
          type: 'success',
          message: result.message ?? `${def.name} completed successfully.`,
        });
      }
      await fetchData(true);
    } catch {
      setActionBanner({
        type: 'error',
        message: `${def.name} could not be triggered. Please try again.`,
      });
    } finally {
      setTriggerLoading(prev => ({ ...prev, [agentId]: false }));
    }
  };

  const handleSourcingRun = async (roles: string[], limit: number) => {
    setTriggerLoading(prev => ({ ...prev, sourcer: true }));
    setActionBanner(null);
    try {
      const result = await apiFetch<{
        success: boolean;
        message?: string;
        imported: number;
        shortlisted: number;
        review: number;
        rejected: number;
      }>('/api/hr-agent/trigger/sourcer', {
        method: 'POST',
        body: JSON.stringify({ roles, limitsPerSource: limit }),
      });
      setSourcingResult({ shortlisted: result.shortlisted ?? 0, review: result.review ?? 0, rejected: result.rejected ?? 0, imported: result.imported ?? 0, message: result.message });
      setActionBanner({
        type: result.imported > 0 ? 'success' : 'info',
        message: result.message ?? `Sourcer complete. ${result.imported} imported.`,
      });
      setSourcingPanelOpen(false);
      await fetchData(true);
    } catch {
      setActionBanner({ type: 'error', message: 'Sourcer could not be triggered. Please try again.' });
    } finally {
      setTriggerLoading(prev => ({ ...prev, sourcer: false }));
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

  const handleBulkOpenClaw = async () => {
    setBulkOcRunning(true);
    setActionBanner(null);
    try {
      const result = await apiFetch<{ success: boolean; processed: number; updated: number; errors: number; message: string }>(
        '/api/openclaw/bulk-sweep',
        { method: 'POST' }
      );
      setActionBanner({ type: 'success', message: result.message });
      await fetchData(true);
    } catch (err: any) {
      setActionBanner({ type: 'error', message: err?.message || 'AI Advisor sweep could not be completed.' });
    } finally {
      setBulkOcRunning(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const isRunning = agentStatus.status === 'Running';
  const isCoordinatorRunning = agentStatus.syncHealth.state === 'running';

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-500" />
          <span className="text-sm font-medium text-slate-600">
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
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Multi-Agent System
            </p>
            <h2 className="mt-1.5 text-2xl font-semibold text-slate-800">
              Agent Control Center
            </h2>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              Monitor and control all automated recruitment agents. Run cycles, sync the tracker, and inspect live activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status pill */}
            <div
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                isRunning
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-slate-100 text-slate-600'
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
              disabled={!!triggerLoading['intake']}
              className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors"
            >
              {triggerLoading['intake'] ? (
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
              className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-cyan-700 transition-colors"
            >
              {batchScreening ? (
                <Zap className="w-4 h-4 animate-pulse" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {batchScreening ? 'Screening…' : 'Re-screen pipeline'}
            </button>

            {/* AI Advisor bulk sweep */}
            <button
              onClick={handleBulkOpenClaw}
              disabled={bulkOcRunning}
              className="flex items-center gap-2 rounded-xl border border-violet-200 bg-amber-50 hover:bg-amber-50 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-amber-700 transition-colors"
            >
              {bulkOcRunning ? (
                <BrainCircuit className="w-4 h-4 animate-pulse" />
              ) : (
                <BrainCircuit className="w-4 h-4" />
              )}
              {bulkOcRunning ? 'Advising…' : 'AI Advisor sweep'}
            </button>

            {/* Sync tracker */}
            <button
              onClick={handleSyncTracker}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Sync tracker
            </button>

            {/* Start/Stop scheduler */}
            <button
              onClick={handleToggleScheduler}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors"
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
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
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
          <Activity className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
              triggerLoading={!!triggerLoading[def.id]}
              sourcerConfig={def.id === 'sourcer' ? sourcerConfig : undefined}
              onConfigureSourcing={def.id === 'sourcer' ? () => setSourcingPanelOpen(true) : undefined}
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

      {/* ── Sourcing control panel ── */}
      <SourcingPanel
        open={sourcingPanelOpen}
        onClose={() => setSourcingPanelOpen(false)}
        sourcerConfig={sourcerConfig}
        openJobs={openJobs}
        onRun={handleSourcingRun}
        running={!!triggerLoading['sourcer']}
        lastResult={sourcingResult}
      />
    </div>
  );
};
