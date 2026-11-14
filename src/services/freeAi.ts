import { isAbort, ServiceError } from './ai';

/**
 * Free AI services that need NO account and NO API key, called straight from
 * the browser (both allow cross-origin requests). This is the approach of the
 * first LinguaAI, carried over: several models on two services are used in
 * turn, and a busy or failing model is skipped for a while.
 *
 *   1. OVHcloud AI Endpoints – https://endpoints.ai.cloud.ovh.net
 *      anonymous use: 2 requests per minute per model, so the models take turns
 *   2. LLM7.io – https://llm7.io – anonymous use with a daily limit per IP
 *
 * Because every visitor calls these services from their own browser, each
 * visitor has their own free allowance. There is no key to protect, nothing
 * that could be billed, and nothing a visitor could use up for others.
 */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface FreeEndpoint {
  id: 'ovh' | 'llm7';
  label: string;
  url: string;
  models: string[];
  headers: Record<string, string>;
  timeoutMs: number;
  /** anonymous limit: requests per minute and model */
  rpm?: number;
}

export const FREE_ENDPOINTS: FreeEndpoint[] = [
  {
    id: 'ovh',
    label: 'OVHcloud AI Endpoints',
    url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
    // fast multilingual models first; the large reasoning models are accurate but slow (15–30 s) and act as reserve
    models: ['Mistral-Small-3.2-24B-Instruct-2506', 'Meta-Llama-3_3-70B-Instruct', 'Qwen3.5-397B-A17B', 'gpt-oss-120b'],
    headers: {},
    timeoutMs: 40_000,
    rpm: 2,
  },
  {
    id: 'llm7',
    label: 'LLM7.io',
    url: 'https://api.llm7.io/v1/chat/completions',
    models: ['gpt-oss:20b', 'DeepSeek-V4-Flash-0731', 'mistral-Nemo-Instruct-2407'],
    headers: { Authorization: 'Bearer unused' },
    timeoutMs: 30_000,
  },
];

export const FREE_SERVICES_LABEL = 'OVHcloud AI Endpoints & LLM7.io';

type Kind = 'rate' | 'network' | 'model' | 'format';

class RouteError extends Error {
  kind: Kind;
  retryAfter: number;

  constructor(message: string, kind: Kind, retryAfter = 0) {
    super(message);
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

/** which service/model is skipped until when, what worked last, and recent call times per model */
const blockedUntil = new Map<string, number>();
const recentCalls = new Map<string, number[]>();
let lastWorking: string | null = null;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function hasCapacity(endpoint: FreeEndpoint, key: string): boolean {
  if (!endpoint.rpm) return true;
  const now = Date.now();
  const calls = (recentCalls.get(key) ?? []).filter((t) => now - t < 60_000);
  recentCalls.set(key, calls);
  return calls.length < endpoint.rpm;
}

/** Seconds until one of the per-minute-limited models is free again (at most 30). */
function secondsUntilCapacity(): number {
  const now = Date.now();
  let soonest = 30;
  for (const calls of recentCalls.values()) {
    if (calls.length > 0) soonest = Math.min(soonest, Math.max(1, Math.ceil((calls[0] + 60_000 - now) / 1000)));
  }
  return soonest;
}

interface CompletionBody {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string; retry_after?: number } | string;
  message?: string;
}

async function callOnce(endpoint: FreeEndpoint, model: string, messages: ChatTurn[], json: boolean, temperature: number, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), endpoint.timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...endpoint.headers },
      body: JSON.stringify({ model, messages, temperature, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new RouteError(`${endpoint.label}: ${isAbort(err) ? 'timed out' : 'network error'}`, isAbort(err) ? 'model' : 'network');
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let data: CompletionBody = {};
  try {
    data = (await res.json()) as CompletionBody;
  } catch {
    /* not JSON */
  }
  const apiError = typeof data.error === 'string' ? { message: data.error } : data.error;
  const detail = apiError?.message ?? data.message;

  if (res.status === 429 || res.status === 402) {
    const retry = Number((apiError && 'retry_after' in apiError ? apiError.retry_after : undefined) ?? res.headers.get('retry-after') ?? 0);
    throw new RouteError(`${endpoint.label}: ${detail ?? 'rate limit'}`, 'rate', Number.isFinite(retry) ? retry : 0);
  }
  if (res.status === 400 && json && /json|response_format/i.test(detail ?? '')) {
    // this model has no JSON mode: ask again without it (the prompt itself demands JSON)
    return callOnce(endpoint, model, messages, false, temperature, signal);
  }
  if (!res.ok) throw new RouteError(`${endpoint.label}: ${detail ?? `HTTP ${res.status}`}`, 'model');

  // reasoning models may wrap their thinking in <think> tags
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new RouteError(`${endpoint.label}: empty response`, 'format');
  return text;
}

export interface FreeChatResult {
  text: string;
  /** e.g. “OVHcloud AI Endpoints · Mistral-Small-3.2-24B-Instruct-2506” */
  model: string;
}

/**
 * Sends a chat to the first free model that has capacity. Throws a
 * ServiceError written for the learner when none can answer.
 */
export async function freeChat(messages: ChatTurn[], options: { json?: boolean; temperature?: number; signal?: AbortSignal } = {}): Promise<FreeChatResult> {
  const routes: { endpoint: FreeEndpoint; model: string; key: string }[] = [];
  for (const endpoint of FREE_ENDPOINTS) {
    for (const model of endpoint.models) routes.push({ endpoint, model, key: `${endpoint.id}|${model}` });
  }
  // the combination that worked last goes first
  if (lastWorking) routes.sort((a, b) => Number(b.key === lastWorking) - Number(a.key === lastWorking));

  let lastError: RouteError | null = null;

  // two passes: if every model is merely at its per-minute limit, wait briefly and go round once more
  for (let pass = 0; pass < 2; pass += 1) {
    let waitingForCapacity = false;
    for (const { endpoint, model, key } of routes) {
      if ((blockedUntil.get(key) ?? 0) > Date.now()) continue;
      if (!hasCapacity(endpoint, key)) {
        waitingForCapacity = true;
        continue;
      }
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        try {
          recentCalls.set(key, [...(recentCalls.get(key) ?? []), Date.now()]);
          const text = await callOnce(endpoint, model, messages, Boolean(options.json), options.temperature ?? 0.7, options.signal);
          lastWorking = key;
          return { text, model: `${endpoint.label} · ${model}` };
        } catch (err) {
          if (isAbort(err)) throw err;
          const error = err instanceof RouteError ? err : new RouteError(String(err), 'model');
          lastError = error;
          if (error.kind === 'rate' && attempt === 0 && error.retryAfter > 0 && error.retryAfter <= 12) {
            await sleep(error.retryAfter * 1000, options.signal);
            continue;
          }
          // a network error is not about one model: do not block it, or “Try again” would fail too
          if (error.kind === 'network') break;
          const pause = error.kind === 'rate' ? Math.min(Math.max(error.retryAfter, 60), 24 * 3600) * 1000 : error.kind === 'model' ? 10 * 60_000 : 30_000;
          blockedUntil.set(key, Date.now() + pause);
          break;
        }
      }
    }
    if (!waitingForCapacity || pass === 1) break;
    await sleep(Math.min(secondsUntilCapacity(), 20) * 1000, options.signal);
  }

  const kind = lastError?.kind ?? 'rate';
  if (kind === 'network') {
    throw new ServiceError('The free AI services could not be reached. Check your internet connection and try again.', 'free_network');
  }
  // when is the first model usable again: its per-minute window or its temporary block, whichever applies
  const now = Date.now();
  const blocks = routes.map((r) => blockedUntil.get(r.key) ?? 0).filter((t) => t > now);
  const unblocked = blocks.length === routes.length ? Math.ceil((Math.min(...blocks) - now) / 1000) : 0;
  const wait = Math.min(120, Math.max(5, unblocked, blocks.length === routes.length ? 0 : secondsUntilCapacity()));
  throw new ServiceError(
    `The free AI services are busy: without an account they allow only a few requests per minute. Try again in about ${wait} seconds.`,
    'free_busy',
    wait,
  );
}
