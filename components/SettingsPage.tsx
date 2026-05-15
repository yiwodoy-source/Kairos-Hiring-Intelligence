import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  MessageSquare,
  PlugZap,
  Unplug,
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleStatus {
  oauthConfigured: boolean;
  connected: boolean;
  connectedEmail: string | null;
  tokenValid: boolean;
  tokenError: string | null;
  gmail: boolean;
  gmailCredentialsConfigured: boolean;
  drive: boolean;
  sheets: boolean;
  calendar: boolean;
  authUrl: string | null;
  missingVars: string[];
}

interface IntegrationStatus {
  google: GoogleStatus;
  whatsapp: {
    enabled: boolean;
    configured: boolean;
    provider: string;
  };
  gemini: {
    configured: boolean;
  };
  openrouter: {
    configured: boolean;
  };
}

interface SourcingIntegrations {
  firecrawl: { enabled: boolean; configured: boolean; probe: { ok: boolean; detail: string } };
  scrapegraph: { enabled: boolean; configured: boolean; probe: { ok: boolean; detail: string } };
  merge: { enabled: boolean; configured: boolean; hasAccountToken: boolean; probe: { ok: boolean; detail: string } };
  whatsapp: { enabled: boolean; configured: boolean; probe: { ok: boolean; detail: string } };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${
        connected ? 'bg-emerald-500' : 'bg-amber-500'
      }`}
    />
  );
}

function ServiceRow({
  name,
  description,
  connected,
  statusText,
}: {
  name: string;
  description: string;
  connected: boolean;
  statusText: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        <StatusDot connected={connected} />
        <span
          className={`text-xs font-medium ${
            connected
              ? 'text-emerald-600'
              : 'text-amber-600'
          }`}
        >
          {statusText}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
      {children}
    </p>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type OAuthRedirectState = 'success' | 'no_refresh_token' | 'error' | null;


export function SettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [sourcing, setSourcing] = useState<SourcingIntegrations | null>(null);
  const [sourcingTesting, setSourcingTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oauthRedirect, setOauthRedirect] = useState<OAuthRedirectState>(null);
  const [oauthErrorDetail, setOauthErrorDetail] = useState<string | null>(null);

  // Gmail App Password form state
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailPassword, setGmailPassword] = useState('');
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailSaveError, setGmailSaveError] = useState<string | null>(null);
  const [gmailSaveSuccess, setGmailSaveSuccess] = useState(false);
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState<{ success: boolean; user?: string; error?: string } | null>(null);
  const [showGmailForm, setShowGmailForm] = useState(false);

  async function handleSaveGmailCredentials() {
    if (!gmailEmail || !gmailPassword) return;
    setGmailSaving(true);
    setGmailSaveError(null);
    setGmailSaveSuccess(false);
    setGmailTestResult(null);
    try {
      await apiFetch('/api/hr-agent/gmail-credentials', {
        method: 'POST',
        body: JSON.stringify({ email: gmailEmail, appPassword: gmailPassword }),
      });
      setGmailSaveSuccess(true);
      setGmailPassword('');
      setShowGmailForm(false);
      await loadStatus(true);
    } catch (err) {
      setGmailSaveError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setGmailSaving(false);
    }
  }

  async function handleTestGmailConnection() {
    setGmailTesting(true);
    setGmailTestResult(null);
    try {
      const result = await apiFetch<{ success: boolean; user?: string; error?: string }>('/api/hr-agent/gmail-test');
      setGmailTestResult(result);
    } catch (err) {
      setGmailTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setGmailTesting(false);
    }
  }

  async function loadSourcingStatus() {
    try {
      const data = await apiFetch<SourcingIntegrations>('/api/integrations/status');
      setSourcing(data);
    } catch { /* non-critical */ }
  }

  async function loadStatus(silent = false) {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<IntegrationStatus>('/api/hr-agent/integration-status');
      setStatus(data);
      setError(null);
      return data;
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load integration status');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleTestSourcingConnections() {
    setSourcingTesting(true);
    await loadSourcingStatus();
    setSourcingTesting(false);
  }

  // On mount: check URL params for oauth redirect result, then load status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthParam = params.get('oauth') as OAuthRedirectState;
    if (oauthParam) {
      setOauthRedirect(oauthParam);
      if (oauthParam === 'error') {
        setOauthErrorDetail(params.get('detail'));
      }
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    void loadStatus();
    void loadSourcingStatus();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Integrations &amp; Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your connected services and API keys.
        </p>
      </div>

      {/* OAuth redirect banners */}
      {oauthRedirect === 'success' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">Google account connected successfully</p>
            <p className="text-xs text-emerald-600 mt-0.5">Token saved automatically — no restart needed.</p>
          </div>
          <button onClick={() => setOauthRedirect(null)} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs">✕</button>
        </div>
      )}

      {oauthRedirect === 'no_refresh_token' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-700">No new refresh token received</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Google only issues a refresh token on first authorization. If your account was already connected, revoke access at{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline">myaccount.google.com/permissions</a>{' '}
              then try again.
            </p>
          </div>
          <button onClick={() => setOauthRedirect(null)} className="ml-auto text-amber-500 hover:text-amber-700 text-xs">✕</button>
        </div>
      )}

      {oauthRedirect === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">OAuth authorization failed</p>
            {oauthErrorDetail && <p className="text-xs text-red-600 mt-0.5">{oauthErrorDetail}</p>}
          </div>
          <button onClick={() => setOauthRedirect(null)} className="ml-auto text-red-500 hover:text-red-700 text-xs">✕</button>
        </div>
      )}

      {/* Loading / error states */}
      {loading && (
        <div className="flex items-center gap-3 text-slate-500 py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading integration status…</span>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {status && (
        <>
          {/* ----------------------------------------------------------------
              Section 1 — Gmail Connection (App Password)
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>Gmail Connection</SectionLabel>
            <Card>
              {/* Status row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${status.google.gmail ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    {status.google.gmail ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Gmail (SMTP / IMAP)</p>
                    {status.google.gmail && status.google.connectedEmail ? (
                      <p className="text-xs text-emerald-600 mt-0.5 font-medium">{status.google.connectedEmail}</p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">Read CVs and send automated replies</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDot connected={status.google.gmail} />
                  <span className={`text-xs font-semibold ${status.google.gmail ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {status.google.gmail ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                {status.google.gmail && (
                  <button
                    onClick={handleTestGmailConnection}
                    disabled={gmailTesting}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 px-3 py-2 text-sm font-medium text-slate-700 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${gmailTesting ? 'animate-spin' : ''}`} />
                    {gmailTesting ? 'Testing…' : 'Test connection'}
                  </button>
                )}
                <button
                  onClick={() => { setShowGmailForm(v => !v); setGmailSaveError(null); setGmailSaveSuccess(false); setGmailTestResult(null); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors"
                >
                  {status.google.gmail
                    ? <><Unplug className="w-3.5 h-3.5" />{showGmailForm ? 'Cancel' : 'Reconnect Gmail'}</>
                    : <><PlugZap className="w-3.5 h-3.5" />Connect Gmail</>
                  }
                </button>
              </div>

              {/* Test result */}
              {gmailTestResult && (
                <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 ${gmailTestResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  {gmailTestResult.success
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    : <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                  }
                  <span className={`text-xs ${gmailTestResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                    {gmailTestResult.success
                      ? `SMTP connection verified — sending as ${gmailTestResult.user}`
                      : `Connection failed: ${gmailTestResult.error}`
                    }
                  </span>
                </div>
              )}

              {/* Expandable form */}
              {(showGmailForm || !status.google.gmailCredentialsConfigured) && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <p className="text-xs text-slate-500">
                    Google Account → Security → 2-Step Verification → App Passwords → create one for "Mail". No Google Cloud Console required.
                  </p>
                  {gmailSaveSuccess && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-700">Credentials saved and verified successfully</span>
                    </div>
                  )}
                  {gmailSaveError && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-red-700">{gmailSaveError}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <input
                      type="email"
                      placeholder="Gmail address (e.g. hr@company.com)"
                      value={gmailEmail}
                      onChange={e => { setGmailEmail(e.target.value); setGmailSaveSuccess(false); setGmailSaveError(null); }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="password"
                      placeholder="App Password (16 characters, no spaces)"
                      value={gmailPassword}
                      onChange={e => { setGmailPassword(e.target.value); setGmailSaveSuccess(false); setGmailSaveError(null); }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleSaveGmailCredentials}
                      disabled={gmailSaving || !gmailEmail || !gmailPassword}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
                    >
                      {gmailSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {gmailSaving ? 'Saving & testing…' : 'Save & Connect'}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ----------------------------------------------------------------
              Section 2 — AI Models
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>AI Models</SectionLabel>
            <Card>
              <ServiceRow
                name="Gemini API"
                description="Primary AI model for resume analysis, scoring, and candidate insights"
                connected={status.gemini.configured}
                statusText={status.gemini.configured ? 'Configured' : 'Not configured'}
              />
              <ServiceRow
                name="OpenRouter (Fallback)"
                description="Secondary AI provider used when Gemini is unavailable"
                connected={status.openrouter.configured}
                statusText={status.openrouter.configured ? 'Configured' : 'Not configured'}
              />
              <p className="mt-4 text-xs text-slate-400">
                To configure, set{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 font-mono">
                  GEMINI_API_KEY
                </code>{' '}
                and{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 font-mono">
                  OPENROUTER_API_KEY
                </code>{' '}
                in{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 font-mono">
                  backend/.env
                </code>
                .
              </p>
            </Card>
          </div>

          {/* ----------------------------------------------------------------
              Section 3 — Sourcing Integrations
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>Sourcing Integrations</SectionLabel>
            <Card>
              {/* Firecrawl */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">Firecrawl</p>
                  <p className="text-xs text-slate-500 mt-0.5">Web search & scraping for proactive candidate sourcing</p>
                  {sourcing?.firecrawl?.configured && sourcing.firecrawl.probe && (
                    <p className={`text-xs mt-1 ${sourcing.firecrawl.probe.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {sourcing.firecrawl.probe.detail}
                    </p>
                  )}
                  {!sourcing?.firecrawl?.configured && (
                    <code className="text-[11px] text-amber-600 mt-1 block">FIRECRAWL_API_KEY=  → backend/.env</code>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <StatusDot connected={!!sourcing?.firecrawl?.configured} />
                  <span className={`text-xs font-medium ${sourcing?.firecrawl?.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {sourcing?.firecrawl?.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>

              {/* ScrapeGraph AI */}
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">ScrapeGraph AI</p>
                  <p className="text-xs text-slate-500 mt-0.5">AI-powered public profile extraction for candidate discovery</p>
                  {sourcing?.scrapegraph?.configured && sourcing.scrapegraph.probe && (
                    <p className={`text-xs mt-1 ${sourcing.scrapegraph.probe.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {sourcing.scrapegraph.probe.detail}
                    </p>
                  )}
                  {!sourcing?.scrapegraph?.configured && (
                    <code className="text-[11px] text-amber-600 mt-1 block">SCRAPEGRAPH_API_KEY=  → backend/.env</code>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <StatusDot connected={!!sourcing?.scrapegraph?.configured} />
                  <span className={`text-xs font-medium ${sourcing?.scrapegraph?.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {sourcing?.scrapegraph?.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>

              {/* Merge.dev */}
              <div className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">Merge.dev ATS</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sync candidates from LinkedIn, Greenhouse, Lever, and 30+ ATS platforms</p>
                  {sourcing?.merge?.configured && sourcing.merge.probe && (
                    <p className={`text-xs mt-1 ${sourcing.merge.probe.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {sourcing.merge.probe.detail}
                    </p>
                  )}
                  {!sourcing?.merge?.configured && (
                    <code className="text-[11px] text-amber-600 mt-1 block">MERGE_API_KEY= + MERGE_ACCOUNT_TOKEN=  → backend/.env</code>
                  )}
                  {sourcing?.merge?.configured && !sourcing.merge.hasAccountToken && (
                    <code className="text-[11px] text-amber-600 mt-1 block">MERGE_ACCOUNT_TOKEN= missing  → backend/.env</code>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <StatusDot connected={!!sourcing?.merge?.enabled} />
                  <span className={`text-xs font-medium ${sourcing?.merge?.enabled ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {sourcing?.merge?.enabled ? 'Connected' : sourcing?.merge?.configured ? 'Missing account token' : 'Not configured'}
                  </span>
                </div>
              </div>

              {/* Test connections button */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={handleTestSourcingConnections}
                  disabled={sourcingTesting}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 px-4 py-2 text-sm font-medium text-slate-700 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sourcingTesting ? 'animate-spin' : ''}`} />
                  {sourcingTesting ? 'Testing connections…' : 'Test connections'}
                </button>
                <p className="text-xs text-slate-400 mt-2">
                  Add API keys to <code className="font-mono bg-slate-100 px-1 rounded">backend/.env</code> then restart the backend and click Test connections.
                </p>
              </div>
            </Card>
          </div>

          {/* ----------------------------------------------------------------
              Section 4 — WhatsApp (Twilio)
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>WhatsApp (Twilio)</SectionLabel>
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      status.whatsapp.enabled
                        ? 'bg-emerald-100'
                        : 'bg-slate-100'
                    }`}
                  >
                    {status.whatsapp.enabled ? (
                      <Wifi className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      WhatsApp Messaging
                    </p>
                    <p className="text-xs text-slate-500">
                      Provider:{' '}
                      <span className="font-medium">{status.whatsapp.provider || 'Twilio'}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDot connected={status.whatsapp.enabled && status.whatsapp.configured} />
                  <span
                    className={`text-xs font-medium ${
                      status.whatsapp.enabled && status.whatsapp.configured
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {status.whatsapp.enabled
                      ? status.whatsapp.configured
                        ? 'Active'
                        : 'Enabled, not configured'
                      : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Required environment variables in{' '}
                  <code className="font-mono font-normal bg-slate-200 px-1 rounded">
                    backend/.env
                  </code>
                </p>
                <div className="space-y-1">
                  {[
                    'WHATSAPP_ENABLED=true',
                    'TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    'TWILIO_AUTH_TOKEN=your_auth_token',
                    'TWILIO_WHATSAPP_FROM=whatsapp:+14155238886',
                  ].map((line) => (
                    <code
                      key={line}
                      className="block text-xs font-mono text-slate-600"
                    >
                      {line}
                    </code>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Refresh hint */}
          <p className="text-xs text-slate-400 text-center pb-4">
            Reload this page after updating environment variables to see the latest status.
          </p>
        </>
      )}
    </div>
  );
}

export default SettingsPage;
