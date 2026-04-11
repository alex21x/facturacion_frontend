import { useMemo, useState } from 'react';
import { login, logout } from '../modules/auth/api';
import type { AuthSession } from '../modules/auth/types';
import { CompanyControlView } from '../modules/admin/components/CompanyControlView';

const STORAGE_KEY = 'facturacion.admin.session';

function loadSession(): AuthSession | null {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}
function saveSession(s: AuthSession) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function clearSession() { window.localStorage.removeItem(STORAGE_KEY); }

// ── Login screen ──────────────────────────────────────────────────────────────
function AdminLogin({ onSuccess }: { onSuccess: (s: AuthSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login({
        username,
        password,
        device_id: 'ADMIN-PORTAL',
        device_name: 'Portal Administrador',
      });
      const session: AuthSession = {
        accessToken:  res.access_token,
        refreshToken: res.refresh_token,
        expiresAt:    res.access_expires_at,
        deviceId:     res.device_id,
        user:         res.user,
      };
      saveSession(session);
      onSuccess(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adm-login-page">
      <div className="adm-login-card">
        <div className="adm-login-card-header">
          <div className="adm-login-brand-badge">Sistema Administrativo</div>
          <h1>Panel de Administración</h1>
          <p>Control de Empresas por Rubro</p>
        </div>
        <form className="adm-login-card-body" onSubmit={(e) => void handleSubmit(e)}>
          {error && <div className="adm-login-error">{error}</div>}
          <div className="adm-field">
            <label htmlFor="adm-user">Usuario administrador</label>
            <input
              id="adm-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="usuario"
              required
            />
          </div>
          <div className="adm-field">
            <label htmlFor="adm-pass">Contraseña</label>
            <input
              id="adm-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button className="adm-btn-login" type="submit" disabled={loading}>
            {loading ? 'Verificando...' : 'Ingresar al Panel'}
          </button>
          <div className="adm-login-footer">Acceso exclusivo para administradores del sistema</div>
        </form>
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export function AdminApp() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());

  const isAdmin = useMemo(() => {
    return (session?.user?.role_code ?? '').toUpperCase().includes('ADMIN');
  }, [session?.user?.role_code]);

  async function handleLogout() {
    if (session) {
      try { await logout(session.accessToken); } catch { /* ignore */ }
    }
    clearSession();
    setSession(null);
  }

  if (!session) {
    return <AdminLogin onSuccess={setSession} />;
  }

  if (!isAdmin) {
    return (
      <div className="adm-access-denied">
        <h2>Acceso Denegado</h2>
        <p>Tu usuario no tiene rol de administrador. Contacta al responsable del sistema.</p>
        <button className="adm-btn adm-btn-secondary" type="button" onClick={() => { clearSession(); setSession(null); }}>
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="adm-shell">
      <header className="adm-topbar">
        <div className="adm-topbar-brand">
          <span className="adm-topbar-badge">Admin</span>
          <div>
            <h1>Panel de Administración</h1>
            <p>Sistema de Control de Empresas</p>
          </div>
        </div>
        <div className="adm-topbar-right">
          <div className="adm-topbar-user">
            <strong>{session.user.username}</strong>
            <span>{session.user.role_code}</span>
          </div>
          <button className="adm-btn-logout" type="button" onClick={() => void handleLogout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <nav className="adm-subheader">
        Inicio&nbsp;/&nbsp;<span>Control de Empresas por Rubro</span>
      </nav>

      <main className="adm-content">
        <CompanyControlView accessToken={session.accessToken} />
      </main>
    </div>
  );
}
