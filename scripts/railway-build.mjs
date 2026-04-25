import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, rmSync } from 'node:fs';

const explicitTarget = (process.argv[2] ?? '').trim().toLowerCase();
const envTarget = (process.env.APP_VARIANT ?? '').trim().toLowerCase();
const target = explicitTarget || envTarget || 'app';

const cmd = target === 'admin'
  ? 'npx vite build --config vite.admin.config.ts'
  : 'npx vite build';

try {
  execSync(cmd, { stdio: 'inherit', shell: true });
  if (target === 'admin') {
    if (existsSync('dist-admin/admin.html')) {
      copyFileSync('dist-admin/admin.html', 'dist-admin/index.html');
    }

    // Railpack static deployments expect /app/dist; mirror admin build output.
    if (existsSync('dist-admin')) {
      rmSync('dist', { recursive: true, force: true });
      cpSync('dist-admin', 'dist', { recursive: true });
    }
  }
} catch {
  process.exit(1);
}
