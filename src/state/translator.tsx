import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorText, isAbort } from '../services/ai';
import { MAX_TRANSLATE_CHARS, translateForTranslator } from '../services/tutor';
import { useStore } from './store';
import { useTutor } from './tutor';

/**
 * Lingua Translate's state. It lives above the pages, so the translator keeps
 * its text and stays open (or minimised) while the learner moves between Chat,
 * Live Speaking and the rest of the app.
 */

export type TranslatorMode = 'closed' | 'open' | 'minimized';
export interface Point {
  x: number;
  y: number;
}

interface Prefs {
  source: string;
  target?: string;
  position: Point | null;
}

interface Translator {
  mode: TranslatorMode;
  text: string;
  /** a language code, or "auto" for “Detect language” */
  source: string;
  target: string;
  result: string;
  detected: string | null;
  status: 'idle' | 'loading' | 'done' | 'error';
  error: string | null;
  position: Point | null;
  canSwap: boolean;
  open: (text?: string) => void;
  minimize: () => void;
  close: () => void;
  setText: (text: string) => void;
  setSource: (code: string) => void;
  setTarget: (code: string) => void;
  swap: () => void;
  clear: () => void;
  retry: () => void;
  setPosition: (point: Point | null) => void;
}

const PREFS_KEY = 'linguaai.translator';
const TranslatorContext = createContext<Translator | null>(null);

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export function TranslatorProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const { server } = useTutor();
  const saved = useMemo(loadPrefs, []);

  const [mode, setMode] = useState<TranslatorMode>('closed');
  const [text, setTextState] = useState('');
  const [source, setSourceState] = useState(saved.source ?? 'auto');
  // until the learner picks a target, translations go into their own language
  const [chosenTarget, setTargetState] = useState<string | null>(saved.target ?? null);
  const target = chosenTarget ?? data.profile.nativeLang;
  const [result, setResult] = useState('');
  const [detected, setDetected] = useState<string | null>(null);
  const [status, setStatus] = useState<Translator['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Point | null>(saved.position ?? null);
  const [attempt, setAttempt] = useState(0);
  const serverRef = useRef(server);
  serverRef.current = server;
  const profileRef = useRef(data.profile);
  profileRef.current = data.profile;
  const learningRef = useRef(data.settings.targetLang);
  learningRef.current = data.settings.targetLang;

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ source, target: chosenTarget ?? undefined, position }));
    } catch {
      /* preferences simply are not remembered */
    }
  }, [source, chosenTarget, position]);

  // translate a moment after the learner stops typing
  useEffect(() => {
    const input = text.trim();
    if (!input) {
      setResult('');
      setDetected(null);
      setStatus('idle');
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    const timer = window.setTimeout(() => {
      translateForTranslator(serverRef.current, input, source, target, controller.signal)
        .then((out) => {
          if (controller.signal.aborted) return;
          // the text is already in the target language: turn the pair around instead of showing it unchanged
          if (source === 'auto' && out.detected === target) {
            const { nativeLang } = profileRef.current;
            setTargetState(out.detected === nativeLang ? learningRef.current : nativeLang);
            return;
          }
          setResult(out.text);
          setDetected(out.detected ?? null);
          setStatus('done');
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || isAbort(err)) return;
          setStatus('error');
          setError(errorText(err));
        });
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, source, target, attempt]);

  const open = useCallback((initial?: string) => {
    if (initial !== undefined) setTextState(initial.slice(0, MAX_TRANSLATE_CHARS));
    setMode('open');
  }, []);
  const minimize = useCallback(() => setMode('minimized'), []);
  const close = useCallback(() => setMode('closed'), []);
  const setText = useCallback((value: string) => setTextState(value.slice(0, MAX_TRANSLATE_CHARS)), []);
  const clear = useCallback(() => setTextState(''), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const setSource = useCallback(
    (code: string) => {
      // choosing the current target as the source turns the pair around instead of translating X into X
      if (code !== 'auto' && code === target) setTargetState(source !== 'auto' ? source : (detected ?? data.profile.nativeLang));
      setSourceState(code);
    },
    [target, source, detected, data.profile.nativeLang],
  );

  const setTarget = useCallback(
    (code: string) => {
      if (code === source) setSourceState(target);
      setTargetState(code);
    },
    [source, target],
  );

  const from = source === 'auto' ? detected : source;
  const canSwap = Boolean(from) && from !== target;

  const swap = useCallback(() => {
    if (!from || from === target) return;
    setSourceState(target);
    setTargetState(from);
    if (result) setTextState(result.slice(0, MAX_TRANSLATE_CHARS));
  }, [from, target, result]);

  const value = useMemo<Translator>(
    () => ({ mode, text, source, target, result, detected, status, error, position, canSwap, open, minimize, close, setText, setSource, setTarget, swap, clear, retry, setPosition }),
    [mode, text, source, target, result, detected, status, error, position, canSwap, open, minimize, close, setText, setSource, setTarget, swap, clear, retry],
  );

  return <TranslatorContext.Provider value={value}>{children}</TranslatorContext.Provider>;
}

export function useTranslator(): Translator {
  const translator = useContext(TranslatorContext);
  if (!translator) throw new Error('useTranslator must be used inside <TranslatorProvider>');
  return translator;
}
