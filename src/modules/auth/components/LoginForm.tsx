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
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
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
