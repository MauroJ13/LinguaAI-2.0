import { useMemo } from 'react';
import { LuChartColumn, LuFlame } from 'react-icons/lu';
import { getLanguage, getLevel } from '../data/languages';
import { currentStreak, dayKey, dayPoints, EMPTY_DAY, lastDays, vocabStatus } from '../lib/util';
import { useStore } from '../state/store';
import { EmptyState, Flag } from '../components/ui';

/** Chart geometry in px – keep in sync with .bars in _pages.scss */
const BAR_AREA = 150;
const LABEL_HEIGHT = 28;

export function Progress() {
  const { data, target } = useStore();
  const level = getLevel(data.settings.level);

  const totals = useMemo(() => {
    const sum = { ...EMPTY_DAY };
    let activeDays = 0;
    Object.values(data.activity).forEach((d) => {
      sum.messages += d.messages ?? 0;
      sum.reviews += d.reviews ?? 0;
      sum.correct += d.correct ?? 0;
      sum.words += d.words ?? 0;
      sum.checked += d.checked ?? 0;
      sum.clean += d.clean ?? 0;
      if (dayPoints(d) > 0) activeDays += 1;
    });
    return { ...sum, activeDays };
  }, [data.activity]);

  const days = useMemo(
    () =>
      lastDays(14).map((d) => {
        const a = { ...EMPTY_DAY, ...data.activity[dayKey(d)] };
        return { date: d, messages: a.messages, reviews: a.reviews };
      }),
    [data.activity],
  );
  const peak = Math.max(data.profile.dailyGoal, ...days.map((d) => d.messages + d.reviews));

  const vocab = useMemo(() => {
    const c = { new: 0, learning: 0, mastered: 0 };
    data.vocab.forEach((v) => {
      c[vocabStatus(v)] += 1;
    });
    return c;
  }, [data.vocab]);
  const vocabTotal = data.vocab.length;

  const languages = useMemo(() => {
    const map = new Map<string, { messages: number; conversations: number; words: number }>();
    const entry = (code: string) => {
      let e = map.get(code);
      if (!e) {
        e = { messages: 0, conversations: 0, words: 0 };
        map.set(code, e);
      }
      return e;
    };
    data.conversations.forEach((c) => {
      const e = entry(c.lang);
      e.conversations += 1;
      e.messages += c.messages.filter((m) => m.role === 'user').length;
    });
    data.vocab.forEach((v) => {
      entry(v.lang).words += 1;
    });
    return [...map.entries()].sort((a, b) => b[1].messages - a[1].messages);
  }, [data.conversations, data.vocab]);

  const streak = currentStreak(data.activity);
  const recall = totals.reviews > 0 ? Math.round((totals.correct / totals.reviews) * 100) : null;
  const clean = totals.checked > 0 ? Math.round((totals.clean / totals.checked) * 100) : null;
  const hasAnything = totals.messages + totals.reviews + vocabTotal > 0;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Progress</h1>
          <p className="lede">
            Currently learning {target.name} at {level.id} ({level.name.toLowerCase()}).
          </p>
        </div>
        <span className={`streak streak--large ${streak > 0 ? 'is-lit' : ''}`}>
          <LuFlame aria-hidden="true" />
          {streak}-day streak
        </span>
      </header>

      {!hasAnything ? (
        <div className="panel">
          <EmptyState
            icon={<LuChartColumn />}
            title="Your numbers start with the first message"
            action={
              <a className="btn btn--primary" href="#/chat">
                Start a conversation
              </a>
            }
          >
            Messages, reviewed cards, saved words and corrections are counted here as soon as you practise.
          </EmptyState>
        </div>
      ) : (
        <>
          <dl className="figures">
            <div>
              <dt>Messages written</dt>
              <dd>{totals.messages}</dd>
            </div>
            <div>
              <dt>Cards reviewed</dt>
              <dd>{totals.reviews}</dd>
            </div>
            <div>
              <dt>Words saved</dt>
              <dd>{vocabTotal}</dd>
            </div>
            <div>
              <dt>Days practised</dt>
              <dd>{totals.activeDays}</dd>
            </div>
          </dl>

          <section className="panel">
            <header className="panel__head">
              <h2>Last 14 days</h2>
              <ul className="legend">
                <li className="legend__messages">Messages</li>
                <li className="legend__reviews">Cards</li>
                <li className="legend__goal">Daily goal ({data.profile.dailyGoal})</li>
              </ul>
            </header>
            <div className="bars" role="img" aria-label="Messages and reviewed cards per day over the last 14 days">
              <i className="bars__goal" style={{ bottom: LABEL_HEIGHT + (data.profile.dailyGoal / peak) * BAR_AREA }} />
              {days.map((d) => {
                const total = d.messages + d.reviews;
                return (
                  <div key={dayKey(d.date)} className="bars__col" title={`${d.date.toLocaleDateString()}: ${d.messages} messages, ${d.reviews} cards`}>
                    <div className="bars__stack">
                      <span className="bars__num">{total > 0 ? total : ''}</span>
                      <i className="bars__reviews" style={{ height: (d.reviews / peak) * BAR_AREA }} />
                      <i className="bars__messages" style={{ height: (d.messages / peak) * BAR_AREA }} />
                    </div>
                    <span className="bars__label">{d.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="split">
            <section className="panel">
              <header className="panel__head">
                <h2>Accuracy</h2>
              </header>
              <div className="meter">
                <div className="meter__row">
                  <span>Messages without mistakes</span>
                  <strong>{clean === null ? 'No checks yet' : `${clean}%`}</strong>
                </div>
                <div className="progress">
                  <i style={{ width: `${clean ?? 0}%` }} />
                </div>
                <small>
                  {totals.checked} {totals.checked === 1 ? 'message' : 'messages'} checked
                </small>
              </div>
              <div className="meter">
                <div className="meter__row">
                  <span>Flashcards remembered</span>
                  <strong>{recall === null ? 'No reviews yet' : `${recall}%`}</strong>
                </div>
                <div className="progress">
                  <i style={{ width: `${recall ?? 0}%` }} />
                </div>
                <small>
                  {totals.reviews} {totals.reviews === 1 ? 'review' : 'reviews'}
                </small>
              </div>
            </section>

            <section className="panel">
              <header className="panel__head">
                <h2>Vocabulary</h2>
                <a href="#/vocabulary">Open</a>
              </header>
              {vocabTotal === 0 ? (
                <p className="muted">No words saved yet.</p>
              ) : (
                <>
                  <div className="stackbar" role="img" aria-label={`${vocab.mastered} mastered, ${vocab.learning} learning, ${vocab.new} new`}>
                    <i className="stackbar__mastered" style={{ flexGrow: vocab.mastered }} />
                    <i className="stackbar__learning" style={{ flexGrow: vocab.learning }} />
                    <i className="stackbar__new" style={{ flexGrow: vocab.new }} />
                  </div>
                  <ul className="legend legend--rows">
                    <li className="legend__mastered">
                      Mastered <strong>{vocab.mastered}</strong>
                    </li>
                    <li className="legend__learning">
                      Learning <strong>{vocab.learning}</strong>
                    </li>
                    <li className="legend__new">
                      New <strong>{vocab.new}</strong>
                    </li>
                  </ul>
                </>
              )}
            </section>
          </div>

          {languages.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <h2>By language</h2>
              </header>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Language</th>
                    <th scope="col">Conversations</th>
                    <th scope="col">Messages</th>
                    <th scope="col">Words</th>
                  </tr>
                </thead>
                <tbody>
                  {languages.map(([code, e]) => (
                    <tr key={code}>
                      <th scope="row">
                        <Flag code={code} size="sm" />
                        {getLanguage(code).name}
                      </th>
                      <td>{e.conversations}</td>
                      <td>{e.messages}</td>
                      <td>{e.words}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
