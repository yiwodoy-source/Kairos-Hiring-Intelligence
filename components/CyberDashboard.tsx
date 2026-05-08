import React, { useEffect, useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import {
    RefreshCw,
    Users,
    CheckCircle2,
    AlertTriangle,
    FileText,
    Briefcase,
    Mail,
    MapPin
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';

const STATUS_COLORS = ['#0f766e', '#1d4ed8', '#d97706', '#475569'];

interface CandidateData {
    firstName: string;
    lastName: string;
    email: string;
    emailContent: string;
    summary: string;
    cv: string;
    scoring: number;
    quickRead: string;
}

function shortRoleLabel(value: string): string {
    if (value.length <= 18) return value;
    return `${value.slice(0, 16)}...`;
}

function inferStatus(text: string): 'Shortlisted' | 'Review Required' | 'Rejected' | 'Applied' {
    const normalized = text.toLowerCase();
    if (normalized.includes('shortlist')) return 'Shortlisted';
    if (normalized.includes('reject')) return 'Rejected';
    if (normalized.includes('review')) return 'Review Required';
    return 'Applied';
}

function inferRole(summary: string): string {
    const parts = summary.split('|').map(part => part.trim()).filter(Boolean);
    return parts[0] || 'Role pending';
}

const StatCard = ({
    title,
    value,
    subtitle,
    icon: Icon
}: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
}) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Icon className="h-5 w-5" />
            </div>
        </div>
    </div>
);

export const CyberDashboard: React.FC = () => {
    const [data, setData] = useState<CandidateData[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await apiFetch<Array<{
                first_name: string;
                last_name: string;
                email: string;
                application_content?: string;
                quick_summary?: string;
                drive_file_link?: string;
                overall_score?: number;
                applied_role?: string;
                current_role?: string;
                location?: string;
                decision_status?: string;
                workflow_state?: string;
            }>>('/api/hr-agent/candidates');

            const normalized = result.map(candidate => ({
                firstName: candidate.first_name,
                lastName: candidate.last_name,
                email: candidate.email,
                emailContent: candidate.application_content || '',
                summary: [candidate.applied_role, candidate.current_role, candidate.location].filter(Boolean).join(' | '),
                cv: candidate.drive_file_link || '',
                scoring: Number(candidate.overall_score || 0),
                quickRead: candidate.quick_summary || candidate.workflow_state || candidate.decision_status || 'Pending review'
            }));

            setData(normalized);
        } catch (error) {
            console.error('Failed to load hiring insights data:', error);
            setData([]);
        }
        setLastUpdated(new Date());
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        const interval = window.setInterval(loadData, 300000);
        return () => window.clearInterval(interval);
    }, []);

    const enrichedData = useMemo(() => {
        return data.map(candidate => ({
            ...candidate,
            status: inferStatus(candidate.quickRead),
            role: inferRole(candidate.summary)
        }));
    }, [data]);

    const stats = useMemo(() => {
        const total = enrichedData.length;
        const shortlisted = enrichedData.filter(candidate => candidate.status === 'Shortlisted').length;
        const review = enrichedData.filter(candidate => candidate.status === 'Review Required').length;
        const averageScore = Math.round(enrichedData.reduce((sum, candidate) => sum + candidate.scoring, 0) / (total || 1));
        return { total, shortlisted, review, averageScore };
    }, [enrichedData]);

    const roleChart = useMemo(() => {
        const bucket = new Map<string, number>();
        enrichedData.forEach(candidate => {
            const role = candidate.role;
            bucket.set(role, (bucket.get(role) || 0) + 1);
        });

        return Array.from(bucket.entries())
            .map(([name, value]) => ({ name, value }))
            .slice(0, 6);
    }, [enrichedData]);

    const statusChart = useMemo(() => {
        const bucket = new Map<string, number>();
        enrichedData.forEach(candidate => {
            bucket.set(candidate.status, (bucket.get(candidate.status) || 0) + 1);
        });

        return Array.from(bucket.entries()).map(([name, value]) => ({ name, value }));
    }, [enrichedData]);

    const reviewQueue = useMemo(() => {
        return [...enrichedData]
            .sort((a, b) => b.scoring - a.scoring)
            .slice(0, 5);
    }, [enrichedData]);

    if (loading && data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <RefreshCw className="h-5 w-5 animate-spin text-slate-600 dark:text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading hiring insights</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Hiring Insights</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                            Candidate pipeline visibility for the HR team
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                            This view summarizes current intake quality, review volume, and role demand using the live candidate tracker.
                            It is designed for operational decision-making, not AI theater.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Updated {lastUpdated.toLocaleTimeString()}
                        </div>
                        <button
                            onClick={loadData}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Total Candidates" value={stats.total} subtitle="Records currently in the tracker" icon={Users} />
                <StatCard title="Shortlisted" value={stats.shortlisted} subtitle="Candidates ready to advance" icon={CheckCircle2} />
                <StatCard title="Review Queue" value={stats.review} subtitle="Profiles waiting for recruiter judgment" icon={AlertTriangle} />
                <StatCard title="Average Score" value={`${stats.averageScore}%`} subtitle="Current weighted fit average" icon={Briefcase} />
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-4">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Candidates by applied role</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Where the current hiring demand is concentrating.
                        </p>
                    </div>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={roleChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={shortRoleLabel} />
                                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-4">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Decision mix</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Current balance between shortlist, review, and other states.
                        </p>
                    </div>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusChart}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={64}
                                    outerRadius={92}
                                    paddingAngle={4}
                                >
                                    {statusChart.map((item, index) => (
                                        <Cell key={item.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                        {statusChart.map((item, index) => (
                            <div key={item.name} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }} />
                                    {item.name}
                                </div>
                                <span className="font-semibold text-slate-900 dark:text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">Review queue snapshot</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        The top profiles from the tracker that are most likely to need recruiter attention next.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/60">
                            <tr>
                                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Candidate</th>
                                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Applied Role</th>
                                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Score</th>
                                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Quick Read</th>
                                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Contact</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {reviewQueue.map(candidate => (
                                <tr key={candidate.email} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="px-5 py-4">
                                        <div className="font-medium text-slate-900 dark:text-white">
                                            {candidate.firstName} {candidate.lastName}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                            <Mail className="h-3.5 w-3.5" />
                                            {candidate.email}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300">
                                        <div>{candidate.role}</div>
                                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                            <MapPin className="h-3.5 w-3.5" />
                                            {candidate.summary.split('|')[2]?.trim() || 'Location not specified'}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div className="h-full rounded-full bg-slate-900 dark:bg-slate-200" style={{ width: `${candidate.scoring}%` }} />
                                            </div>
                                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{candidate.scoring}%</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                        {candidate.quickRead}
                                    </td>
                                    <td className="px-5 py-4">
                                        <a
                                            href={candidate.cv}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                        >
                                            <FileText className="h-4 w-4" />
                                            Open CV
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};
