import { TutorError } from '../errors.mjs';
import { nextQuotaReset } from '../usage.mjs';

/**
 * Google Gemini through the official Generative Language REST API.
 * Docs: https://ai.google.dev/api/generate-content
 *
 * Model choice: Gemini model names change several times a year and old ones
 * are shut down. Unless GEMINI_MODEL pins one, the adapter asks the API which
 * models the key can use and takes the newest stable Flash-Lite model first:
 * on the free tier it has by far the largest quota (developers report roughly
 * 15 requests/minute and 500/day, against 5/minute and 20/day for Flash).
 * The newest Flash is the second choice when Flash-Lite is busy or used up.
 * Each model has its own quota, so falling back really does help.
 */

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
const ALIASES = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
const LIST_TTL = 60 * 60 * 1000;
const SKIP_TTL = 10 * 60 * 1000;
const TIMEOUT = 30_000;
/** Only these model families have a free tier; anything else (Pro, Argon …) is refused unless explicitly allowed. */
const FREE_FAMILY = /^gemini-[\w.-]*flash[\w.-]*$|^gemini-flash[\w.-]*$|^gemma-[\w.-]+$/;

const quotaMessage = 'Today’s free Gemini quota is used up. The tutor is available again after the daily reset (midnight Pacific Time).';

/** @param {{ apiKey: string, model?: string, baseUrl?: string, allowAnyModel?: boolean }} options */
export function createGemini(options) {
  const apiKey = options.apiKey.trim();
  const pinned = (options.model ?? '').trim().replace(/^models\//, '');
  const base = (options.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');

  /** @type {{ at: number, models: string[] } | null} */
  let listed = null;
  /** model → time until which it is skipped (not found, or over its quota) */
  const skipped = new Map();
  let lastUsed = pinned || '';
  /** set when every model reported its daily quota as used up: no further calls until then */
  let exhaustedUntil = 0;
  /** result of the last key check, see verify() */
  let health = { at: 0, problem: null };

  const pinnedProblem =
    pinned && !options.allowAnyModel && !FREE_FAMILY.test(pinned)
      ? new TutorError(
          'paid_model',
          `GEMINI_MODEL is set to “${pinned}”, which is not one of Gemini’s free-tier model families (Flash, Flash-Lite, Gemma). LinguaAI refuses it so that no paid calls can happen. Remove GEMINI_MODEL from .env.`,
          { status: 503 },
        )
      : null;

  async function request(path, init) {
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError') {
        throw new TutorError('timeout', 'Gemini took too long to answer. Try again in a moment.', { status: 504 });
      }
      throw new TutorError('upstream_unreachable', 'The server could not reach the Gemini API. Check the server’s internet connection.', { status: 502 });
    }
  }

  /** Newest stable Flash-Lite, newest Flash, then the previous Flash-Lite. */
  async function discover() {
    if (listed && Date.now() - listed.at < LIST_TTL) return listed.models;
    let models = ALIASES;
    try {
      const res = await request('/v1beta/models?pageSize=1000', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        const flash = [];
        const lite = [];
        for (const m of Array.isArray(data.models) ? data.models : []) {
          const match = /^models\/(gemini-(\d+(?:\.\d+)?)-flash(-lite)?)$/.exec(String(m.name));
          if (!match) continue;
          if (!Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes('generateContent')) continue;
          (match[3] ? lite : flash).push({ id: match[1], version: Number(match[2]) });
        }
        const byVersion = (a, b) => b.version - a.version;
        flash.sort(byVersion);
        lite.sort(byVersion);
        const picked = [lite[0], flash[0], lite[1]].filter(Boolean).map((m) => m.id);
        if (picked.length > 0) models = picked;
      } else if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw await toError(res, '');
      }
    } catch (err) {
      if (err instanceof TutorError && (err.code === 'bad_key' || err.code === 'region')) throw err;
      // listing is best effort – the aliases below still work for most keys
    }
    listed = { at: Date.now(), models };
    return models;
  }

  async function candidates() {
    const auto = await discover();
    const all = pinned ? [pinned, ...auto.filter((m) => m !== pinned)] : auto;
    const now = Date.now();
    const usable = all.filter((m) => (skipped.get(m) ?? 0) < now);
    return usable.length > 0 ? usable : all;
  }

  /**
   * @param {{ system: string, messages: { role: 'user' | 'assistant', text: string }[], json?: boolean, temperature?: number }} input
   * @returns {Promise<{ text: string, model: string }>}
   */
  async function generate(input) {
    if (pinnedProblem) throw pinnedProblem;
    if (exhaustedUntil > Date.now()) throw new TutorError('quota_exhausted', quotaMessage, { status: 429, resetAt: exhaustedUntil });
    const contents = toContents(input.messages);
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: 2048,
        ...(input.json ? { responseMimeType: 'application/json' } : {}),
      },
    });

    /** @type {TutorError | null} */
    let firstError = null;
    /** @type {TutorError[]} */
    const errors = [];
    const models = (await candidates()).slice(0, 3);
    for (const model of models) {
      const res = await request(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body });
      if (res.ok) {
        const data = await res.json();
        lastUsed = model;
        return { text: readText(data), model };
      }
      const error = await toError(res, model);
      firstError ??= error;
      errors.push(error);
      if (error.code === 'model_unavailable') skipped.set(model, Date.now() + SKIP_TTL);
      if (error.code === 'quota_exhausted') skipped.set(model, Date.now() + 6 * SKIP_TTL);
      if (error.code === 'rate_limited' && models.length > 1) skipped.set(model, Date.now() + (error.retryAfter ?? 30) * 1000);
      // these are per-model problems, so the next model may well succeed
      if (!['model_unavailable', 'rate_limited', 'quota_exhausted', 'overloaded'].includes(error.code)) throw error;
    }
    if (errors.length > 0 && errors.every((e) => e.code === 'quota_exhausted')) {
      exhaustedUntil = nextQuotaReset();
      throw new TutorError('quota_exhausted', quotaMessage, { status: 429, resetAt: exhaustedUntil });
    }
    // prefer the error the learner can act on soonest
    throw errors.find((e) => e.code === 'rate_limited') ?? firstError ?? new TutorError('model_unavailable', 'No Gemini model is available for this API key right now.');
  }

  /** Checks the key without spending generation quota (listing models is free). Cached for ten minutes. */
  async function verify() {
    if (pinnedProblem) return { ok: false, code: pinnedProblem.code, message: pinnedProblem.message };
    if (Date.now() - health.at > SKIP_TTL) {
      let problem = null;
      try {
        listed = null;
        await discover();
      } catch (err) {
        problem = err instanceof TutorError ? { code: err.code, message: err.message } : null;
      }
      health = { at: Date.now(), problem };
    }
    return health.problem ? { ok: false, ...health.problem } : { ok: true };
  }

  return {
    id: 'gemini',
    label: 'Google Gemini',
    get model() {
      return lastUsed;
    },
    get pausedUntil() {
      return exhaustedUntil > Date.now() ? exhaustedUntil : null;
    },
    generate,
    verify,
  };
}

/** Gemini wants alternating turns that start with the user. */
function toContents(messages) {
  const contents = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${m.text}`;
    else contents.push({ role, parts: [{ text: m.text }] });
  }
  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '(The learner has joined.)' }] });
  }
  return contents;
}

function readText(data) {
  if (data?.promptFeedback?.blockReason) {
    throw new TutorError('blocked', 'Gemini declined to answer this message because of its safety rules. Try phrasing it differently.', { status: 422 });
  }
  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) {
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
      throw new TutorError('blocked', 'Gemini declined to answer this message because of its safety rules. Try phrasing it differently.', { status: 422 });
    }
    throw new TutorError('bad_response', 'Gemini sent an empty answer. Try again.');
  }
  return text;
}

/** Maps a failed Gemini response onto LinguaAI's error codes. */
async function toError(res, model) {
  let error = {};
  try {
    error = (await res.json())?.error ?? {};
  } catch {
    /* not JSON */
  }
  const status = String(error.status ?? '');
  const message = String(error.message ?? '');
  const details = Array.isArray(error.details) ? error.details : [];

  if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
    const retry = details.find((d) => String(d['@type'] ?? '').endsWith('RetryInfo'));
    const seconds = retry ? Math.ceil(parseFloat(String(retry.retryDelay ?? '0'))) : 0;
    const perDay =
      /per ?day|daily/i.test(message) ||
      details.some((d) => Array.isArray(d.violations) && d.violations.some((v) => /PerDay/i.test(String(v.quotaId ?? ''))));
    if (perDay) {
      return new TutorError('quota_exhausted', quotaMessage, { status: 429, resetAt: nextQuotaReset() });
    }
    const wait = seconds > 0 && seconds < 600 ? seconds : 30;
    return new TutorError('rate_limited', `The free Gemini limit of requests per minute was reached. Try again in about ${wait} seconds.`, {
      status: 429,
      retryAfter: wait,
    });
  }
  if (res.status === 404 || status === 'NOT_FOUND') {
    return new TutorError('model_unavailable', `The Gemini model “${model}” is not available for this API key. Remove GEMINI_MODEL from .env to let LinguaAI choose one.`, { status: 502 });
  }
  if (res.status === 503 || res.status === 500 || status === 'UNAVAILABLE' || status === 'INTERNAL') {
    return new TutorError('overloaded', 'Gemini is overloaded at the moment. Try again in a few seconds.', { status: 503, retryAfter: 5 });
  }
  if (res.status === 401 || res.status === 403 || /API key not valid|API_KEY_INVALID/i.test(message) || details.some((d) => d.reason === 'API_KEY_INVALID')) {
    return new TutorError('bad_key', 'Gemini rejected the API key. Check GEMINI_API_KEY in .env (create a key at aistudio.google.com/apikey) and restart the server.', { status: 502 });
  }
  if (/location is not supported/i.test(message)) {
    return new TutorError('region', 'Gemini’s free API is not offered in the country this server runs in.', { status: 502 });
  }
  return new TutorError('upstream', `Gemini answered with an error (HTTP ${res.status}). ${message.slice(0, 160)}`.trim(), { status: 502 });
}
