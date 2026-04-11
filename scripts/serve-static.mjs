import { spawn } from 'node:child_process';

const targetDir = process.argv[2] ?? 'dist';
const port = process.env.PORT ?? '3000';
const host = process.env.HOST ?? '0.0.0.0';

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['serve', '-s', targetDir, '-l', `tcp://${host}:${port}`],
  {
    stdio: 'inherit',
    shell: false,
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});