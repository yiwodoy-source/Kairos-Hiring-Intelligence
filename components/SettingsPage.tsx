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
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleStatus {
  oauthConfigured: boolean;
  connected: boolean;
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
    <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        <StatusDot connected={connected} />
        <span
          className={`text-xs font-medium ${
            connected
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400'
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
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
      {children}
    </p>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 ${className}`}
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
    <div className="mt-4 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-4">
      <p className="text-sm font-semibold text-violet-800 dark:text-violet-300 mb-3 flex items-center gap-2">
        <ChevronRight className="w-4 h-4" />
        Next steps after clicking Connect
      </p>
      <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
            1
          </span>
          <span>Approve all requested Google permissions in the tab that opened.</span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
            2
          </span>
          <span>Copy the refresh token displayed on the confirmation screen.</span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
            3
          </span>
          <span>
            Open{' '}
            <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-xs font-mono">
              backend/.env
            </code>{' '}
            and add:&nbsp;
            <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-xs font-mono">
              GOOGLE_REFRESH_TOKEN=&lt;paste-token-here&gt;
            </code>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
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

export function SettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiFetch<IntegrationStatus>('/api/hr-agent/integration-status');
        if (!cancelled) {
          setStatus(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load integration status');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleConnectGoogle() {
    if (status?.google?.authUrl) {
      window.open(status.google.authUrl, '_blank', 'noopener,noreferrer');
      setShowInstructions(true);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Integrations &amp; Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your connected services and API keys.
        </p>
      </div>

      {/* Loading / error states */}
      {loading && (
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading integration status…</span>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
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
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    All Google services active
                  </span>
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

              {/* Connect button */}
              {!status.google.connected && status.google.authUrl && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={handleConnectGoogle}
                    className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Connect Google Account
                  </button>
                  {showInstructions && <ConnectInstructionsCard />}
                </div>
              )}

              {/* Missing env vars hint */}
              {!status.google.connected &&
                !status.google.authUrl &&
                status.google.missingVars.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-2">
                      Missing environment variables:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {status.google.missingVars.map((v) => (
                        <code
                          key={v}
                          className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-mono"
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
              <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                To configure, set{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                  GEMINI_API_KEY
                </code>{' '}
                and{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                  OPENROUTER_API_KEY
                </code>{' '}
                in{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                  backend/.env
                </code>
                .
              </p>
            </Card>
          </div>

          {/* ----------------------------------------------------------------
              Section 3 — WhatsApp (Twilio)
          ---------------------------------------------------------------- */}
          <div>
            <SectionLabel>WhatsApp (Twilio)</SectionLabel>
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      status.whatsapp.enabled
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {status.whatsapp.enabled ? (
                      <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      WhatsApp Messaging
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
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
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
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

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Required environment variables in{' '}
                  <code className="font-mono font-normal bg-slate-200 dark:bg-slate-700 px-1 rounded">
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
                      className="block text-xs font-mono text-slate-600 dark:text-slate-300"
                    >
                      {line}
                    </code>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Refresh hint */}
          <p className="text-xs text-slate-400 dark:text-slate-600 text-center pb-4">
            Reload this page after updating environment variables to see the latest status.
          </p>
        </>
      )}
    </div>
  );
}

export default SettingsPage;
