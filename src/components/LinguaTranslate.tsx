import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { LuArrowLeft, LuArrowRightLeft, LuCheck, LuCopy, LuGripVertical, LuLanguages, LuLoaderCircle, LuMinus, LuRotateCcw, LuSquare, LuVolume2, LuX } from 'react-icons/lu';
import { getLanguage } from '../data/languages';
import { FREE_SERVICES_LABEL } from '../services/freeAi';
import { MAX_TRANSLATE_CHARS } from '../services/tutor';
import { useMediaQuery, useSpeech } from '../lib/hooks';
import { useTranslator, type Point } from '../state/translator';
import { LanguageSelect } from './ui';

/** Below this width Lingua Translate is a full-screen page instead of a floating window (same breakpoint as the mobile navigation). */
const MOBILE = '(max-width: 899px)';
/** How much of the window must stay on screen so it can always be grabbed again. */
const KEEP_VISIBLE = 140;

/**
 * Lingua Translate, as in the first LinguaAI:
 *   desktop – a small window floating over the app that can be dragged anywhere
 *             and minimised without leaving the conversation
 *   mobile  – a full-screen translator with a back button
 * It stays mounted across pages; its state lives in state/translator.tsx.
 */
export function LinguaTranslate() {
  const translator = useTranslator();
  const mobile = useMediaQuery(MOBILE);

  if (translator.mode === 'closed') return null;
  if (translator.mode === 'minimized') return <Bubble />;
  return mobile ? <FullScreen /> : <FloatingWindow />;
}

/* ------------------------------------------------------------------ */
/* Desktop: floating, draggable window                                 */
/* ------------------------------------------------------------------ */

function clamp(point: Point, width: number): Point {
  return {
    x: Math.min(window.innerWidth - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - width, point.x)),
    y: Math.min(window.innerHeight - 64, Math.max(8, point.y)),
  };
}

function FloatingWindow() {
  const translator = useTranslator();
  const { setPosition, minimize } = translator;
  const ref = useRef<HTMLDivElement>(null);
  const [position, setLocal] = useState<Point | null>(translator.position);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const latest = useRef(position);
  latest.current = position;

  const move = useCallback((point: Point) => {
    const width = ref.current?.offsetWidth ?? 720;
    setLocal(clamp(point, width));
  }, []);

  // keep the window reachable when the browser window is resized
  useEffect(() => {
    const onResize = () => {
      if (latest.current) move(latest.current);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [move]);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // buttons inside the title bar keep working as buttons
    if ((e.target as HTMLElement).closest('button:not(.lt__grip)')) return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    move({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setPosition(latest.current);
  };

  // the grip moves the window with the arrow keys
  const onGripKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const delta: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const next = clamp({ x: box.left + d.x, y: box.top + d.y }, box.width);
    setLocal(next);
    setPosition(next);
  };

  return (
    <div
      ref={ref}
      className={`lt lt--window ${dragging ? 'is-dragging' : ''} ${position ? '' : 'lt--centered'}`}
      style={position ? { left: position.x, top: position.y } : undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby="lt-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          minimize();
        }
      }}
    >
      <header className="lt__head" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag to move">
        <span className="lt__mark" aria-hidden="true">
          <LuLanguages />
        </span>
        <div className="lt__title">
          <h2 id="lt-title">Lingua Translate</h2>
          <p>Translate between all LinguaAI languages</p>
        </div>
        <button type="button" className="lt__grip" aria-label="Move window (arrow keys)" onKeyDown={onGripKey}>
          <LuGripVertical />
        </button>
        <div className="lt__actions">
          <button type="button" className="icon-btn" onClick={minimize} aria-label="Minimise Lingua Translate" title="Minimise">
            <LuMinus />
          </button>
          <button type="button" className="icon-btn" onClick={translator.close} aria-label="Close Lingua Translate" title="Close">
            <LuX />
          </button>
        </div>
      </header>
      <Panel autoFocus />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile: full screen                                                 */
/* ------------------------------------------------------------------ */

function FullScreen() {
  const translator = useTranslator();
  const { close } = translator;

  // the page behind must not scroll while the translator covers it
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="lt lt--page" role="dialog" aria-modal="true" aria-labelledby="lt-title">
      <header className="lt__head">
        <button type="button" className="icon-btn" onClick={close} aria-label="Back to LinguaAI">
          <LuArrowLeft />
        </button>
        <span className="lt__mark" aria-hidden="true">
          <LuLanguages />
        </span>
        <h2 id="lt-title">Lingua Translate</h2>
      </header>
      <Panel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Minimised                                                           */
/* ------------------------------------------------------------------ */

function Bubble() {
  const translator = useTranslator();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="lt-bubble">
      <button ref={ref} type="button" className="lt-bubble__open" onClick={() => translator.open()} aria-label="Open Lingua Translate">
        <span className="lt__mark" aria-hidden="true">
          {translator.status === 'loading' ? <LuLoaderCircle className="spin" /> : <LuLanguages />}
        </span>
        <span>Lingua Translate</span>
      </button>
      <button type="button" className="lt-bubble__close" onClick={translator.close} aria-label="Close Lingua Translate">
        <LuX />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared content                                                      */
/* ------------------------------------------------------------------ */

function Panel({ autoFocus }: { autoFocus?: boolean }) {
  const t = useTranslator();
  const speech = useSpeech();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  const from = t.source === 'auto' ? t.detected : t.source;
  const fromLang = from ? getLanguage(from) : null;
  const toLang = getLanguage(t.target);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.result);
      setCopied(true);
    } catch {
      /* clipboard blocked: the text can still be selected by hand */
    }
  };

  return (
    <>
      <div className="lt__body">
        <div className="lt__langs">
          <LanguageSelect label="Translate from" hideLabel value={t.source} onChange={t.setSource} auto={{ label: 'Detect language', detected: t.detected ?? undefined }} />
          <button type="button" className="lt__swap" onClick={t.swap} disabled={!t.canSwap} aria-label="Swap languages" title="Swap languages">
            <LuArrowRightLeft />
          </button>
          <LanguageSelect label="Translate into" hideLabel value={t.target} onChange={t.setTarget} />
        </div>

        <div className="lt__panes">
          <div className="lt__pane">
            <textarea
              ref={inputRef}
              value={t.text}
              onChange={(e) => t.setText(e.target.value)}
              placeholder="Type or paste text…"
              aria-label="Text to translate"
              maxLength={MAX_TRANSLATE_CHARS}
              lang={fromLang?.code}
              dir="auto"
            />
            <div className="lt__pane-foot">
              <button
                type="button"
                className="icon-btn"
                onClick={() => fromLang && speech.say('lt-source', t.text, fromLang)}
                disabled={!t.text.trim() || !fromLang}
                aria-label={speech.speakingId === 'lt-source' ? 'Stop' : 'Listen to the text'}
              >
                {speech.speakingId === 'lt-source' ? <LuSquare /> : <LuVolume2 />}
              </button>
              {t.text && (
                <button type="button" className="tool" onClick={t.clear}>
                  <LuX aria-hidden="true" />
                  Clear
                </button>
              )}
              <span className="lt__count">
                {t.text.length.toLocaleString()} / {MAX_TRANSLATE_CHARS.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="lt__pane lt__pane--result" aria-live="polite" aria-busy={t.status === 'loading'}>
            <div className={`lt__result ${t.result ? '' : 'is-empty'} ${t.status === 'loading' ? 'is-loading' : ''}`} lang={toLang.code} dir={toLang.rtl ? 'rtl' : 'ltr'}>
              {t.status === 'error' ? (
                <div className="lt__error" lang="en" dir="ltr">
                  <p>{t.error}</p>
                  <button type="button" className="btn btn--small" onClick={t.retry}>
                    <LuRotateCcw aria-hidden="true" />
                    Try again
                  </button>
                </div>
              ) : t.result ? (
                t.result
              ) : t.status === 'loading' ? (
                <span lang="en" dir="ltr">Translating…</span>
              ) : (
                <span lang="en" dir="ltr">The translation appears here.</span>
              )}
            </div>
            <div className="lt__pane-foot">
              <button
                type="button"
                className="icon-btn"
                onClick={() => speech.say('lt-result', t.result, toLang)}
                disabled={!t.result || t.status === 'error'}
                aria-label={speech.speakingId === 'lt-result' ? 'Stop' : 'Listen to the translation'}
              >
                {speech.speakingId === 'lt-result' ? <LuSquare /> : <LuVolume2 />}
              </button>
              {t.status === 'loading' && t.result && <LuLoaderCircle className="spin lt__busy" aria-hidden="true" />}
              <button type="button" className="btn btn--ghost btn--small lt__copy" onClick={() => void copy()} disabled={!t.result || t.status === 'error'}>
                {copied ? <LuCheck aria-hidden="true" /> : <LuCopy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <footer className="lt__foot">Translation by MyMemory. Language detection and backup by {FREE_SERVICES_LABEL}.</footer>
    </>
  );
}
