import React, { useMemo } from 'react';
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
import { Users, Briefcase, FileText, Activity, CalendarClock, Layers3 } from 'lucide-react';
import { Employee, JobPosting } from '../types.ts';

interface DashboardProps {
  employees: Employee[];
  jobs: JobPosting[];
}

const COLORS = ['#0f766e', '#1d4ed8', '#d97706', '#475569'];

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

StatCard.displayName = 'StatCard';

export const Dashboard: React.FC<DashboardProps> = React.memo(({ employees, jobs }) => {
  const deptData = useMemo(() => {
    return employees.reduce((acc, curr) => {
      const found = acc.find(item => item.name === curr.department);
      if (found) found.value += 1;
      else acc.push({ name: curr.department, value: 1 });
      return acc;
    }, [] as { name: string; value: number }[]);
  }, [employees]);

  const jobStatusData = useMemo(() => {
    return jobs.reduce((acc, curr) => {
      const found = acc.find(item => item.name === curr.status);
      if (found) found.value += 1;
      else acc.push({ name: curr.status, value: 1 });
      return acc;
    }, [] as { name: string; value: number }[]);
  }, [jobs]);

  const openJobsCount = useMemo(() => jobs.filter(j => j.status === 'Open').length, [jobs]);
  const totalApplicants = useMemo(() => jobs.reduce((acc, j) => acc + j.applicantsCount, 0), [jobs]);
  const activeDepartments = useMemo(() => new Set(employees.map(employee => employee.department)).size, [employees]);
  const avgPerformance = useMemo(() => {
    if (employees.length === 0) return '—';
    const avg = employees.reduce((acc, e) => acc + e.performanceRating, 0) / employees.length;
    return avg.toFixed(1);
  }, [employees]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Overview</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              HR operations at a glance
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              A consolidated view of team structure, active hiring demand, and operational throughput.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 font-medium"><CalendarClock className="h-4 w-4" /> Hiring rhythm</div>
              <div className="mt-1 text-xs text-slate-500">Weekly operating dashboard</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 font-medium"><Layers3 className="h-4 w-4" /> Coverage</div>
              <div className="mt-1 text-xs text-slate-500">{activeDepartments} departments represented</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Employees" value={employees.length} subtitle="Current team members in the system" icon={Users} />
        <StatCard title="Open Roles" value={openJobsCount} subtitle="Hiring demand currently active" icon={Briefcase} />
        <StatCard title="Applicants" value={totalApplicants} subtitle="Total applicants attached to jobs" icon={FileText} />
        <StatCard title="Avg Performance" value={avgPerformance} subtitle="Current benchmark across active employees" icon={Activity} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Employees by department</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Team distribution across core functions.</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f172a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Job status mix</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open, paused, and closed requisitions in the pipeline.</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={jobStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={92}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {jobStatusData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {jobStatusData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  {entry.name}
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
});
