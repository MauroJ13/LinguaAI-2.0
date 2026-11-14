import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LuArrowUp, LuFlame, LuLayers, LuMessagesSquare, LuMic } from 'react-icons/lu';
import { SCENARIOS } from '../data/scenarios';
import { getLevel } from '../data/languages';
import { currentStreak, dayKey, dayPoints, isDue, lastDays, relativeTime } from '../lib/util';
import { navigate } from '../lib/hooks';
import { useStore } from '../state/store';
import { EmptyState, Flag, ProgressRing } from '../components/ui';
import { queueFirstMessage } from './Chat';

export function Dashboard() {
  const { data, target, today, createConversation } = useStore();
  const [draft, setDraft] = useState('');
  const { profile, settings } = data;
  const level = getLevel(settings.level);
  const streak = currentStreak(data.activity);
  const points = dayPoints(today);
  const goalReached = points >= profile.dailyGoal;
  const week = lastDays(7);
  const targetVocab = data.vocab.filter((v) => v.lang === target.code);
  const due = targetVocab.filter((v) => isDue(v)).length;
  const recent = [...data.conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const recentWords = targetVocab.slice(0, 5);

  const start = (scenarioId: string, firstMessage?: string) => {
    const id = createConversation({ scenarioId, lang: target.code, level: settings.level });
    if (firstMessage) queueFirstMessage(id, firstMessage);
    navigate(`/chat/${id}`);
  };

  const submit = () => {
    if (draft.trim()) start('free', draft.trim());
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="page today">
      <section className="hero">
        <p className="hero__meta">
          <Flag code={target.code} size="md" explain />
          <span>
            {target.name}, {level.id} {level.name}
          </span>
        </p>
        <h1 className="display">
          <span lang={target.code} dir={target.rtl ? 'rtl' : 'ltr'}>
            {target.hello}
          </span>
          {profile.name ? `, ${profile.name}.` : '.'}
        </h1>
        <form
          className="hero__composer composer__box"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Say something in ${target.name} to start a conversation…`}
            aria-label={`First message in ${target.name}`}
            dir="auto"
          />
          <button type="submit" className="composer__send" disabled={!draft.trim()} aria-label="Start conversation">
            <LuArrowUp />
          </button>
        </form>
        <a className="hero__speak" href="#/speak">
          <span className="hero__speak-icon" aria-hidden="true">
            <LuMic />
          </span>
          <span>
            <strong>Rather talk than type?</strong>
            <small>Live Speaking: your tutor asks out loud, you answer through the microphone.</small>
          </span>
        </a>
        <div className="hero__scenarios">
          <span>Or step into a scene:</span>
          {SCENARIOS.filter((s) => s.id !== 'free').map((s) => (
            <button key={s.id} type="button" className="pill" onClick={() => start(s.id)}>
              {s.title}
            </button>
          ))}
        </div>
      </section>

      <div className="today__grid">
        <section className="panel today__recent">
          <header className="panel__head">
            <h2>Pick up where you left off</h2>
            {recent.length > 0 && <a href="#/chat">All conversations</a>}
          </header>
          {recent.length === 0 ? (
            <EmptyState icon={<LuMessagesSquare />} title="No conversations yet">
              Write your first sentence above, even a single word counts. Your tutor answers in {target.name}.
            </EmptyState>
          ) : (
            <ul className="history history--wide">
              {recent.map((c) => {
                const last = c.messages[c.messages.length - 1];
                return (
                  <li key={c.id}>
                    <a href={`#/chat/${c.id}`} className="history__item">
                      <Flag code={c.lang} size="sm" />
                      <span className="history__text">
                        <strong>{c.title}</strong>
                        <small>{last ? last.text : 'No messages yet'}</small>
                      </span>
                      <time>{relativeTime(c.updatedAt)}</time>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel today__goal">
          <header className="panel__head">
            <h2>Today</h2>
            <span className={`streak ${streak > 0 ? 'is-lit' : ''}`} title="Days in a row with practice">
              <LuFlame aria-hidden="true" />
              {streak} {streak === 1 ? 'day' : 'days'}
            </span>
          </header>
          <div className="goal">
            <ProgressRing value={points} max={profile.dailyGoal}>
              <strong>{points}</strong>
              <span>of {profile.dailyGoal}</span>
            </ProgressRing>
            <div className="goal__text">
              <p>
                {goalReached
                  ? 'Daily goal reached. Anything from here is a bonus.'
                  : `${profile.dailyGoal - points} more ${profile.dailyGoal - points === 1 ? 'message or card' : 'messages or cards'} to reach your daily goal.`}
              </p>
              <dl>
                <div>
                  <dt>Messages</dt>
                  <dd>{today.messages}</dd>
                </div>
                <div>
                  <dt>Cards</dt>
                  <dd>{today.reviews}</dd>
                </div>
                <div>
                  <dt>New words</dt>
                  <dd>{today.words}</dd>
                </div>
              </dl>
            </div>
          </div>
          <ol className="week" aria-label="Last seven days">
            {week.map((d) => {
              const p = dayPoints(data.activity[dayKey(d)]);
              const state = p >= profile.dailyGoal ? 'full' : p > 0 ? 'part' : 'none';
              return (
                <li key={dayKey(d)} className={`week__day week__day--${state}`} title={`${d.toLocaleDateString()}: ${p} of ${profile.dailyGoal}`}>
                  <i aria-hidden="true" />
                  <span>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="panel today__cards">
          <header className="panel__head">
            <h2>Flashcards</h2>
            <a href="#/vocabulary">Vocabulary</a>
          </header>
          {targetVocab.length === 0 ? (
            <EmptyState icon={<LuLayers />} title="No words saved yet">
              In a conversation, choose “Save words” under a tutor message and tap any word you want to remember.
            </EmptyState>
          ) : (
            <>
              <div className="due">
                <p>
                  <strong>{due}</strong> {due === 1 ? 'card is' : 'cards are'} due for review
                </p>
                <a className={`btn ${due > 0 ? 'btn--primary' : 'btn--ghost'}`} href="#/flashcards">
                  {due > 0 ? 'Review now' : 'Practise anyway'}
                </a>
              </div>
              <ul className="wordlist">
                {recentWords.map((w) => (
                  <li key={w.id}>
                    <span lang={target.code}>{w.term}</span>
                    <small>{w.translation}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
