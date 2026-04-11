import type { AuthSession } from './types';

const AUTH_KEY = 'facturacion.auth.session';
const listenersByKey = new Map<string, Set<(session: AuthSession | null) => void>>();

function resolveKey(scope?: string): string {
  const normalized = (scope ?? '').trim();
  if (!normalized) {
    return AUTH_KEY;
  }

  return `${AUTH_KEY}.${normalized}`;
}

function notify(scope: string | undefined, session: AuthSession | null): void {
  const key = resolveKey(scope);
  const listeners = listenersByKey.get(key);
  if (!listeners) {
    return;
  }

  listeners.forEach((listener) => listener(session));
}

export function saveAuthSession(session: AuthSession, scope?: string): void {
  localStorage.setItem(resolveKey(scope), JSON.stringify(session));
  notify(scope, session);
}

export function loadAuthSession(scope?: string): AuthSession | null {
  const raw = localStorage.getItem(resolveKey(scope));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession(scope?: string): void {
  localStorage.removeItem(resolveKey(scope));
  notify(scope, null);
}

export function onAuthSessionChanged(listener: (session: AuthSession | null) => void, scope?: string): () => void {
  const key = resolveKey(scope);
  if (!listenersByKey.has(key)) {
    listenersByKey.set(key, new Set());
  }

  const listeners = listenersByKey.get(key)!;
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByKey.delete(key);
    }
  };
}
