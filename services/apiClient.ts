/// <reference types="vite/client" />

const API_PORT = 3001;

const configuredApiBaseUrl = import.meta.env.VITE_API_URL?.trim();

function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return configuredApiBaseUrl || `http://localhost:${API_PORT}`;
  }

  if (configuredApiBaseUrl) {
    try {
      const configuredUrl = new URL(configuredApiBaseUrl);
      const configuredHost = configuredUrl.hostname.toLowerCase();
      const browserHost = window.location.hostname.toLowerCase();

      const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1';
      if ((configuredHost === '127.0.0.1' || configuredHost === 'localhost') && browserHost !== configuredHost && !isLoopback(browserHost)) {
        return `${configuredUrl.protocol}//${browserHost}:${configuredUrl.port || String(API_PORT)}`;
      }

      return configuredApiBaseUrl;
    } catch {
      // fall through
    }
  }

  // On deployed environments (Vercel, etc.) the API is behind the same origin via rewrites.
  // Only add the dev port when running locally.
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (isLocal) {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }

  return window.location.origin;
}

const API_BASE_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem('nexus_hr_session_token') || sessionStorage.getItem('nexus_hr_token');
}

export function clearAuthTokens(): void {
  sessionStorage.removeItem('nexus_hr_session_token');
  sessionStorage.removeItem('nexus_hr_token');
  // Clean up legacy localStorage keys
  localStorage.removeItem('nexus_hr_session_token');
  localStorage.removeItem('nexus_hr_token');
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Merge caller-supplied signal with our timeout signal
  let signal: AbortSignal = controller.signal;
  if (init.signal) {
    if ('any' in AbortSignal && typeof (AbortSignal as any).any === 'function') {
      signal = (AbortSignal as any).any([init.signal, controller.signal]);
    } else {
      init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status} ${response.statusText}`;

    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json() as { message?: string; error?: string };
        message = payload.message || payload.error || message;
      } else {
        const text = (await response.text()).trim();
        if (text) {
          message = text;
        }
      }
    } catch {
      // Keep the default message when the error body cannot be parsed.
    }

    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export { API_BASE_URL };
