import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuCircleCheck, LuLayers, LuSquare, LuVolume2 } from 'react-icons/lu';
import type { Grade } from '../types';
import { isDue, nextIntervalLabel } from '../lib/util';
import { useSpeech } from '../lib/hooks';
import { useStore } from '../state/store';
import { EmptyState } from '../components/ui';

const SESSION_SIZE = 20;
const GRADES: { id: Grade; label: string; key: string }[] = [
  { id: 'again', label: 'Again', key: '1' },
  { id: 'hard', label: 'Hard', key: '2' },
  { id: 'good', label: 'Good', key: '3' },
  { id: 'easy', label: 'Easy', key: '4' },
];

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Session {
  queue: string[];
  total: number;
  done: number;
  remembered: number;
  repeated: Set<string>;
}

export function Flashcards() {
  const { data, target, native, reviewVocab } = useStore();
  const speech = useSpeech();
  const [session, setSession] = useState<Session | null>(null);
  const [flipped, setFlipped] = useState(false);

  const cards = useMemo(() => data.vocab.filter((v) => v.lang === target.code), [data.vocab, target.code]);
  const dueCards = useMemo(() => cards.filter((v) => isDue(v)), [cards]);

  // leaving the language ends the session
  useEffect(() => {
    setSession(null);
    setFlipped(false);
  }, [target.code]);

  const begin = (ids: string[]) => {
    const queue = shuffle(ids).slice(0, SESSION_SIZE);
    setSession({ queue, total: queue.length, done: 0, remembered: 0, repeated: new Set() });
    setFlipped(false);
  };

  const currentId = session?.queue[0];
  const current = currentId ? cards.find((c) => c.id === currentId) : undefined;

  const grade = useCallback(
    (g: Grade) => {
      if (!session || !current) return;
      reviewVocab(current.id, g);
      speech.stop();
      setSession((s) => {
        if (!s) return s;
        const rest = s.queue.slice(1);
        // a forgotten card comes back once at the end of the session
        const again = g === 'again' && !s.repeated.has(current.id);
        const repeated = new Set(s.repeated);
        if (again) repeated.add(current.id);
        return {
          ...s,
          queue: again ? [...rest, current.id] : rest,
          done: again ? s.done : s.done + 1,
          remembered: g === 'again' || s.repeated.has(current.id) ? s.remembered : s.remembered + 1,
          repeated,
        };
      });
      setFlipped(false);
    },
    [session, current, reviewVocab, speech],
  );

  // skip cards deleted elsewhere while a session is open
  useEffect(() => {
    if (session && currentId && !current) {
      setSession((s) => (s ? { ...s, queue: s.queue.slice(1), done: s.done + 1 } : s));
    }
  }, [session, currentId, current]);

  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (el && el.tagName === 'BUTTON') return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped) {
        const match = GRADES.find((g) => g.key === e.key);
        if (match) grade(match.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped, grade]);

  /* ----- no session yet ----- */

  if (!session) {
    return (
      <div className="page page--narrow">
        <header className="page__head">
          <div>
            <h1>Flashcards</h1>
            <p className="lede">Spaced repetition for your {target.name} words: cards you know come back later, cards you miss come back sooner.</p>
          </div>
        </header>
        <div className="panel">
          {cards.length === 0 ? (
            <EmptyState
              icon={<LuLayers />}
              title={`No ${target.name} cards yet`}
              action={
                <a className="btn btn--primary" href="#/vocabulary">
                  Go to vocabulary
                </a>
              }
            >
              Every word you save becomes a card. Add words in Vocabulary or save them from a conversation.
            </EmptyState>
          ) : dueCards.length === 0 ? (
            <EmptyState
              icon={<LuCircleCheck />}
              title="Nothing is due right now"
              action={
                <button type="button" className="btn btn--primary" onClick={() => begin(cards.map((c) => c.id))}>
                  Practise {Math.min(cards.length, SESSION_SIZE)} cards anyway
                </button>
              }
            >
              All {cards.length} of your {target.name} cards are scheduled for later. Extra practice still counts toward your daily goal.
            </EmptyState>
          ) : (
            <div className="deck-intro">
              <div className="deck-intro__stack" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <h2>
                {dueCards.length} {dueCards.length === 1 ? 'card' : 'cards'} due
              </h2>
              <p>
                {dueCards.length > SESSION_SIZE ? `This session covers ${SESSION_SIZE} of them. ` : ''}
                Read the {target.name} word, say the meaning to yourself, then turn the card.
              </p>
              <button type="button" className="btn btn--primary btn--large" onClick={() => begin(dueCards.map((c) => c.id))}>
                Start review
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ----- session finished ----- */

  if (session.queue.length === 0) {
    const pct = session.total > 0 ? Math.round((session.remembered / session.total) * 100) : 0;
    return (
      <div className="page page--narrow">
        <div className="panel">
          <div className="deck-intro">
            <LuCircleCheck className="deck-intro__done" aria-hidden="true" />
            <h2>Session complete</h2>
            <p>
              You reviewed {session.total} {session.total === 1 ? 'card' : 'cards'} and remembered {session.remembered} on the first try ({pct}%).
            </p>
            <div className="deck-intro__actions">
              <a className="btn btn--primary" href="#/">
                Back to Today
              </a>
              <button type="button" className="btn btn--ghost" onClick={() => setSession(null)}>
                Flashcard overview
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  /* ----- reviewing ----- */

  return (
    <div className="page page--narrow review">
      <div className="review__top">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setSession(null)}>
          End session
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={session.total} aria-valuenow={session.done} aria-label="Cards reviewed">
          <i style={{ width: `${(session.done / session.total) * 100}%` }} />
        </div>
        <span className="review__count">
          {session.done} / {session.total}
        </span>
      </div>

      <div className={`card3d ${flipped ? 'is-flipped' : ''}`}>
        <button type="button" className="card3d__inner" onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Show the word' : 'Show the meaning'}>
          <span className="card3d__face card3d__face--front">
            <small>{target.name}</small>
            <strong lang={target.code} dir={target.rtl ? 'rtl' : 'ltr'}>
              {current.term}
            </strong>
            <em>Tap or press Space to turn</em>
          </span>
          <span className="card3d__face card3d__face--back">
            <small>{native.name}</small>
            <strong>{current.translation || 'No translation saved'}</strong>
            {current.example && (
              <em lang={target.code} dir={target.rtl ? 'rtl' : 'ltr'}>
                {current.example}
              </em>
            )}
          </span>
        </button>
      </div>

      <div className="review__listen">
        <button type="button" className="tool" onClick={() => speech.say(current.id, current.term, target)}>
          {speech.speakingId === current.id ? <LuSquare aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
          {speech.speakingId === current.id ? 'Stop' : 'Listen'}
        </button>
      </div>

      {flipped ? (
        <div className="grades">
          <p>How well did you know it?</p>
          <div className="grades__row">
            {GRADES.map((g) => (
              <button key={g.id} type="button" className={`grade grade--${g.id}`} onClick={() => grade(g.id)}>
                <strong>{g.label}</strong>
                <small>{nextIntervalLabel(current.srs, g.id)}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grades">
          <button type="button" className="btn btn--primary btn--large" onClick={() => setFlipped(true)}>
            Show meaning
          </button>
        </div>
      )}
    </div>
  );
}
