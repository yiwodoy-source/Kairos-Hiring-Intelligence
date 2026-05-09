import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, ArrowRight, Activity, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../services/apiClient';
import { KairosLogo } from './Logo';

interface LoginProps {
  onLogin: (success: boolean) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [error, setError]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');
  const [notice, setNotice]           = useState('');

  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => { userRef.current?.focus(); }, []);

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
      const timeoutId  = setTimeout(() => controller.abort(), 5000);
      const response   = await fetch(`${API_BASE_URL}/api/health`, { method: 'GET', signal: controller.signal });
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
    if (!username.trim() || !password) { setError('Please provide both credentials.'); return; }
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
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

  const isOnline  = connectionStatus === 'online';
  const isTesting = connectionStatus === 'testing' || connectionStatus === 'idle';

  const features = [
    'AI-powered CV screening & scoring',
    'Gmail intake with auto-classification',
    'Google Calendar interview scheduling',
    'Real-time pipeline & analytics',
  ];

  return (
    <div className="min-h-screen flex font-sans" style={{ backgroundColor: '#F4F6FA' }}>

      {/* ── Left panel — brand ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[440px] flex-shrink-0 p-12 relative overflow-hidden"
        style={{ backgroundColor: '#0F1E38' }}
      >
        {/* Subtle radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 20% 80%, rgba(232,150,42,0.10) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Logo mark */}
        <div className="relative flex items-center gap-3 z-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(232,150,42,0.15)' }}
          >
            <KairosLogo size={26} variant="amber" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.3px' }}>
              Kairos
            </p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Hiring Intelligence</p>
          </div>
        </div>

        {/* Center copy */}
        <div className="relative z-10">
          <h2
            className="text-[2.1rem] font-bold text-white leading-tight tracking-tight"
            style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          >
            Hire smarter.<br />
            Move faster.<br />
            <span style={{ color: '#E8962A' }}>Every time.</span>
          </h2>
          <p className="mt-5 text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            A multi-agent hiring system that processes CVs, scores candidates,
            and keeps your pipeline moving — automatically.
          </p>

          <ul className="mt-8 space-y-3">
            {features.map(f => (
              <li key={f} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#E8962A' }} />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <p className="relative z-10 text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Internal · v2.0 · All data stays on your server
        </p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(15,30,56,0.08)' }}
            >
              <KairosLogo size={26} variant="light" />
            </div>
            <div>
              <p className="font-bold text-navy-800 text-sm" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: '#0F1E38' }}>Kairos</p>
              <p className="text-[10px] text-gray-400">Hiring Intelligence</p>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-cardLg overflow-hidden" style={{ border: '1px solid #E4E9F0' }}>

            {/* Status bar */}
            <div
              className="px-6 py-2.5 flex items-center justify-between border-b text-[10px] font-semibold uppercase tracking-widest"
              style={{ borderColor: '#E4E9F0', backgroundColor: '#FAFBFD', color: '#94A3B8' }}
            >
              <span>Internal Access</span>
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOnline ? 'bg-emerald-500' : isTesting ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                <span>{isOnline ? 'Connected' : isTesting ? 'Checking…' : 'Offline'}</span>
              </div>
            </div>

            <div className="p-8 pt-9">
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: '#0F1E38' }}
              >
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-gray-500">Sign in with your admin credentials.</p>

              {notice && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-700">{notice}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748B' }}>
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
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
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: '#F8FAFC',
                        border: `1.5px solid ${error ? '#FDA4AF' : '#E4E9F0'}`,
                        color: '#0F1E38',
                      }}
                      onFocus={e => { e.currentTarget.style.border = `1.5px solid ${error ? '#F43F5E' : '#E8962A'}`; e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'rgba(244,63,94,0.08)' : 'rgba(232,150,42,0.10)'}`; }}
                      onBlur={e  => { e.currentTarget.style.border = `1.5px solid ${error ? '#FDA4AF' : '#E4E9F0'}`; e.currentTarget.style.boxShadow = 'none'; }}
                      aria-invalid={!!error}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748B' }}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full pl-10 pr-11 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: '#F8FAFC',
                        border: `1.5px solid ${error ? '#FDA4AF' : '#E4E9F0'}`,
                        color: '#0F1E38',
                      }}
                      onFocus={e => { e.currentTarget.style.border = `1.5px solid ${error ? '#F43F5E' : '#E8962A'}`; e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'rgba(244,63,94,0.08)' : 'rgba(232,150,42,0.10)'}`; }}
                      onBlur={e  => { e.currentTarget.style.border = `1.5px solid ${error ? '#FDA4AF' : '#E4E9F0'}`; e.currentTarget.style.boxShadow = 'none'; }}
                      aria-invalid={!!error}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#94A3B8' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#0F1E38'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-rose-600">{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-2"
                  style={{ backgroundColor: '#E8962A', boxShadow: '0 2px 8px rgba(232,150,42,0.30)' }}
                  onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#D4851C'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#E8962A'; }}
                >
                  {isLoading ? (
                    <><Activity className="w-4 h-4 animate-spin" />Verifying…</>
                  ) : (
                    <>Access Kairos<ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </div>

            {/* Footer */}
            <div
              className="px-8 py-3.5 border-t flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-widest"
              style={{ borderColor: '#E4E9F0', color: '#CBD5E1' }}
            >
              <span>Kairos</span>
              <span style={{ color: '#E8962A' }}>·</span>
              <span>Hiring Intelligence</span>
              <span style={{ color: '#E8962A' }}>·</span>
              <span>Internal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
