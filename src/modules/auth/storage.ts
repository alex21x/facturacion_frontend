import type { AuthSession } from './types';

const AUTH_KEY = 'facturacion.auth.session';
const listeners = new Set<(session: AuthSession | null) => void>();

function notify(session: AuthSession | null): void {
  listeners.forEach((listener) => listener(session));
}

export function saveAuthSession(session: AuthSession): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  notify(session);
}

export function loadAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_KEY);
  notify(null);
}

export function onAuthSessionChanged(listener: (session: AuthSession | null) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
