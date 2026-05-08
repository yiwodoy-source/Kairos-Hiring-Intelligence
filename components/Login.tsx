import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, ArrowRight, Activity, Eye, EyeOff } from 'lucide-react';
import { API_BASE_URL } from '../services/apiClient';
import { KairosLogo } from './Logo';

interface LoginProps {
  onLogin: (success: boolean) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');
  const [notice, setNotice] = useState('');

  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userRef.current) userRef.current.focus();
  }, []);

  useEffect(() => {
    const authNotice = sessionStorage.getItem('nexus_hr_auth_notice');
    if (authNotice) {
      setNotice(authNotice);
      sessionStorage.removeItem('nexus_hr_auth_notice');
    }
  }, []);

  const testConnection = async () => {
    if (connectionStatus === 'testing') return;
    setConnectionStatus('testing');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      setConnectionStatus(response.ok ? 'online' : 'offline');
    } catch {
      setConnectionStatus('offline');
    }
  };

  useEffect(() => {
    testConnection();
    const interval = setInterval(testConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please provide both credentials.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (data.token) localStorage.setItem('nexus_hr_session_token', data.token);
        onLogin(true);
      } else {
        setError(data.message || 'Invalid credentials. Please try again.');
        setIsLoading(false);
      }
    } catch {
      setError('Cannot reach the server. Check backend on port 3001.');
      setIsLoading(false);
    }
  };

  const isOnline = connectionStatus === 'online';
  const isTesting = connectionStatus === 'testing' || connectionStatus === 'idle';

  return (
    <div className="min-h-screen flex font-sans" style={{ backgroundColor: '#0B0F1A' }}>

      {/* ── Left panel — brand ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-12 border-r"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}
          >
            <KairosLogo size={26} />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight tracking-tight">Kairos</p>
            <p className="text-[10px] text-slate-500">Hiring Intelligence</p>
          </div>
        </div>

        {/* Center copy */}
        <div>
          <h2 className="text-3xl font-bold text-white leading-snug tracking-tight">
            The right hire.<br />
            At the right<br />
            <span style={{ color: '#8B5CF6' }}>moment.</span>
          </h2>
          <p className="mt-5 text-sm text-slate-400 leading-relaxed max-w-xs">
            A multi-agent hiring system that processes every CV, scores every candidate,
            and keeps your pipeline moving — automatically.
          </p>

          {/* Agent pills */}
          <div className="mt-8 flex flex-col gap-2.5">
            {[
              { name: 'Intake', color: '#8B5CF6', desc: 'Gmail · PDF parsing' },
              { name: 'Screener', color: '#06B6D4', desc: 'AI scoring · JD match' },
              { name: 'Outreach', color: '#F59E0B', desc: 'Email · WhatsApp' },
              { name: 'Scheduler', color: '#EC4899', desc: 'Calendar · Meet links' },
              { name: 'Coordinator', color: '#6366F1', desc: 'Pipeline orchestration' },
            ].map((agent) => (
              <div key={agent.name} className="flex items-center gap-3">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="text-xs font-semibold text-slate-300 w-20">{agent.name}</span>
                <span className="text-xs text-slate-500">{agent.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom version */}
        <p className="text-[10px] text-slate-600">Internal · v2.0 · All data stays on your server</p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          className="w-full max-w-md rounded-2xl border overflow-hidden"
          style={{ backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {/* Status bar */}
          <div
            className="px-6 py-3 flex items-center justify-between border-b text-[10px] font-semibold uppercase tracking-widest"
            style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#64748b' }}
          >
            <span>Internal Access</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline ? 'bg-emerald-500' : isTesting ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>{isOnline ? 'Connected' : isTesting ? 'Checking' : 'Offline'}</span>
            </div>
          </div>

          <div className="p-8 pt-10">
            {/* Logo — mobile only */}
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}
              >
                <KairosLogo size={26} />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Kairos</p>
                <p className="text-[10px] text-slate-500">Hiring Intelligence</p>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-slate-400">Enter your admin credentials to continue.</p>

            {notice && (
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <p className="text-xs font-medium text-amber-300">{notice}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    ref={userRef}
                    type="text"
                    required
                    id="username"
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Admin username"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm text-white placeholder-slate-600 outline-none transition-colors ${
                      error
                        ? 'border-rose-500/40 focus:border-rose-500'
                        : 'border-white/10 focus:border-violet-500'
                    }`}
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                    aria-invalid={!!error}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className={`w-full pl-10 pr-11 py-3 rounded-xl border text-sm text-white placeholder-slate-600 outline-none transition-colors ${
                      error
                        ? 'border-rose-500/40 focus:border-rose-500'
                        : 'border-white/10 focus:border-violet-500'
                    }`}
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                    aria-invalid={!!error}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-rose-300">{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-2"
                style={{ backgroundColor: '#7C3AED' }}
                onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = '#6D28D9'); }}
                onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = '#7C3AED'); }}
              >
                {isLoading ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Access Kairos
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div
            className="px-8 py-4 border-t flex items-center justify-center gap-1 text-[10px] text-slate-600 font-medium uppercase tracking-widest"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span>Kairos</span>
            <span className="mx-1.5" style={{ color: '#8B5CF6' }}>·</span>
            <span>Hiring Intelligence</span>
            <span className="mx-1.5" style={{ color: '#8B5CF6' }}>·</span>
            <span>Internal</span>
          </div>
        </div>
      </div>
    </div>
  );
};
