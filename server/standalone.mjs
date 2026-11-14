import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
import { handleNodeRequest, persistUsage } from './api.mjs';

/**
 * Production server without dependencies: serves the built app from /dist and
 * the API under /api. Run `npm run build` first, then `npm start`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv(root);
const dist = path.resolve(root, env.STATIC_DIR || 'dist');
const port = Number(env.PORT) || 8787;
persistUsage(path.join(root, '.linguaai-usage.json'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleNodeRequest(req, res, env).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    return;
  }
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Run "npm run build" first.');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, env.HOST || '0.0.0.0', () => {
  console.log(`LinguaAI running at http://localhost:${port}`);
  if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) console.log('No GEMINI_API_KEY set – the AI tutor is switched off.');
});
