import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const explicitTarget = (process.argv[2] ?? '').trim().toLowerCase();
const envTarget = (process.env.APP_VARIANT ?? '').trim().toLowerCase();
const target = explicitTarget || envTarget || 'app';

const cmd = target === 'admin'
  ? 'npx vite build --config vite.admin.config.ts'
  : 'npx vite build';

try {
  execSync(cmd, { stdio: 'inherit', shell: true });
  if (target === 'admin' && existsSync('dist/admin.html')) {
    copyFileSync('dist/admin.html', 'dist/index.html');
  }
} catch {
  process.exit(1);
}
