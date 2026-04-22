import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

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
      host: env.VITE_ADMIN_HOST || env.VITE_HOST || '127.0.0.1',
      port: Number(env.VITE_ADMIN_PORT || 5174),
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
