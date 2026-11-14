import { TutorError, notConfigured } from './errors.mjs';
import { resolveProvider } from './providers/index.mjs';
import { createUsage, limitsFromEnv } from './usage.mjs';
import { LEVEL_IDS, correctionPrompt, feedbackReminder, normalizeFeedback, parseJson, replyPrompt, translatePrompt, turnPrompt } from '../shared/prompts.mjs';

/**
 * LinguaAI's whole backend API, independent of any web framework.
 *
 *   GET  /api/status → { configured, provider, label, model }
 *   POST /api/tutor  → body { task: 'reply' | 'turn' | 'correct' | 'translate', ... }
 *
 * The browser never sees an API key or a prompt: it sends the conversation and
 * the learner's settings, the server builds the prompt and calls the provider.
 * Used by the Vite dev server (vite-plugin.mjs), the Node server (standalone.mjs)
 * and the serverless wrappers in /api.
 */

const MAX_TEXT = 2000;
const MAX_HISTORY = 24;

/** one set of counters per server process (see usage.mjs) */
let usage = createUsage();

/** Lets the Node server keep the daily counters in a file so restarts do not reset them. */
export function persistUsage(file) {
  usage = createUsage({ file });
}

const bad = (message) => new TutorError('bad_request', message, { status: 400 });

function languageName(value, field) {
  if (typeof value !== 'string' || !/^[\p{L}][\p{L} ()'-]{1,39}$/u.test(value.trim())) throw bad(`"${field}" must be a language name.`);
  return value.trim();
}

function plainText(value, field, max = MAX_TEXT) {
  if (typeof value !== 'string' || !value.trim()) throw bad(`"${field}" must be a non-empty string.`);
  if (value.length > max) throw new TutorError('too_long', `That message is too long. Keep it under ${max} characters.`, { status: 413 });
  return value.trim();
}

function context(body) {
  if (!LEVEL_IDS.includes(body.level)) throw bad('"level" must be one of A1–C2.');
  const scenario = body.scenario && typeof body.scenario === 'object' ? body.scenario : {};
  return {
    language: languageName(body.language, 'language'),
    native: languageName(body.native, 'native'),
    level: body.level,
    spoken: body.spoken === true,
    scenario: {
      title: typeof scenario.title === 'string' ? scenario.title.slice(0, 80) : 'Free conversation',
      brief: typeof scenario.brief === 'string' ? scenario.brief.slice(0, 400) : 'Have a relaxed, open conversation.',
    },
  };
}

function history(body) {
  if (!Array.isArray(body.history)) throw bad('"history" must be an array.');
  return body.history
    .slice(-MAX_HISTORY)
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text.trim().slice(0, MAX_TEXT) }));
}

async function runTask(provider, body) {
  switch (body.task) {
    case 'reply': {
      const ctx = context(body);
      const out = await provider.generate({ system: replyPrompt(ctx), messages: history(body), temperature: 0.8 });
      return { text: out.text, model: out.model };
    }
    case 'turn': {
      const ctx = context(body);
      const messages = history(body);
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'user') throw bad('The last history entry must be the learner’s message.');
      const prompted = [...messages.slice(0, -1), { ...last, text: last.text + feedbackReminder(ctx, true) }];
      const out = await provider.generate({ system: turnPrompt(ctx), messages: prompted, json: true, temperature: 0.6 });
      const data = parseJson(out.text);
      const reply = data && typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) throw new TutorError('bad_response', 'The AI tutor sent an answer LinguaAI could not read. Try again.');
      return { reply, feedback: normalizeFeedback(data.feedback, last.text, ctx.level), model: out.model };
    }
    case 'correct': {
      const ctx = context(body);
      const text = plainText(body.text, 'text');
      const out = await provider.generate({ system: correctionPrompt(ctx), messages: [{ role: 'user', text: text + feedbackReminder(ctx, false) }], json: true, temperature: 0.1 });
      const data = parseJson(out.text);
      if (!data) throw new TutorError('bad_response', 'The AI tutor sent an answer LinguaAI could not read. Try again.');
      return { feedback: normalizeFeedback(data, text, ctx.level), model: out.model };
    }
    case 'translate': {
      const text = plainText(body.text, 'text');
      const out = await provider.generate({
        system: translatePrompt(languageName(body.from, 'from'), languageName(body.to, 'to')),
        messages: [{ role: 'user', text }],
        temperature: 0.2,
      });
      return { text: out.text, model: out.model };
    }
    default:
      throw bad('Unknown task.');
  }
}

/** Browsers send Origin on cross-site POSTs: only this site's own pages (or ALLOWED_ORIGINS) may use the tutor. */
function sameSite(req, env) {
  if (!req.origin) return true;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (allowed.includes(req.origin.replace(/\/+$/, ''))) return true;
  try {
    return Boolean(req.host) && new URL(req.origin).host === req.host;
  } catch {
    return false;
  }
}

/**
 * @param {{ method: string, path: string, body?: unknown, ip?: string, origin?: string, host?: string }} req
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{ status: number, body: unknown, headers?: Record<string, string> }>}
 */
export async function handleApi(req, env) {
  try {
    const { id, provider, known } = resolveProvider(env);
    const limits = limitsFromEnv(env);

    if (req.path === '/api/status') {
      if (req.method !== 'GET') throw new TutorError('method', 'Use GET.', { status: 405 });
      const health = provider ? await provider.verify() : null;
      const site = usage.snapshot(limits);
      const sitePaused = site.usedToday >= site.sitePerDay ? site.resetAt : null;
      return {
        status: 200,
        body: {
          configured: Boolean(provider),
          healthy: health ? health.ok : false,
          provider: id,
          label: provider?.label ?? null,
          model: provider?.model || null,
          problem: !known ? `AI_PROVIDER "${id}" is not supported by this server.` : health && !health.ok ? health.message : null,
          pausedUntil: provider?.pausedUntil ?? sitePaused,
        },
      };
    }

    if (req.path === '/api/tutor') {
      if (req.method !== 'POST') throw new TutorError('method', 'Use POST.', { status: 405 });
      if (!sameSite(req, env)) throw new TutorError('forbidden', 'This API only answers requests from the LinguaAI app itself.', { status: 403 });
      if (!provider) throw notConfigured();
      if (!req.body || typeof req.body !== 'object') throw bad('Send a JSON body.');
      usage.spend(req.ip ?? 'local', limits);
      return { status: 200, body: await runTask(provider, req.body) };
    }

    throw new TutorError('not_found', 'Unknown API route.', { status: 404 });
  } catch (err) {
    if (err instanceof TutorError) {
      return {
        status: err.status,
        headers: err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : undefined,
        body: { error: { code: err.code, message: err.message, retryAfter: err.retryAfter ?? null, resetAt: err.resetAt ?? null } },
      };
    }
    console.error('[linguaai] unexpected API error:', err);
    return { status: 500, body: { error: { code: 'server', message: 'The LinguaAI server ran into an unexpected error. Check its console output.', retryAfter: null, resetAt: null } } };
  }
}

/** Adapter for Node's http module (used by Vite's dev server and standalone.mjs). */
export async function handleNodeRequest(req, res, env) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let body;
  if (req.method === 'POST') {
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'bad_request', message: 'Send JSON.', retryAfter: null, resetAt: null } }));
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 200_000) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'too_long', message: 'The request is too large.', retryAfter: null } }));
        return;
      }
      chunks.push(chunk);
    }
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      body = null;
    }
  }
  const forwarded = env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  const result = await handleApi(
    {
      method: req.method ?? 'GET',
      path: url.pathname,
      body,
      ip: forwarded || req.socket?.remoteAddress || 'local',
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      host: String(req.headers['x-forwarded-host'] ?? req.headers.host ?? ''),
    },
    env,
  );
  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(result.headers ?? {}) });
  res.end(JSON.stringify(result.body));
}
