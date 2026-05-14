import { getApiBaseUrl } from '../../shared/api/base-url';
import type { LoginPayload, LoginResponse } from './types';

const baseUrl = getApiBaseUrl();

async function postJson<T>(path: string, body: unknown, headers?: HeadersInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();

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

  return (await response.json()) as T;
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
