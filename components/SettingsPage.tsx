import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Wifi,
  WifiOff,
  MessageSquare,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleStatus {
  oauthConfigured: boolean;
  connected: boolean;
  tokenValid: boolean;
  tokenError: string | null;
  gmail: boolean;
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
// Google connect instructions card
// ---------------------------------------------------------------------------

function ConnectInstructionsCard() {
  return (
    <div className="mt-4 rounded-xl bg-amber-50 border border-violet-200 p-4">
      <p className="text-sm font-semibold text-violet-800 mb-3 flex items-center gap-2">
        <ChevronRight className="w-4 h-4" />
        Next steps after clicking Connect
      </p>
      <ol className="space-y-2 text-sm text-slate-700">
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-slate-800 text-xs font-bold flex items-center justify-center">
            1
          </span>
          <span>Approve all requested Google permissions in the tab that opened.</span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-slate-800 text-xs font-bold flex items-center justify-center">
            2
          </span>
          <span>Copy the refresh token displayed on the confirmation screen.</span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-slate-800 text-xs font-bold flex items-center justify-center">
            3
          </span>
          <span>
            Open{' '}
            <code className="px-1 py-0.5 rounded bg-slate-200 text-xs font-mono">
              backend/.env
            </code>{' '}
            and add:&nbsp;
            <code className="px-1 py-0.5 rounded bg-slate-200 text-xs font-mono">
              GOOGLE_REFRESH_TOKEN=&lt;paste-token-here&gt;
            </code>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-slate-800 text-xs font-bold flex items-center justify-center">
            4
          </span>
          <span>Restart the backend server and refresh this page.</span>
        </li>
      </ol>
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [polling, setPolling] = useState(false);
  const [oauthRedirect, setOauthRedirect] = useState<OAuthRedirectState>(null);
  const [oauthErrorDetail, setOauthErrorDetail] = useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll every 3s for up to 3 min when waiting for the OAuth tab to complete
  function startPolling() {
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      const data = await loadStatus(true);
      if (data?.google?.connected) {
        stopPolling();
        setOauthRedirect('success');
      } else if (attempts >= 60) {
        stopPolling();
      }
    }, 3000);
  }

  function stopPolling() {
    setPolling(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => () => stopPolling(), []);

  function handleConnectGoogle() {
    if (status?.google?.authUrl) {
      window.open(status.google.authUrl, '_blank', 'noopener,noreferrer');
      setShowInstructions(false);
      startPolling();
    }
  }

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
              Section 1 — Google Integration
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>Google Integration</SectionLabel>
            <Card>
              {/* Connected banner */}
              {status.google.connected && (
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-emerald-700">
                    All Google services active
                  </span>
                </div>
              )}

              {/* Token expired / invalid banner */}
              {!status.google.connected && status.google.tokenError && (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-red-700">
                        Google token is invalid
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">
                        {status.google.tokenError}
                      </p>
                    </div>
                  </div>
                  {status.google.authUrl && (
                    <div className="mt-3">
                      <button
                        onClick={handleConnectGoogle}
                        disabled={polling}
                        className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-slate-800 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
                      >
                        {polling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        {polling ? 'Waiting for authorization…' : 'Re-authorize Google Account'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Service rows */}
              <div>
                <ServiceRow
                  name="Gmail"
                  description="Send interview invitations, follow-up emails, and notifications"
                  connected={status.google.gmail}
                  statusText={status.google.gmail ? 'Connected' : 'Not connected'}
                />
                <ServiceRow
                  name="Google Drive"
                  description="Store resumes, reports, and hiring documents"
                  connected={status.google.drive}
                  statusText={status.google.drive ? 'Connected' : 'Not connected'}
                />
                <ServiceRow
                  name="Google Sheets"
                  description="Export pipeline data and sync candidate information"
                  connected={status.google.sheets}
                  statusText={status.google.sheets ? 'Connected' : 'Not connected'}
                />
                <ServiceRow
                  name="Google Calendar"
                  description="Schedule interviews and sync availability automatically"
                  connected={status.google.calendar}
                  statusText={status.google.calendar ? 'Connected' : 'Not connected'}
                />
              </div>

              {/* First-time connect button (no token set yet, no error) */}
              {!status.google.connected && !status.google.tokenError && status.google.authUrl && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={handleConnectGoogle}
                    disabled={polling}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-800 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
                  >
                    {polling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    {polling ? 'Waiting for authorization…' : 'Connect Google Account'}
                  </button>
                  {polling && (
                    <p className="text-xs text-slate-500 mt-2">
                      Complete the sign-in in the tab that just opened — this page will update automatically.
                    </p>
                  )}
                </div>
              )}

              {/* Missing env vars hint */}
              {!status.google.connected &&
                !status.google.authUrl &&
                status.google.missingVars.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-amber-600 font-medium mb-2">
                      Missing environment variables:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {status.google.missingVars.map((v) => (
                        <code
                          key={v}
                          className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-mono"
                        >
                          {v}
                        </code>
                      ))}
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
