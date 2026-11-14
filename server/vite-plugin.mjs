import { loadEnv } from './env.mjs';
import path from 'node:path';
import { handleNodeRequest, persistUsage } from './api.mjs';

/**
 * Serves /api/* from inside Vite's own dev and preview servers, so
 * `npm run dev` starts the app and its backend with one command.
 * Keys are read on the server from .env and never reach the browser bundle
 * (only variables prefixed VITE_ are ever exposed to client code, and this
 * project defines none).
 */
export function linguaApi() {
  const mount = (server) => {
    const env = loadEnv(server.config.root);
    persistUsage(path.join(server.config.root, '.linguaai-usage.json'));
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      server.config.logger.warn(
        '\n  LinguaAI: no GEMINI_API_KEY found in .env – the AI tutor is switched off.\n  Copy .env.example to .env, add a free key from https://aistudio.google.com/apikey and restart.\n',
      );
    }
    server.middlewares.use((req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/')) return next();
      handleNodeRequest(req, res, env).catch(next);
    });
  };
  return { name: 'linguaai-api', configureServer: mount, configurePreviewServer: mount };
}
