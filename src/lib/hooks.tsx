import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuInfo } from 'react-icons/lu';
import type { Language } from '../types';
import { getVoices, speak, speechSupported, stopSpeaking, unlockSpeech } from '../services/speech';
import { useStore } from '../state/store';

/* ---------- hash router ---------- */

function readHash(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith('/') ? to : `/${to}`;
}

export function useRoute(): string[] {
  const [segments, setSegments] = useState<string[]>(readHash);
  useEffect(() => {
    const onChange = () => setSegments(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return segments;
}

/* ---------- toasts ---------- */

type ToastKind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setItems((list) => [...list.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.kind === 'success' ? <LuCircleCheck /> : t.kind === 'error' ? <LuCircleAlert /> : <LuInfo />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------- speech ---------- */

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(getVoices);
  useEffect(() => {
    if (!speechSupported()) return undefined;
    const update = () => setVoices(getVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

/**
 * Speak a piece of text; `speakingId` tells the UI which button is currently playing.
 * `say` returns true when playback started (false: stopped, or no voice available).
 */
export function useSpeech() {
  const { data } = useStore();
  const toast = useToast();
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  /** true when the browser accepted speech but never started it (blocked autoplay, typical on iPhone) */
  const [blocked, setBlocked] = useState(false);
  const watchdog = useRef(0);
  const { speechRate, voices } = data.settings;

  useEffect(
    () => () => {
      window.clearTimeout(watchdog.current);
      stopSpeaking();
    },
    [],
  );

  const stop = useCallback(() => {
    window.clearTimeout(watchdog.current);
    stopSpeaking();
    setSpeakingId(null);
  }, []);

  const say = useCallback(
    (id: string, text: string, lang: Language): boolean => {
      if (speakingId === id) {
        stop();
        return false;
      }
      window.clearTimeout(watchdog.current);
      let started = false;
      const release = () => setSpeakingId((current) => (current === id ? null : current));
      const result = speak(text, {
        lang,
        voiceURI: voices[lang.code],
        rate: speechRate,
        onStart: () => {
          started = true;
          setBlocked(false);
          window.clearTimeout(watchdog.current);
          // some engines never report the end of long texts: let go after a generous time
          watchdog.current = window.setTimeout(release, 8000 + text.length * 140);
        },
        onEnd: () => {
          window.clearTimeout(watchdog.current);
          release();
        },
      });
      if (!result.ok) {
        toast(result.reason, 'error');
        return false;
      }
      setSpeakingId(id);
      watchdog.current = window.setTimeout(() => {
        if (started) return;
        stopSpeaking();
        setBlocked(true);
        release();
      }, 3000);
      return true;
    },
    [speakingId, speechRate, voices, stop, toast],
  );

  return useMemo(() => ({ speakingId, blocked, say, stop, unlock: unlockSpeech }), [speakingId, blocked, say, stop]);
}

/* ---------- misc ---------- */

export function useClickOutside(ref: { current: HTMLElement | null }, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOutside();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, active]);
}

/** Seconds left until `until` (a timestamp), ticking once per second; 0 when it has passed. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

/** True while the CSS media query matches (kept in sync with resizes and rotation). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
