/**
 * Single HTTP client for every dashboard. The base URL is configurable
 * (VITE_API_BASE_URL); empty means "same origin", so http://bus.local works
 * from laptops and phones alike without hardcoding localhost.
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;
  constructor(status: number, code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function api<T = unknown>(path: string, opts: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined || method !== 'GET') headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the SMARTBUS 360 server. Check your Wi-Fi / LAN connection.');
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const e = data?.error;
    const error = new ApiError(res.status, e?.code || `HTTP_${res.status}`, e?.message || res.statusText || 'Request failed', e?.details);
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      window.dispatchEvent(new CustomEvent('smartbus:unauthorized'));
    }
    if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('smartbus:password-change-required'));
    }
    throw error;
  }
  return data as T;
}

export const get = <T,>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.details ? err.details : {};
}
