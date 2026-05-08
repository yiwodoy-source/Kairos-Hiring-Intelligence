const configuredApiBaseUrl =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_URL?.trim();

function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return configuredApiBaseUrl || 'http://localhost:3001';
  }

  const browserBaseUrl = `${window.location.protocol}//${window.location.hostname}:3001`;

  if (!configuredApiBaseUrl) {
    return browserBaseUrl;
  }

  try {
    const configuredUrl = new URL(configuredApiBaseUrl);
    const configuredHost = configuredUrl.hostname.toLowerCase();
    const browserHost = window.location.hostname.toLowerCase();

    if ((configuredHost === '127.0.0.1' || configuredHost === 'localhost') && browserHost !== configuredHost) {
      return `${configuredUrl.protocol}//${browserHost}:${configuredUrl.port || '3001'}`;
    }

    return configuredApiBaseUrl;
  } catch {
    return browserBaseUrl;
  }
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
  return localStorage.getItem('nexus_hr_session_token') || localStorage.getItem('nexus_hr_token');
}

export function clearAuthTokens(): void {
  localStorage.removeItem('nexus_hr_session_token');
  localStorage.removeItem('nexus_hr_token');
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

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
