import { useState } from 'react';
import type { LoginPayload } from '../types';

type LoginFormProps = {
  onSubmit: (payload: LoginPayload) => Promise<void>;
  isLoading: boolean;
};

export function LoginForm({ onSubmit, isLoading }: LoginFormProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin123*');
  const [deviceId, setDeviceId] = useState('CAJA-001');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="auth-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({
          username,
          password,
          device_id: deviceId,
        });
      }}
    >
      <label>
        Usuario
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>

      <label>
        Password
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ flex: 1, paddingRight: '2.2rem' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={{
              position: 'absolute',
              right: '0.4rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.2rem',
              lineHeight: 1,
              fontSize: '1rem',
              color: '#666',
            }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </label>

      <label>
        Device ID
        <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required />
      </label>

      <button disabled={isLoading} type="submit">
        {isLoading ? 'Ingresando...' : 'Iniciar sesion'}
      </button>
    </form>
  );
}
