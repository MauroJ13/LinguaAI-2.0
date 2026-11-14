import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, Conversation } from '../types';
import { getLanguage } from '../data/languages';
import { getScenario } from '../data/scenarios';
import { errorText, isAbort, ServiceError } from '../services/ai';
import { aiReply, correctMessage, type TutorContext } from '../services/tutor';
import { uid } from './util';
import { useStore } from '../state/store';
import { useTutor } from '../state/tutor';

export interface TurnError {
  message: string;
  code: string;
  /** timestamp from which a retry makes sense (short rate limits) */
  retryAt: number | null;
  /** timestamp at which a daily quota resets */
  resetAt: number | null;
}

interface Options {
  /** Live Speaking: messages are transcribed speech and always get feedback */
  voice?: boolean;
  /** false pauses the tutor (no reply is requested) – e.g. before a speaking session starts */
  active?: boolean;
  /** called once for every new tutor message, e.g. to read it aloud */
  onTutorMessage?: (message: ChatMessage) => void;
}

/**
 * The one conversation engine behind both AI Chat and Live Speaking.
 * Whenever the learner spoke last (or nobody has spoken yet) it asks the AI
 * tutor for the next line and attaches the feedback on the learner's message.
 * There is no simulated tutor: if no AI engine can answer, `error` says why.
 */
export function useConversation(conversation: Conversation, options: Options = {}) {
  const { data, native, addMessage, patchMessage, bump } = useStore();
  const { status, known, server, refresh } = useTutor();
  const lang = getLanguage(conversation.lang);
  const scenario = getScenario(conversation.scenarioId);
  const voice = options.voice === true;
  const wantFeedback = voice || data.settings.autoCorrect;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TurnError | null>(null);
  const [checking, setChecking] = useState<Set<string>>(() => new Set());

  const ctx: TutorContext = useMemo(
    () => ({ server, lang, native, level: conversation.level, scenario }),
    [server, lang, native, conversation.level, scenario],
  );

  // the latest values, for callbacks that outlive a render
  const live = useRef({ ctx, conversation, wantFeedback, onTutorMessage: options.onTutorMessage });
  live.current = { ctx, conversation, wantFeedback, onTutorMessage: options.onTutorMessage };

  const { messages } = conversation;
  const last = messages[messages.length - 1];
  const needsReply = options.active !== false && known && !error && (messages.length === 0 || last?.role === 'user');

  /** A check on its own: the “Check” button. */
  const check = useCallback(
    async (messageId: string, text: string, spoken: boolean) => {
      setChecking((s) => new Set(s).add(messageId));
      try {
        const correction = await correctMessage(live.current.ctx, text, spoken);
        patchMessage(conversation.id, messageId, { correction });
        if (correction.status !== 'unavailable') bump({ checked: 1, clean: correction.status === 'ok' ? 1 : 0 });
      } catch (err) {
        patchMessage(conversation.id, messageId, {
          correction: { status: 'unavailable', issues: [], source: 'ai', note: errorText(err) },
        });
      } finally {
        setChecking((s) => {
          const next = new Set(s);
          next.delete(messageId);
          return next;
        });
      }
    },
    [conversation.id, patchMessage, bump],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const message: ChatMessage = { id: uid(), role: 'user', text, createdAt: Date.now(), ...(voice ? { via: 'voice' as const } : {}) };
      addMessage(conversation.id, message);
      setError(null);
    },
    [addMessage, conversation.id, voice],
  );

  useEffect(() => {
    if (!needsReply) return undefined;
    const controller = new AbortController();
    setPending(true);

    const run = async () => {
      const { ctx: context, conversation: current, wantFeedback: feedback } = live.current;
      const latest = current.messages[current.messages.length - 1];
      // reply and feedback travel in one request, which halves the use of the free quota
      const withFeedback = feedback && latest?.role === 'user' && !latest.correction;
      const reply = await aiReply(context, current.messages, withFeedback, controller.signal);
      if (controller.signal.aborted) return;
      setPending(false);
      if (reply.correction && latest?.role === 'user') {
        patchMessage(current.id, latest.id, { correction: reply.correction });
        bump({ checked: 1, clean: reply.correction.status === 'ok' ? 1 : 0 });
      }
      const message: ChatMessage = { id: uid(), role: 'tutor', text: reply.text, createdAt: Date.now(), source: 'ai', model: reply.model };
      addMessage(current.id, message);
      live.current.onTutorMessage?.(message);
    };

    // a tick of delay so a render that is immediately replaced never reaches the API
    const timer = window.setTimeout(() => {
      run().catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        setPending(false);
        const service = err instanceof ServiceError ? err : null;
        setError({
          message: errorText(err),
          code: service?.code ?? 'error',
          retryAt: service?.retryAfter ? Date.now() + service.retryAfter * 1000 : null,
          resetAt: service?.resetAt ?? null,
        });
        // the server's situation changed (key removed, quota used up, server gone): refresh what the app shows
        if (service && service.code !== 'free_busy') void refresh();
      });
    }, 60);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setPending(false);
    };
  }, [needsReply, messages.length, addMessage, patchMessage, bump, refresh]);

  const retry = useCallback(() => setError(null), []);

  return { lang, scenario, status, known, server, pending, error, retry, send, check, checking };
}
