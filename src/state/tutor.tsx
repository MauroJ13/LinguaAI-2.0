import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchStatus, INITIAL_STATUS, isAbort, type TutorStatus } from '../services/ai';

interface TutorState {
  status: TutorStatus;
  /** the first check has finished – from then on an AI engine is always chosen */
  known: boolean;
  /** LinguaAI's own server has a working AI provider (Gemini) right now; otherwise the free keyless services answer */
  server: boolean;
  /** ask the server again (after editing .env, or after an error) */
  refresh: () => Promise<TutorStatus>;
}

const TutorContext = createContext<TutorState | null>(null);

/** Knows which AI engine is in use: the optional Gemini server behind /api, or the free keyless services. Asked once at start and on demand. */
export function TutorProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TutorStatus>(INITIAL_STATUS);

  const refresh = useCallback(async () => {
    const next = await fetchStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatus(controller.signal)
      .then(setStatus)
      .catch((err: unknown) => {
        if (!isAbort(err)) setStatus({ state: 'unreachable', label: null, model: null, problem: null, pausedUntil: null });
      });
    return () => controller.abort();
  }, []);

  const value = useMemo<TutorState>(
    () => ({
      status,
      known: status.state !== 'checking',
      server: status.state === 'ready' && !(status.pausedUntil && status.pausedUntil > Date.now()),
      refresh,
    }),
    [status, refresh],
  );
  return <TutorContext.Provider value={value}>{children}</TutorContext.Provider>;
}

export function useTutor(): TutorState {
  const value = useContext(TutorContext);
  if (!value) throw new Error('useTutor must be used inside <TutorProvider>');
  return value;
}
