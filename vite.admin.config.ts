import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devHost = env.VITE_DEV_HOST || env.VITE_ADMIN_HOST || env.VITE_HOST || '127.0.0.1';
  const apiTarget =
    env.VITE_API_TARGET ||
    `http://${env.VITE_HOST || '127.0.0.1'}:${env.VITE_BACKEND_PORT || 8000}`;

  return {
    plugins: [
      react(),
      {
        name: 'admin-entry-rewrite',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/' || req.url === '') req.url = '/admin.html';
            next();
          });
        },
      },
    ],
    server: {
      host: devHost,
      port: Number(env.VITE_ADMIN_PORT || 5174),
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
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    build: {
      outDir: 'dist-admin',
      emptyOutDir: true,
      rollupOptions: {
        input: 'admin.html',
      },
    },
  };
});
