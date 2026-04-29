import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';

const explicitTarget = (process.argv[2] ?? '').trim().toLowerCase();
const envTarget = (process.env.APP_VARIANT ?? '').trim().toLowerCase();
const target = explicitTarget || envTarget || 'app';

const cmd = target === 'admin'
  ? 'npx vite build --config vite.admin.config.ts'
  : 'npx vite build';

try {
  // Always clean outputs first to avoid stale files between Railway builds.
  rmSync('dist', { recursive: true, force: true });
  if (target === 'admin') {
    rmSync('dist-admin', { recursive: true, force: true });
  }

  execSync(cmd, { stdio: 'inherit', shell: true });
  if (target === 'admin') {
    if (existsSync('dist-admin/admin.html')) {
      copyFileSync('dist-admin/admin.html', 'dist-admin/index.html');
    }
  }

  const metadata = {
    target,
    built_at_utc: new Date().toISOString(),
    git_sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
    git_ref: process.env.RAILWAY_GIT_BRANCH ?? process.env.GITHUB_REF_NAME ?? null,
  };

  const outputDir = target === 'admin' ? 'dist-admin' : 'dist';
  if (existsSync(outputDir)) {
    writeFileSync(`${outputDir}/version.json`, JSON.stringify(metadata, null, 2));
  }
  if (existsSync('dist')) {
    writeFileSync('dist/version.json', JSON.stringify(metadata, null, 2));
  }
} catch {
  process.exit(1);
}
