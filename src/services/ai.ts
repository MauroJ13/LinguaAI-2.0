/**
 * Browser-side client for LinguaAI's own backend (/api/*).
 *
 * The app never talks to an AI provider directly and never holds an API key.
 * Which provider and model answer is decided on the server (see /server), so
 * it can change without touching or rebuilding this code.
 */

export class ServiceError extends Error {
  code: string;
  /** seconds until a retry makes sense, when the server knows */
  retryAfter?: number;
  /** timestamp (ms) at which a daily quota resets */
  resetAt?: number;

  constructor(message: string, code = 'error', retryAfter?: number, resetAt?: number) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.retryAfter = retryAfter;
    this.resetAt = resetAt;
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export interface TutorStatus {
  /**
   * checking: first request still running · ready: the AI answers ·
   * unconfigured: the server has no key · problem: the key or model is rejected ·
   * unreachable: there is no LinguaAI server behind this page
   */
  state: 'checking' | 'ready' | 'unconfigured' | 'problem' | 'unreachable';
  label: string | null;
  model: string | null;
  problem: string | null;
  /** timestamp (ms) until which today's free quota is used up */
  pausedUntil: number | null;
}

export const INITIAL_STATUS: TutorStatus = { state: 'checking', label: null, model: null, problem: null, pausedUntil: null };

interface StatusResponse {
  configured?: boolean;
  healthy?: boolean;
  label?: string | null;
  model?: string | null;
  problem?: string | null;
  pausedUntil?: number | null;
}

interface ErrorResponse {
  error?: { code?: string; message?: string; retryAfter?: number | null; resetAt?: number | null };
}

/** “14:30” today, or “tomorrow at 09:00”, in the visitor's own time zone. */
export function formatReset(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString() ? `at ${time}` : `tomorrow at ${time}`;
}

const NO_SERVER =
  'LinguaAI’s server did not answer. Start the app with “npm run dev” (or “npm start” for the built version) – opening the built files on their own does not include the AI tutor.';

async function readJson(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new ServiceError(NO_SERVER, 'server_unreachable');
  try {
    return await res.json();
  } catch {
    throw new ServiceError(NO_SERVER, 'server_unreachable');
  }
}

export async function fetchStatus(signal?: AbortSignal): Promise<TutorStatus> {
  try {
    const res = await fetch('/api/status', { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ServiceError(NO_SERVER, 'server_unreachable');
    const data = (await readJson(res)) as StatusResponse;
    return {
      state: !data.configured ? 'unconfigured' : data.healthy === false ? 'problem' : 'ready',
      label: data.label ?? null,
      model: data.model ?? null,
      problem: data.problem ?? null,
      pausedUntil: typeof data.pausedUntil === 'number' ? data.pausedUntil : null,
    };
  } catch (err) {
    if (isAbort(err)) throw err;
    return { state: 'unreachable', label: null, model: null, problem: NO_SERVER, pausedUntil: null };
  }
}

/** POST /api/tutor. Throws ServiceError with the server's code and learner-facing message. */
export async function callTutor<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ServiceError(NO_SERVER, 'server_unreachable');
  }
  const data = await readJson(res);
  if (!res.ok) {
    const error = (data as ErrorResponse).error ?? {};
    throw new ServiceError(
      error.message ?? `The server answered with an error (HTTP ${res.status}).`,
      error.code ?? 'server',
      typeof error.retryAfter === 'number' ? error.retryAfter : undefined,
      typeof error.resetAt === 'number' ? error.resetAt : undefined,
    );
  }
  return data as T;
}
