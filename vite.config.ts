import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devHost = env.VITE_DEV_HOST || env.VITE_HOST || '127.0.0.1';
  const apiTarget =
    env.VITE_API_TARGET ||
    `http://${env.VITE_HOST || '127.0.0.1'}:${env.VITE_BACKEND_PORT || 8000}`;

  return {
    cacheDir: 'node_modules/.vite/frontend',
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Vendor: React core — cached forever, never changes with app updates
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
              return 'vendor-react';
            }
            // Vendor: everything else in node_modules
            if (id.includes('/node_modules/')) {
              return 'vendor';
            }

            // Keep strongly coupled feature pairs in the same chunk to avoid
            // circular-chunk overhead between lazy bundles.
            if (id.includes('/modules/cash/') || id.includes('/modules/appcfg/')) {
              return 'mod-core-ops';
            }
            if (id.includes('/modules/sales/') || id.includes('/modules/restaurant/')) {
              return 'mod-pos';
            }

            // One chunk per feature module — loads only when that module is first opened
            const featureModules = [
              'purchases', 'inventory', 'products',
              'customers', 'reports', 'masters', 'company',
            ];
            for (const mod of featureModules) {
              if (id.includes(`/modules/${mod}/`)) {
                return `mod-${mod}`;
              }
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
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
