import React, { useState, Suspense, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Menu,
  LogOut,
  Sun,
  Moon,
  BarChart3,
  Plus,
  Bot,
  Search as SearchIcon,
  GitBranch,
  FileSearch,
  Bell,
  ChevronRight,
  Settings,
  Upload,
} from 'lucide-react';
import { KairosLogo } from './components/Logo';
import { Candidate, Employee, JobPosting } from './types';
import { Login } from './components/Login';
import { ApiError, apiFetch, clearAuthTokens, getAuthToken } from './services/apiClient';
import {
  CandidateRow,
  EmployeeRow,
  JobRow,
  mapCandidate,
  mapEmployee,
  mapJob
} from './services/hrDataMappers';

// ---------------------------------------------------------------------------
// Lazy imports — existing components kept intact
// ---------------------------------------------------------------------------
const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Employees = React.lazy(() => import('./components/Employees').then(m => ({ default: m.Employees })));
const Recruitment = React.lazy(() => import('./components/Recruitment').then(m => ({ default: m.Recruitment })));
const CyberDashboard = React.lazy(() => import('./components/CyberDashboard').then(m => ({ default: m.CyberDashboard })));
const HrAgentDashboard = React.lazy(() => import('./components/HrAgentDashboard').then(m => ({ default: m.HrAgentDashboard })));

// New page components
const DashboardPage = React.lazy(() => import('./components/DashboardPage').then(m => ({ default: m.DashboardPage })));
const PipelinePage  = React.lazy(() => import('./components/PipelinePage').then(m => ({ default: m.PipelinePage })));
const AgentsPage    = React.lazy(() => import('./components/AgentsPage').then(m => ({ default: m.AgentsPage })));
const JobsPage      = React.lazy(() => import('./components/JobsPage').then(m => ({ default: m.JobsPage })));
const SettingsPage  = React.lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));

// Non-lazy (small, needed immediately in topbar)
import { ImportModal } from './components/ImportModal';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const VIEW = {
  DASHBOARD:   'dashboard',
  PIPELINE:    'pipeline',
  AGENTS:      'agents',
  JOBS:        'jobs',
  EMPLOYEES:   'employees',
  ANALYTICS:   'analytics',
  RECRUITMENT: 'recruitment',
  HR_AGENT:    'hr-agent',
  SETTINGS:    'settings',
} as const;
type ViewType = typeof VIEW[keyof typeof VIEW];

const THEME_STORAGE_KEY = 'theme';
const DATA_REFRESH_INTERVAL = 60000;

// ---------------------------------------------------------------------------
// NAV CONFIGURATION
// ---------------------------------------------------------------------------
interface NavItemConfig {
  id: ViewType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const NAV_GROUP_MAIN: NavItemConfig[] = [
  { id: VIEW.DASHBOARD, icon: LayoutDashboard, label: 'Overview' },
  { id: VIEW.PIPELINE, icon: GitBranch, label: 'Pipeline' },
  { id: VIEW.AGENTS, icon: Bot, label: 'AI Agents' },
];

const NAV_GROUP_WORKSPACE: NavItemConfig[] = [
  { id: VIEW.RECRUITMENT, icon: FileSearch, label: 'Recruitment' },
  { id: VIEW.JOBS,        icon: Briefcase,  label: 'Jobs' },
  { id: VIEW.EMPLOYEES,   icon: Users,      label: 'Employees' },
  { id: VIEW.ANALYTICS,   icon: BarChart3,  label: 'Analytics' },
  { id: VIEW.SETTINGS,    icon: Settings,   label: 'Settings' },
];

// ---------------------------------------------------------------------------
// SIDEBAR NAV ITEM
// ---------------------------------------------------------------------------
interface NavItemProps {
  item: NavItemConfig;
  isActive: boolean;
  isExpanded: boolean;
  onClick: (id: ViewType) => void;
}

const SidebarNavItem = React.memo<NavItemProps>(({ item, isActive, isExpanded, onClick }) => (
  <button
    onClick={() => onClick(item.id)}
    title={!isExpanded ? item.label : undefined}
    aria-label={item.label}
    aria-current={isActive ? 'page' : undefined}
    className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-sm font-medium ${
      isActive
        ? 'text-white'
        : 'text-slate-400 hover:text-white hover:bg-white/5'
    }`}
    style={isActive ? { backgroundColor: 'rgba(255,255,255,0.08)' } : undefined}
  >
    {/* Left accent bar */}
    {isActive && (
      <span
        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-violet-500"
        aria-hidden="true"
      />
    )}
    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-violet-400' : ''}`} />
    {isExpanded && <span className="truncate">{item.label}</span>}
  </button>
));
SidebarNavItem.displayName = 'SidebarNavItem';

// ---------------------------------------------------------------------------
// AGENT STATUS PILLS
// ---------------------------------------------------------------------------
interface AgentStatusState {
  intake: 'running' | 'idle' | 'error';
  screener: 'running' | 'idle' | 'error';
  coordinator: 'running' | 'idle' | 'error';
}

const DOT_COLORS: Record<string, string> = {
  running: '#22c55e',
  idle: '#f59e0b',
  error: '#ef4444',
};

const AgentStatusPills: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => {
  const [status, setStatus] = useState<AgentStatusState>({
    intake: 'idle',
    screener: 'idle',
    coordinator: 'idle',
  });

  useEffect(() => {
    apiFetch<{ agents?: Record<string, { status?: string }> }>('/api/hr-agent/status')
      .then(data => {
        const agents = data?.agents ?? {};
        const derive = (key: string): 'running' | 'idle' | 'error' => {
          const s = agents[key]?.status?.toLowerCase() ?? '';
          if (s === 'running' || s === 'active') return 'running';
          if (s === 'error' || s === 'failed') return 'error';
          return 'idle';
        };
        setStatus({
          intake: derive('intake'),
          screener: derive('screener'),
          coordinator: derive('coordinator'),
        });
      })
      .catch(() => {
        // silently keep defaults
      });
  }, []);

  if (!isExpanded) return null;

  const pills: Array<{ label: string; key: keyof AgentStatusState }> = [
    { label: 'Intake', key: 'intake' },
    { label: 'Screener', key: 'screener' },
    { label: 'Coordinator', key: 'coordinator' },
  ];

  return (
    <div className="mx-3 mb-3 rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
      <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2 font-medium">Agents</p>
      <div className="space-y-1.5">
        {pills.map(({ label, key }) => (
          <div key={key} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: DOT_COLORS[status[key]] }}
                aria-hidden="true"
              />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
            <span
              className="text-[10px] font-medium capitalize"
              style={{ color: DOT_COLORS[status[key]] }}
            >
              {status[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// USER PROFILE (sidebar bottom)
// ---------------------------------------------------------------------------
interface UserProfileProps {
  isExpanded: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
}

const UserProfile = React.memo<UserProfileProps>(({ isExpanded, darkMode, onToggleDarkMode, onLogout }) => (
  <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
    <div className={`flex items-center ${isExpanded ? 'gap-2' : 'justify-center'}`}>
      <img
        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
        alt="Profile"
        className="w-8 h-8 rounded-full border flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        loading="lazy"
        decoding="async"
      />
      {isExpanded && (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">Mayur</p>
            <p className="text-[11px] text-slate-500 truncate">HR Admin</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-md transition-colors text-slate-400 hover:text-white hover:bg-white/10"
              title="Toggle theme"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-md transition-colors text-slate-400 hover:text-white hover:bg-white/10"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  </div>
));
UserProfile.displayName = 'UserProfile';

// ---------------------------------------------------------------------------
// SIDEBAR
// ---------------------------------------------------------------------------
interface SidebarProps {
  isExpanded: boolean;
  activeView: ViewType;
  onNavClick: (id: ViewType) => void;
  onToggle: () => void;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const Sidebar = React.memo<SidebarProps>(({
  isExpanded,
  activeView,
  onNavClick,
  onToggle,
  onLogout,
  darkMode,
  onToggleDarkMode,
}) => (
  <aside
    className={`${isExpanded ? 'w-64' : 'w-16'} flex flex-col flex-shrink-0 transition-all duration-200 z-20`}
    style={{ backgroundColor: '#0B0F1A' }}
  >
    {/* Logo area */}
    <div
      className="h-14 flex items-center px-3 border-b flex-shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <button
        onClick={onToggle}
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-white/10"
        style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}
        aria-label="Toggle sidebar"
      >
        <KairosLogo size={18} />
      </button>
      {isExpanded && (
        <div className="ml-2.5 overflow-hidden">
          <p className="font-bold text-white text-sm leading-tight tracking-tight whitespace-nowrap">Kairos</p>
          <p className="text-[10px] text-slate-500 whitespace-nowrap">Hiring Intelligence</p>
        </div>
      )}
      {isExpanded && (
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-md hover:bg-white/10 transition-colors text-slate-500 hover:text-white"
          aria-label="Collapse sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}
    </div>

    {/* Nav */}
    <nav
      className="flex-1 overflow-y-auto p-2 space-y-0.5"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Group 1 */}
      {NAV_GROUP_MAIN.map(item => (
        <SidebarNavItem
          key={item.id}
          item={item}
          isActive={activeView === item.id}
          isExpanded={isExpanded}
          onClick={onNavClick}
        />
      ))}

      {/* Divider */}
      <div className="my-3 mx-1" style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />

      {/* Group 2 — Workspace */}
      {isExpanded && (
        <p className="text-[10px] uppercase tracking-widest text-slate-600 px-3 pb-1.5 font-medium">
          Workspace
        </p>
      )}
      {NAV_GROUP_WORKSPACE.map(item => (
        <SidebarNavItem
          key={item.id}
          item={item}
          isActive={activeView === item.id}
          isExpanded={isExpanded}
          onClick={onNavClick}
        />
      ))}
    </nav>

    {/* Agent status pills */}
    <AgentStatusPills isExpanded={isExpanded} />

    {/* User profile */}
    <UserProfile
      isExpanded={isExpanded}
      darkMode={darkMode}
      onToggleDarkMode={onToggleDarkMode}
      onLogout={onLogout}
    />
  </aside>
));
Sidebar.displayName = 'Sidebar';

// ---------------------------------------------------------------------------
// COMMAND PALETTE
// ---------------------------------------------------------------------------
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  jobs: JobPosting[];
  candidates: Candidate[];
}

const CommandPalette = React.memo<CommandPaletteProps>(({ isOpen, onClose, employees, jobs, candidates }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose();
      }
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, 8));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return [
        { type: 'action' as const, title: 'Create New Job', action: 'new-job', icon: Plus },
        { type: 'action' as const, title: 'View Analytics', action: 'analytics', icon: BarChart3 },
        ...employees.slice(0, 3).map(e => ({
          type: 'employee' as const,
          title: e.name,
          subtitle: e.role,
          action: `employee:${e.id}`,
          icon: Users,
        })),
        ...jobs.slice(0, 3).map(j => ({
          type: 'job' as const,
          title: j.title,
          subtitle: j.department,
          action: `job:${j.id}`,
          icon: Briefcase,
        })),
      ];
    }

    const q = query.toLowerCase().trim();
    const results: Array<{
      type: string;
      title: string;
      subtitle?: string;
      action: string;
      icon: React.ComponentType<{ className?: string }>;
    }> = [];

    employees.forEach(e => {
      if (e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)) {
        results.push({ type: 'employee', title: e.name, subtitle: e.role, action: `employee:${e.id}`, icon: Users });
      }
    });
    jobs.forEach(j => {
      if (j.title.toLowerCase().includes(q) || j.department.toLowerCase().includes(q)) {
        results.push({ type: 'job', title: j.title, subtitle: j.department, action: `job:${j.id}`, icon: Briefcase });
      }
    });
    candidates.forEach(c => {
      if (c.name.toLowerCase().includes(q)) {
        results.push({ type: 'candidate', title: c.name, subtitle: c.email, action: `candidate:${c.id}`, icon: Users });
      }
    });

    if (results.length === 0) {
      results.push({ type: 'action', title: 'No results found', action: 'none', icon: SearchIcon });
    }

    return results;
  }, [query, employees, jobs, candidates]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-4 top-20 mx-auto max-w-2xl z-50">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <SearchIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
              placeholder="Search employees, jobs, or type a command..."
              className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
              aria-label="Search command palette"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded font-mono">
              Ctrl K
            </kbd>
          </div>
          <div className="max-h-96 overflow-y-auto py-2">
            {query === '' && (
              <div className="px-4 py-1.5 text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                Quick Actions
              </div>
            )}
            {filtered.map((item, i) => (
              <button
                key={`${item.action}-${i}`}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => { onClose(); }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  {item.subtitle && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.subtitle}</div>
                  )}
                </div>
                {item.type !== 'action' && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded capitalize">
                    {item.type}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
});
CommandPalette.displayName = 'CommandPalette';

// ---------------------------------------------------------------------------
// ERROR BOUNDARY
// ---------------------------------------------------------------------------
interface ErrorBoundaryState { hasError: boolean; error?: Error; }
interface ErrorBoundaryProps { fallback: (error?: Error) => React.ReactNode; children: React.ReactNode; }

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) return (this.props as any).fallback(this.state.error);
    return (this.props as any).children;
  }
}

// ---------------------------------------------------------------------------
// DATA HOOK — unchanged from existing
// ---------------------------------------------------------------------------
function useLiveData(isAuthenticated: boolean, onAuthFailure: () => void) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchLiveData = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const [employeeRows, jobRows, candidateRows] = await Promise.all([
        apiFetch<EmployeeRow[]>('/api/hr-agent/employees'),
        apiFetch<JobRow[]>('/api/hr-agent/jobs'),
        apiFetch<CandidateRow[]>('/api/hr-agent/candidates'),
      ]);
      if (!mountedRef.current) return;
      setEmployees(employeeRows.map(mapEmployee));
      setJobs(jobRows.map(mapJob));
      setCandidates(candidateRows.map(mapCandidate));
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAuthTokens();
        onAuthFailure();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to fetch live data: ${msg}`);
      console.error('[App] fetch error:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [onAuthFailure]);

  useEffect(() => {
    if (isAuthenticated) fetchLiveData();
    else {
      setEmployees([]);
      setJobs([]);
      setCandidates([]);
    }
  }, [isAuthenticated, fetchLiveData]);

  useEffect(() => {
    if (!isAuthenticated) return;
    timerRef.current = window.setInterval(fetchLiveData, DATA_REFRESH_INTERVAL);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [isAuthenticated, fetchLiveData]);

  return { employees, jobs, candidates, loading, error, refetch: fetchLiveData, setEmployees, setJobs, setCandidates };
}

// ---------------------------------------------------------------------------
// PAGE INFO MAP
// ---------------------------------------------------------------------------
const PAGE_INFO: Record<ViewType, { title: string; description: string }> = {
  [VIEW.DASHBOARD]:   { title: 'Overview',           description: 'Key metrics and team performance at a glance' },
  [VIEW.PIPELINE]:    { title: 'Pipeline',            description: 'Track candidates through every stage of the funnel' },
  [VIEW.AGENTS]:      { title: 'AI Agents',           description: 'Automated intake, screening, and coordination' },
  [VIEW.JOBS]:        { title: 'Jobs',                description: 'Manage open positions and pipeline metrics' },
  [VIEW.EMPLOYEES]:   { title: 'Employees',           description: 'Manage your team members and their information' },
  [VIEW.ANALYTICS]:   { title: 'Analytics',           description: 'Pipeline quality, intake patterns, and recruiter review demand' },
  [VIEW.RECRUITMENT]: { title: 'Recruitment',         description: 'Full recruitment pipeline with AI screening' },
  [VIEW.HR_AGENT]:    { title: 'Operations Agent',    description: 'Automated intake, review support, export, and handoff' },
  [VIEW.SETTINGS]:    { title: 'Settings',            description: 'Integrations, Google OAuth, and system configuration' },
};

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAuthToken());
  const [activeView, setActiveView] = useState<ViewType>(VIEW.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved ? saved === 'dark' : true;
  });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);

  const handleAuthFailure = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('nexus_hr_auth_notice', 'Your session expired. Please sign in again.');
    }
    setIsAuthenticated(false);
    setActiveView(VIEW.DASHBOARD);
    setIsSidebarOpen(true);
  }, []);

  const { employees, jobs, candidates, error, setJobs, setCandidates } =
    useLiveData(isAuthenticated, handleAuthFailure);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(p => !p);
      }
      if (e.key === 'Escape') setIsCommandPaletteOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Theme sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const handleLogin = useCallback((success: boolean) => {
    if (success) setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthTokens();
    setIsAuthenticated(false);
    setActiveView(VIEW.DASHBOARD);
    setIsSidebarOpen(true);
  }, []);

  const handleNavClick = useCallback((id: ViewType) => {
    setActiveView(id);
    if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
  }, []);

  const toggleSidebar = useCallback(() => setIsSidebarOpen(p => !p), []);
  const toggleDarkMode = useCallback(() => setIsDarkMode(p => !p), []);

  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  const info = PAGE_INFO[activeView] ?? { title: 'Unknown', description: '' };
  const isLive = !error;

  // View renderer
  const renderView = () => {
    const wrap = (children: React.ReactNode) => (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">{children}</div>
    );

    switch (activeView) {
      case VIEW.DASHBOARD:
        return wrap(
          <React.Suspense fallback={null}>
            <DashboardPage employees={employees} jobs={jobs} candidates={candidates} />
          </React.Suspense>
        );
      case VIEW.PIPELINE:
        return wrap(
          <React.Suspense fallback={null}>
            <PipelinePage candidates={candidates} jobs={jobs} setCandidates={setCandidates} />
          </React.Suspense>
        );
      case VIEW.AGENTS:
        return wrap(
          <React.Suspense fallback={null}>
            <AgentsPage />
          </React.Suspense>
        );
      case VIEW.JOBS:
        return wrap(
          <React.Suspense fallback={null}>
            <JobsPage jobs={jobs} candidates={candidates} setJobs={setJobs} />
          </React.Suspense>
        );
      case VIEW.EMPLOYEES:
        return wrap(<Employees employees={employees} />);
      case VIEW.ANALYTICS:
        return wrap(<CyberDashboard />);
      case VIEW.RECRUITMENT:
        return wrap(
          <Recruitment
            jobs={jobs}
            candidates={candidates}
            setJobs={setJobs}
            setCandidates={setCandidates}
          />
        );
      case VIEW.HR_AGENT:
        return wrap(<HrAgentDashboard />);
      case VIEW.SETTINGS:
        return wrap(
          <React.Suspense fallback={null}>
            <SettingsPage />
          </React.Suspense>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <span className="text-5xl">404</span>
            <p className="text-sm">Page not found</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden transition-colors duration-200">
      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        employees={employees}
        jobs={jobs}
        candidates={candidates}
      />

      {/* Import Modal */}
      {isImportOpen && (
        <ImportModal
          onClose={() => setIsImportOpen(false)}
          onImported={(count) => {
            setIsImportOpen(false);
            if (count > 0) {
              apiFetch<CandidateRow[]>('/api/hr-agent/candidates')
                .then(rows => setCandidates(rows.map(mapCandidate)))
                .catch(() => {});
            }
          }}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isExpanded={isSidebarOpen}
        activeView={activeView}
        onNavClick={handleNavClick}
        onToggle={toggleSidebar}
        onLogout={handleLogout}
        darkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Right column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 px-4 flex items-center justify-between gap-3">
          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            {!isSidebarOpen && (
              <button
                onClick={toggleSidebar}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                aria-label="Expand sidebar"
              >
                <Menu className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            )}
            <div className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 min-w-0">
              <span className="hidden sm:inline truncate">Kairos</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 hidden sm:inline" />
              <span className="font-semibold text-slate-900 dark:text-white truncate">{info.title}</span>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live indicator */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isLive
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              {isLive ? 'Live' : 'Offline'}
            </div>

            {/* Search / Command Palette */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400 text-sm"
              aria-label="Open search"
            >
              <SearchIcon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-xs">Search</span>
              <kbd className="hidden lg:inline text-[10px] font-mono text-slate-400 dark:text-slate-500">
                Ctrl K
              </kbd>
            </button>

            {/* Import candidates */}
            <button
              onClick={() => setIsImportOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 text-xs font-medium"
              aria-label="Import candidates"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Import</span>
            </button>

            {/* Notification bell */}
            <button
              className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600"
                aria-hidden="true"
              />
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Toggle theme"
            >
              {isDarkMode
                ? <Sun className="w-4 h-4 text-amber-400" />
                : <Moon className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
        </header>

        {/* Main content */}
        <main
          ref={mainContentRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
        >
          <ErrorBoundary
            fallback={(err?: Error) => (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-8 bg-red-50 dark:bg-red-900/20 rounded-2xl max-w-md">
                  <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-base font-semibold text-red-900 dark:text-red-100 mb-2">
                    Failed to load component
                  </h3>
                  {err && (
                    <p className="text-xs font-mono text-red-500 dark:text-red-400 mb-3 bg-red-100 dark:bg-red-900/40 rounded p-2 text-left break-all">
                      {err.message}
                    </p>
                  )}
                  <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                    Something went wrong loading this view.
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Reload Page
                  </button>
                </div>
              </div>
            )}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Loading {info.title.toLowerCase()}...
                    </p>
                  </div>
                </div>
              }
            >
              {renderView()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
