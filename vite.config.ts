import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devHost = env.VITE_DEV_HOST || env.VITE_HOST || '127.0.0.1';
  const apiTarget =
    env.VITE_API_TARGET ||
    `http://${env.VITE_HOST || '127.0.0.1'}:${env.VITE_BACKEND_PORT || 8000}`;

  return {
    plugins: [react()],
    server: {
      host: devHost,
      port: Number(env.VITE_PORT || 5173),
      watch: {
        ignored: ['**/scripts/**'],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
