import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';

const targetDir = path.resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '0.0.0.0';

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function cacheControlFor(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.endsWith('/index.html') || normalized.endsWith('/version.json')) {
    return 'no-store, no-cache, must-revalidate';
  }

  const fileName = path.basename(normalized);
  const hasHash = /-[A-Za-z0-9_-]{8,}\./.test(fileName);
  if (normalized.includes('/assets/') && hasHash) {
    return 'public, max-age=31536000, immutable';
  }

  return 'public, max-age=300';
}

function safeResolve(requestPath) {
  const withoutQuery = requestPath.split('?')[0];
  const decoded = decodeURIComponent(withoutQuery || '/');
  const relative = decoded === '/' ? '/index.html' : decoded;
  const fullPath = path.resolve(targetDir, `.${relative}`);
  if (!fullPath.startsWith(targetDir)) {
    return null;
  }
  return fullPath;
}

const server = http.createServer((req, res) => {
  const resolved = safeResolve(req.url ?? '/');
  if (!resolved) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }

  let filePath = resolved;
  if (!existsSync(filePath) || (existsSync(filePath) && statSync(filePath).isDirectory())) {
    filePath = path.join(targetDir, 'index.html');
  }

  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeByExt[ext] ?? 'application/octet-stream';
  const body = readFileSync(filePath);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', cacheControlFor(filePath));
  res.statusCode = 200;
  res.end(body);
});

server.listen(port, host, () => {
  console.log(`Serving ${targetDir} on http://${host}:${port}`);
});