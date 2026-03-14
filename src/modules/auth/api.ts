import type { LoginPayload, LoginResponse } from './types';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

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
    throw new Error(`API ${response.status}: ${text}`);
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
