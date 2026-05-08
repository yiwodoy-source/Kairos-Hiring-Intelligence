import React, { useMemo, useState, useEffect } from 'react';
import {
  Bot,
  Users,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Mail,
  Search,
  Calendar,
  Zap,
  Activity,
  ArrowRight,
  Circle,
  Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { Employee, JobPosting, Candidate, CandidateStatus, JobStatus } from '../types.ts';
import { apiFetch } from '../services/apiClient';

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */
interface DashboardPageProps {
  employees: Employee[];
  jobs: JobPosting[];
  candidates: Candidate[];
}

interface AgentStatusResponse {
  status: string;
  stats?: {
    processed?: number;
    shortlisted?: number;
    outreached?: number;
  };
  syncHealth?: {
    state?: string;
  };
  logs?: string[];
}

type AgentRunState = 'Running' | 'Idle' | 'Error';

interface AgentDef {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  colorHex: string;
  icon: React.ElementType;
}

/* ─────────────────────────────────────────────
   Agent Definitions
   ───────────────────────────────────────────── */
const AGENTS: AgentDef[] = [
  { id: 'intake',      name: 'Intake',      subtitle: 'Gmail · PDF Parser',   color: 'violet',  colorHex: '#8B5CF6', icon: Mail },
  { id: 'screener',    name: 'Screener',    subtitle: 'AI · JD Matching',     color: 'cyan',    colorHex: '#06B6D4', icon: Search },
  { id: 'sourcer',     name: 'Sourcer',     subtitle: 'Job Boards · Profiles', color: 'emerald', colorHex: '#10B981', icon: Zap },
  { id: 'outreach',    name: 'Outreach',    subtitle: 'Email · WhatsApp',     color: 'amber',   colorHex: '#F59E0B', icon: Bot },
  { id: 'scheduler',   name: 'Scheduler',   subtitle: 'Calendar · Slots',     color: 'pink',    colorHex: '#EC4899', icon: Calendar },
  { id: 'coordinator', name: 'Coordinator', subtitle: 'Orchestrator',         color: 'indigo',  colorHex: '#6366F1', icon: Activity },
];

const PIPELINE_STATUSES = [
  { label: 'Applied',          value: CandidateStatus.APPLIED,          color: '#8B5CF6' },
  { label: 'Screening',        value: CandidateStatus.SCREENING,        color: '#06B6D4' },
  { label: 'Review Required',  value: CandidateStatus.REVIEW_REQUIRED,  color: '#F59E0B' },
  { label: 'Shortlisted',      value: CandidateStatus.SHORTLISTED,      color: '#10B981' },
  { label: 'Interview',        value: CandidateStatus.INTERVIEW,        color: '#EC4899' },
  { label: 'Offer',            value: CandidateStatus.OFFER,            color: '#6366F1' },
];

/* ─────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────── */
function StatusPill({ state }: { state: AgentRunState }) {
  if (state === 'Running') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <span className="status-dot" />
        Running
      </span>
    );
  }
  if (state === 'Error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
        <span className="status-dot status-dot--error" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
      <span className="status-dot status-dot--idle" />
      Idle
    </span>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="agent-card min-w-[140px] flex-1 animate-pulse">
      <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-700 mb-3" />
      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 mb-2" />
      <div className="h-2 w-16 rounded bg-slate-100 dark:bg-slate-800 mb-3" />
      <div className="h-5 w-14 rounded-full bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

interface AgentCardProps {
  agent: AgentDef;
  state: AgentRunState;
  activity: string;
}

function AgentCard({ agent, state, activity }: AgentCardProps) {
  const Icon = agent.icon;
  return (
    <div
      className="agent-card min-w-[140px] flex-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
      style={{ borderTop: `3px solid ${agent.colorHex}` }}
    >
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${agent.colorHex}18` }}
      >
        <Icon size={18} style={{ color: agent.colorHex }} />
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
        {agent.name}
      </p>
      <p className="mt-0.5 mb-3 text-xs text-slate-400 dark:text-slate-500 leading-tight">
        {agent.subtitle}
      </p>
      <StatusPill state={state} />
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 truncate leading-tight">
        {activity}
      </p>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tint: string;
  sub?: string;
}

function KpiCard({ label, value, icon: Icon, tint, sub }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-4 animate-slide-up">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tint}18` }}
      >
        <Icon size={20} style={{ color: tint }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white leading-none">
          {value}
        </p>
        {sub && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>
        )}
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: { label: string } }[];
}

function PipelineTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-900 dark:text-white">
        {payload[0].payload.label}
      </p>
      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
        {payload[0].value} candidate{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Dashboard Component
   ───────────────────────────────────────────── */
export function DashboardPage({ employees, jobs, candidates }: DashboardPageProps) {
  const [agentStatus, setAgentStatus] = useState<AgentStatusResponse | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAgentLoading(true);
    apiFetch<AgentStatusResponse>('/api/hr-agent/status')
      .then((data) => {
        if (!cancelled) {
          setAgentStatus(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAgentLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  /* ── KPI calculations ── */
  const kpis = useMemo(() => {
    const total = candidates.length;
    const shortlisted = candidates.filter((c) => c.status === CandidateStatus.SHORTLISTED).length;
    const scores = candidates.map((c) => c.aiMatchScore ?? 0).filter((s) => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const openRoles = jobs.filter((j) => j.status === JobStatus.OPEN).length;
    return { total, shortlisted, avgScore, openRoles };
  }, [candidates, jobs]);

  /* ── Pipeline funnel data ── */
  const pipelineData = useMemo(() => {
    return PIPELINE_STATUSES.map(({ label, value, color }) => ({
      label,
      count: candidates.filter((c) => c.status === value).length,
      color,
    }));
  }, [candidates]);

  /* ── Agent states ── */
  const agentStates = useMemo((): Record<string, { state: AgentRunState; activity: string }> => {
    const isError = agentStatus?.syncHealth?.state === 'error';
    const isRunning = agentStatus?.status === 'Running' || agentStatus?.status === 'running';
    const shortlisted = agentStatus?.stats?.shortlisted ?? 0;
    const processed = agentStatus?.stats?.processed ?? 0;

    return {
      intake: {
        state: isError ? 'Error' : isRunning ? 'Running' : 'Idle',
        activity: isRunning ? `${processed} resumes processed` : 'Standby',
      },
      screener: {
        state: isError ? 'Error' : isRunning ? 'Running' : 'Idle',
        activity: isRunning ? 'Scoring candidates' : 'Standby',
      },
      sourcer: {
        state: isError ? 'Error' : 'Idle',
        activity: 'Standby',
      },
      outreach: {
        state: isError ? 'Error' : 'Idle',
        activity: shortlisted > 0 ? `${shortlisted} candidates queued` : 'Standby',
      },
      scheduler: {
        state: isError ? 'Error' : 'Idle',
        activity: 'Standby',
      },
      coordinator: {
        state: isError ? 'Error' : isRunning ? 'Running' : 'Idle',
        activity: isRunning ? 'Orchestrating pipeline' : 'Standby',
      },
    };
  }, [agentStatus]);

  /* ── Log entries ── */
  const logEntries = useMemo(() => {
    const raw = agentStatus?.logs ?? [];
    return raw.slice(-8).reverse();
  }, [agentStatus]);

  const logDotColors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#8B5CF6', '#06B6D4'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Section 1: Agent Pipeline Flow ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Agent pipeline
        </h2>

        {agentLoading ? (
          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            {AGENTS.map((a) => (
              <React.Fragment key={a.id}>
                <AgentCardSkeleton />
                {a.id !== 'coordinator' && (
                  <div className="flex items-center self-center shrink-0 mt-[-18px]">
                    <ArrowRight size={14} className="text-slate-300 dark:text-slate-600" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            {AGENTS.map((agent, idx) => {
              const info = agentStates[agent.id] ?? { state: 'Idle' as AgentRunState, activity: 'Standby' };
              return (
                <React.Fragment key={agent.id}>
                  <AgentCard agent={agent} state={info.state} activity={info.activity} />
                  {idx < AGENTS.length - 1 && (
                    <div className="flex items-center self-center shrink-0 mt-[-18px]">
                      <ArrowRight size={14} className="text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: KPI Cards ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            label="Total Candidates"
            value={kpis.total}
            icon={Users}
            tint="#8B5CF6"
            sub="all time"
          />
          <KpiCard
            label="Shortlisted"
            value={kpis.shortlisted}
            icon={CheckCircle2}
            tint="#10B981"
            sub={kpis.total > 0 ? `${Math.round((kpis.shortlisted / kpis.total) * 100)}% conversion` : undefined}
          />
          <KpiCard
            label="Avg Fit Score"
            value={kpis.avgScore > 0 ? `${kpis.avgScore}%` : '—'}
            icon={TrendingUp}
            tint="#7c3aed"
            sub="AI match score"
          />
          <KpiCard
            label="Open Roles"
            value={kpis.openRoles}
            icon={Briefcase}
            tint="#3b82f6"
            sub={`of ${jobs.length} total`}
          />
        </div>
      </section>

      {/* ── Section 3: Pipeline Chart + Activity Feed ── */}
      <section>
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          {/* Left: Hiring Pipeline Funnel */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Candidate pipeline distribution
              </h2>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {candidates.length} total
              </span>
            </div>

            {candidates.length === 0 ? (
              <div className="flex h-52 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                <Users size={32} className="opacity-30" />
                <p className="text-sm">No candidate data yet.</p>
              </div>
            ) : (
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pipelineData}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                    barCategoryGap="30%"
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      width={108}
                    />
                    <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {pipelineData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Right: Live Activity Feed */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Live activity
              </h2>
              {agentLoading && (
                <Loader2 size={13} className="animate-spin text-slate-400 dark:text-slate-500" />
              )}
            </div>

            {agentLoading ? (
              <div className="flex flex-1 flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <div className="flex-1 space-y-1">
                      <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800" />
                      <div className="h-2 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : logEntries.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-4">
                <Activity size={28} className="text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed">
                  No agent activity yet. Start the intake scheduler to begin processing.
                </p>
              </div>
            ) : (
              <ol className="flex flex-1 flex-col gap-3 overflow-y-auto">
                {logEntries.map((entry, i) => (
                  <li key={i} className="flex items-start gap-3 group">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: logDotColors[i % logDotColors.length] }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">
                        {entry}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {i === 0 ? 'now' : 'recently'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <button
              className="btn-ghost mt-4 w-full text-xs justify-center"
              type="button"
              onClick={() => {/* no-op */}}
            >
              View all logs
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
