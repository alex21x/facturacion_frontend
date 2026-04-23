import { getApiBaseUrl } from './base-url';
import { refresh } from '../../modules/auth/api';
import { clearAuthSession, loadAuthSession, saveAuthSession } from '../../modules/auth/storage';

const baseUrl = getApiBaseUrl();

let refreshingPromise: Promise<string | null> | null = null;

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

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...baseHeaders,
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });

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

    if (response.status === 403) {
      throw new Error('No tienes permiso para acceder a esta sección.');
    }

    const parsed = tryParseJsonObject(text);

    const validationMessage = extractFirstValidationError(parsed);
    if (response.status === 422 && validationMessage) {
      throw new Error(validationMessage);
    }

    const serverMessage = typeof parsed?.message === 'string' ? parsed.message : null;
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
}

async function requestRaw(path: string, init?: RequestInit, allowRetry = true): Promise<Response> {
  const baseHeaders = toHeadersObject(init?.headers);
  const session = loadAuthSession();
  const authHeader = baseHeaders.Authorization ?? (session ? `Bearer ${session.accessToken}` : undefined);

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...baseHeaders,
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });

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
