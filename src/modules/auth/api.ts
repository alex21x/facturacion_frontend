import { getApiBaseUrl } from '../../shared/api/base-url';
import type { LoginPayload, LoginResponse } from './types';

const baseUrl = getApiBaseUrl();

function looksLikeHtmlResponse(contentType: string, text: string): boolean {
  return contentType.includes('text/html') || /<html|<!doctype/i.test(text);
}

function apiConfigHint(): string {
  return 'La API devolvio HTML en lugar de JSON. Verifica VITE_API_BASE_URL (frontend/admin) y FRONTEND_APP_URL/FRONTEND_URL (backend CORS) en Railway.';
}

async function postJson<T>(path: string, body: unknown, headers?: HeadersInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

  if (!response.ok) {
    if (looksLikeHtmlResponse(contentType, text)) {
      throw new Error(apiConfigHint());
    }

    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed && typeof parsed.message === 'string' && parsed.message.trim() !== '') {
        throw new Error(parsed.message);
      }
    } catch {
      // Ignore JSON parse errors and continue with a fallback message.
    }

    throw new Error(`No se pudo completar la solicitud (${response.status}).`);
  }

  if (looksLikeHtmlResponse(contentType, text)) {
    throw new Error(apiConfigHint());
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Respuesta invalida de la API (se esperaba JSON).');
  }
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return postJson<LoginResponse>('/api/auth/login', payload);
}

export async function refresh(payload: {
  refresh_token: string;
  device_id: string;
}): Promise<LoginResponse> {
  return postJson<LoginResponse>('/api/auth/refresh', payload);
}

export async function logout(accessToken: string): Promise<{ message: string }> {
  return postJson<{ message: string }>(
    '/api/auth/logout',
    {},
    {
      Authorization: `Bearer ${accessToken}`,
    },
  );
}
