import { createGemini } from './gemini.mjs';

/**
 * Provider registry.
 *
 * A provider is an object with:
 *   id: string, label: string, model: string (last model used)
 *   generate({ system, messages: [{ role: 'user' | 'assistant', text }], json?, temperature? })
 *     → Promise<{ text, model }>, throwing TutorError (see ../errors.mjs) on failure
 *   verify() → Promise<{ ok: true } | { ok: false, code, message }>   (must not spend quota)
 *   pausedUntil: number | null   (timestamp while a daily quota is exhausted)
 *
 * Included: "gemini" (optional, needs a key). Without it the app uses the keyless
 * services directly from the browser (src/services/freeAi.ts) and never calls this server.
 * To add OpenAI or Anthropic later:
 *   1. create providers/openai.mjs (or anthropic.mjs) exporting a factory with that shape,
 *   2. add one entry to FACTORIES below,
 *   3. set AI_PROVIDER and the key in .env.
 * Nothing in the React app changes – it only ever talks to /api/tutor.
 */
const FACTORIES = {
  gemini: (env) =>
    env.GEMINI_API_KEY
      ? createGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, baseUrl: env.GEMINI_API_BASE, allowAnyModel: env.ALLOW_ANY_MODEL === 'true' })
      : null,
};

/** key → provider instance, so model discovery is cached between requests */
const cache = new Map();

/** @param {Record<string, string | undefined>} env */
export function resolveProvider(env) {
  const id = (env.AI_PROVIDER ?? 'gemini').trim().toLowerCase() || 'gemini';
  const factory = FACTORIES[id];
  if (!factory) return { id, provider: null, known: false };
  const key = `${id}:${env.GEMINI_API_KEY ?? ''}:${env.GEMINI_MODEL ?? ''}:${env.GEMINI_API_BASE ?? ''}:${env.ALLOW_ANY_MODEL ?? ''}`;
  if (!cache.has(key)) cache.set(key, factory(env));
  return { id, provider: cache.get(key), known: true };
}
