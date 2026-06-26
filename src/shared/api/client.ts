import { getApiBaseUrl } from './base-url';
import { refresh } from '../../modules/auth/api';
import type { AuthSession } from '../../modules/auth/types';
import { clearAuthSession, loadAuthSession, saveAuthSession } from '../../modules/auth/storage';

const baseUrl = getApiBaseUrl();

let refreshingPromise: Promise<string | null> | null = null;
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const recentGetResponses = new Map<string, { expiresAt: number; data: unknown }>();
const DEFAULT_GET_RESPONSE_CACHE_TTL_MS = 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_REQUEST_TIMEOUT_MS', 20000);
const AUTH_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_AUTH_REQUEST_TIMEOUT_MS', 12000);
const EXPORT_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_EXPORT_REQUEST_TIMEOUT_MS', 45000);
const SLOW_LOOKUP_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_SLOW_LOOKUP_TIMEOUT_MS', 30000);
const BULK_IMPORT_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_BULK_IMPORT_TIMEOUT_MS', 120000);
const BULK_SUNAT_VOID_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_BULK_SUNAT_VOID_TIMEOUT_MS', 600000);
const SALES_ISSUE_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_SALES_ISSUE_TIMEOUT_MS', 90000);
const SUNAT_ASYNC_REQUEST_TIMEOUT_MS = readTimeoutFromEnv('VITE_SUNAT_ASYNC_TIMEOUT_MS', 90000);
const TRANSIENT_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

function readTimeoutFromEnv(key: string, fallbackMs: number): number {
  const rawValue = import.meta.env[key as keyof ImportMetaEnv];
  if (typeof rawValue !== 'string') {
    return fallbackMs;
  }

  const parsed = Number.parseInt(rawValue.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }

  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveRequestTimeoutMs(path: string, method: string): number {
  const cleanPath = path.split('?')[0] ?? path;

  if (isAuthRoute(path)) {
    return AUTH_REQUEST_TIMEOUT_MS;
  }

  if (path.includes('/bulk-import')) {
    return BULK_IMPORT_REQUEST_TIMEOUT_MS;
  }

  if (path.includes('/bulk-sunat-annulment')) {
    return Math.max(BULK_SUNAT_VOID_REQUEST_TIMEOUT_MS, 600000);
  }

  if (path.includes('/export') || path.includes('/print-pdf') || path.includes('/print')) {
    return EXPORT_REQUEST_TIMEOUT_MS;
  }

  if (
    cleanPath === '/api/sales/commercial-documents'
    || /\/api\/sales\/commercial-documents\/\d+\/sunat-void$/.test(cleanPath)
    || /\/api\/sales\/commercial-documents\/\d+\/convert$/.test(cleanPath)
  ) {
    return SALES_ISSUE_REQUEST_TIMEOUT_MS;
  }

  if (
    cleanPath.startsWith('/api/sales/daily-summaries')
    || cleanPath.startsWith('/api/sales/sunat-exceptions')
    || cleanPath.startsWith('/api/sales/gre-guides')
  ) {
    return SUNAT_ASYNC_REQUEST_TIMEOUT_MS;
  }

  if (
    method === 'GET'
    && (
      path.startsWith('/api/sales/lookups')
      || path.startsWith('/api/sales/bootstrap')
      || path.startsWith('/api/sales/commercial-documents')
    )
  ) {
    return SLOW_LOOKUP_REQUEST_TIMEOUT_MS;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function resolveRetryCount(path: string, method: string): number {
  if (isAuthRoute(path)) {
    return 0;
  }

  return method === 'GET' || method === 'HEAD' ? 1 : 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function toNetworkMessage(error: unknown, timeoutMs: number): string {
  if (isAbortError(error)) {
    return `La solicitud excedio el tiempo de espera (${Math.round(timeoutMs / 1000)}s). Intenta nuevamente.`;
  }

  return 'No se pudo conectar con el servidor. Verifica la red o intenta nuevamente en unos segundos.';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;

  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternal);
    }
  }
}

function resolveGetResponseCacheTtlMs(path: string): number {
  if (path.startsWith('/api/appcfg/operational-context')) {
    return 8000;
  }

  if (path.startsWith('/api/appcfg/feature-toggles')) {
    return 8000;
  }

  if (path.startsWith('/api/sales/lookups')) {
    return 10000;
  }

  if (path.startsWith('/api/purchases/lookups')) {
    return 10000;
  }

  if (path.startsWith('/api/sales/bootstrap') && /(^|[?&])include_documents=0(&|$)/.test(path)) {
    return 5000;
  }

  if (/^\/api\/appcfg\/company-.*-matrix$/.test(path)) {
    return 15000;
  }

  if (path.startsWith('/api/appcfg/system-backups/database-files')) {
    return 5000;
  }

  if (path.startsWith('/api/appcfg/commerce-settings')) {
    return 10000;
  }

  if (path.startsWith('/api/appcfg/modules')) {
    return 15000;
  }

  return DEFAULT_GET_RESPONSE_CACHE_TTL_MS;
}

function pruneRecentGetResponses(now: number): void {
  recentGetResponses.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      recentGetResponses.delete(key);
    }
  });
}

function toHeadersObject(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  return headers as Record<string, string>;
}

function isAuthRoute(path: string): boolean {
  return path.includes('/api/auth/login') || path.includes('/api/auth/refresh');
}

function resolveAuthScopeKey(session: AuthSession | null, authHeader?: string): string {
  if (authHeader && authHeader.trim() !== '') {
    return `auth:${authHeader.trim()}`;
  }

  if (session?.user?.id && session?.user?.company_id) {
    return `${session.user.id}:${session.user.company_id}:${session.deviceId}`;
  }

  return 'anon';
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    // Try to recover JSON object when warnings/noise are prepended.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }

    return null;
  }
}

function extractFirstValidationError(parsed: Record<string, unknown> | null): string | null {
  if (!parsed || typeof parsed.errors !== 'object' || parsed.errors === null) {
    return null;
  }

  const errors = parsed.errors as Record<string, unknown>;

  for (const value of Object.values(errors)) {
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'string' && first.trim().length > 0) {
        return first;
      }
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshingPromise) {
    return refreshingPromise;
  }

  refreshingPromise = (async () => {
    const session = loadAuthSession();
    if (!session) {
      return null;
    }

    try {
      const response = await refresh({
        refresh_token: session.refreshToken,
        device_id: session.deviceId,
      });

      const nextSession = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresAt: response.access_expires_at,
        deviceId: response.device_id,
        user: response.user,
      };

      saveAuthSession(nextSession);
      return nextSession.accessToken;
    } catch {
      clearAuthSession();
      return null;
    } finally {
      refreshingPromise = null;
    }
  })();

  return refreshingPromise;
}

async function request<T>(path: string, init?: RequestInit, allowRetry = true): Promise<T> {
  const baseHeaders = toHeadersObject(init?.headers);
  const session = loadAuthSession();
  const authHeader = baseHeaders.Authorization ?? (session ? `Bearer ${session.accessToken}` : undefined);

  const method = String(init?.method ?? 'GET').toUpperCase();
  const timeoutMs = resolveRequestTimeoutMs(path, method);
  const transientRetryCount = allowRetry ? resolveRetryCount(path, method) : 0;
  const maxAttempts = transientRetryCount + 1;
  const canDeduplicateGet = method === 'GET' && !init?.body && !isAuthRoute(path);
  const authScopeKey = resolveAuthScopeKey(session, authHeader);
  const dedupKey = canDeduplicateGet
    ? `${method}:${path}::${authScopeKey}`
    : null;

  if (dedupKey) {
    const now = Date.now();
    pruneRecentGetResponses(now);

    const cached = recentGetResponses.get(dedupKey);
    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }

    const inFlight = inFlightGetRequests.get(dedupKey);
    if (inFlight) {
      return (await inFlight) as T;
    }
  }

  const executeRequest = async (): Promise<T> => {
    let response: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        response = await fetchWithTimeout(`${baseUrl}${path}`, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...baseHeaders,
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
        }, timeoutMs);
      } catch (error) {
        const canRetryNetwork = attempt < maxAttempts;

        if (canRetryNetwork) {
          await sleep(250 * attempt);
          continue;
        }

        throw new Error(toNetworkMessage(error, timeoutMs));
      }

      if (response && TRANSIENT_STATUS_CODES.has(response.status) && attempt < maxAttempts) {
        await sleep(250 * attempt);
        continue;
      }

      break;
    }

    if (!response) {
      throw new Error('No se recibio respuesta del servidor. Intenta nuevamente.');
    }

    if (response.status === 401 && allowRetry && !isAuthRoute(path) && authHeader) {
      const newAccessToken = await refreshAccessToken();

      if (newAccessToken) {
        return request<T>(
          path,
          {
            ...init,
            headers: {
              ...baseHeaders,
              Authorization: `Bearer ${newAccessToken}`,
            },
          },
          false,
        );
      }
    }

    if (!response.ok) {
      const text = await response.text();
      const contentType = response.headers.get('content-type') ?? '';
      const isHtml = contentType.includes('text/html') || /<html|<!doctype/i.test(text);

      if (response.status === 401 && !isAuthRoute(path)) {
        clearAuthSession();
        throw new Error('Sesion expirada o invalida. Inicia sesion nuevamente.');
      }

      if (response.status === 429) {
        throw new Error('Demasiadas solicitudes seguidas. Espera unos segundos y vuelve a intentar.');
      }

      if (isHtml) {
        throw new Error(`Error ${response.status}: respuesta inesperada del servidor.`);
      }

      const parsed = tryParseJsonObject(text);
      const serverMessage = typeof parsed?.message === 'string' ? parsed.message : null;

      if (response.status === 403) {
        const moduleCode = typeof parsed?.module_code === 'string' ? parsed.module_code : null;
        const action = typeof parsed?.action === 'string' ? parsed.action : null;
        const rbacHint = moduleCode ? ` [${moduleCode}${action ? `:${action}` : ''}]` : '';
        const detail = serverMessage && serverMessage.trim() !== ''
          ? serverMessage
          : `Solicitud bloqueada en ${path}`;
        throw new Error(`No tienes permiso para acceder a esta sección.${rbacHint} (${detail})`);
      }

      const validationMessage = extractFirstValidationError(parsed);
      if (response.status === 422 && validationMessage) {
        throw new Error(validationMessage);
      }

      const isTechnical = serverMessage
        ? /SQLSTATE|ERROR:|Exception|at line \d+|vendor\/|->|php/i.test(serverMessage)
        : false;

      if (response.status === 422) {
        if (serverMessage && !isTechnical && serverMessage.toLowerCase() !== 'validation failed') {
          throw new Error(serverMessage);
        }

        const compactText = text.replace(/\s+/g, ' ').trim();
        if (compactText && !/<[a-z][\s\S]*>/i.test(compactText)) {
          throw new Error(`Error de validacion (422): ${compactText.slice(0, 220)}`);
        }

        throw new Error('Error de validacion (422). Revisa los campos obligatorios.');
      }

      if (serverMessage && !isTechnical) {
        throw new Error(serverMessage);
      }

      throw new Error(`Error en el servidor (${response.status}). Contacta al administrador.`);
    }

    return (await response.json()) as T;
  };

  if (!dedupKey) {
    return executeRequest();
  }

  const promise = executeRequest();
  inFlightGetRequests.set(dedupKey, promise as Promise<unknown>);

  try {
    const data = await promise;
    const ttlMs = resolveGetResponseCacheTtlMs(path);
    recentGetResponses.set(dedupKey, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    return data;
  } finally {
    inFlightGetRequests.delete(dedupKey);
  }
}

async function requestRaw(path: string, init?: RequestInit, allowRetry = true): Promise<Response> {
  const baseHeaders = toHeadersObject(init?.headers);
  const session = loadAuthSession();
  const authHeader = baseHeaders.Authorization ?? (session ? `Bearer ${session.accessToken}` : undefined);
  const method = String(init?.method ?? 'GET').toUpperCase();
  const timeoutMs = resolveRequestTimeoutMs(path, method);
  const transientRetryCount = allowRetry ? resolveRetryCount(path, method) : 0;
  const maxAttempts = transientRetryCount + 1;

  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetchWithTimeout(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...baseHeaders,
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      }, timeoutMs);
    } catch (error) {
      const canRetryNetwork = attempt < maxAttempts;
      if (canRetryNetwork) {
        await sleep(250 * attempt);
        continue;
      }

      throw new Error(toNetworkMessage(error, timeoutMs));
    }

    if (response && TRANSIENT_STATUS_CODES.has(response.status) && attempt < maxAttempts) {
      await sleep(250 * attempt);
      continue;
    }

    break;
  }

  if (!response) {
    throw new Error('No se recibio respuesta del servidor. Intenta nuevamente.');
  }

  if (response.status === 401 && allowRetry && !isAuthRoute(path) && authHeader) {
    const newAccessToken = await refreshAccessToken();

    if (newAccessToken) {
      return requestRaw(
        path,
        {
          ...init,
          headers: {
            ...baseHeaders,
            Authorization: `Bearer ${newAccessToken}`,
          },
        },
        false,
      );
    }
  }

  return response;
}

export const apiClient = {
  baseUrl,
  request,
  requestRaw,
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      ...(init ?? {}),
    }),
};
