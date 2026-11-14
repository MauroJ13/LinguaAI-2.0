import { useRef, useState, type ChangeEvent } from 'react';
import { LuDownload, LuRotateCcw, LuUpload } from 'react-icons/lu';
import { getLevel } from '../data/languages';
import { clamp, currentStreak } from '../lib/util';
import { useToast } from '../lib/hooks';
import { normalizeData, useStore } from '../state/store';
import { Avatar, ConfirmDialog, Flag, LanguageSelect } from '../components/ui';

const HUES = [252, 205, 176, 330, 12, 42, 96];

export function ProfilePage() {
  const { data, target, updateProfile, replaceAll, resetAll } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { profile } = data;
  const level = getLevel(data.settings.level);
  const messages = data.conversations.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user').length, 0);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linguaai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded', 'success');
  };

  const importData = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = normalizeData(JSON.parse(await file.text()));
      if (!parsed) throw new Error('not a backup');
      replaceAll({ ...parsed, onboarded: true });
      toast('Backup restored', 'success');
    } catch {
      toast('That file is not a LinguaAI backup. Choose a .json file exported from this page.', 'error');
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <div>
          <h1>Profile</h1>
          <p className="lede">Member since {new Date(profile.joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </header>

      <section className="panel profile-card">
        <Avatar name={profile.name} hue={profile.avatarHue} size={76} />
        <div>
          <h2>{profile.name || 'Unnamed learner'}</h2>
          <p>
            <Flag code={target.code} size="sm" /> {target.name}, {level.id} {level.name}
          </p>
        </div>
        <dl>
          <div>
            <dt>Streak</dt>
            <dd>{currentStreak(data.activity)}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{messages}</dd>
          </div>
          <div>
            <dt>Words</dt>
            <dd>{data.vocab.length}</dd>
          </div>
        </dl>
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>About you</h2>
        </header>
        <div className="form">
          <label className="field">
            <span className="field__label">First name</span>
            <input className="input" value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} maxLength={40} autoComplete="given-name" />
          </label>
          <LanguageSelect label="My language" value={profile.nativeLang} exclude={data.settings.targetLang} onChange={(code) => updateProfile({ nativeLang: code })} />
          <p className="field__hint">Translations and AI explanations are given in this language.</p>
          <div className="field">
            <span className="field__label">Avatar colour</span>
            <div className="swatches" role="radiogroup" aria-label="Avatar colour">
              {HUES.map((h) => (
                <button key={h} type="button" role="radio" aria-checked={profile.avatarHue === h} aria-label={`Colour ${HUES.indexOf(h) + 1}`} className={`swatch ${profile.avatarHue === h ? 'is-active' : ''}`} style={{ background: `hsl(${h} 55% 38%)` }} onClick={() => updateProfile({ avatarHue: h })} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Daily goal</h2>
        </header>
        <label className="field">
          <span className="field__label">
            {profile.dailyGoal} messages or flashcards a day
          </span>
          <input type="range" min={5} max={60} step={5} value={profile.dailyGoal} onChange={(e) => updateProfile({ dailyGoal: clamp(Number(e.target.value), 5, 60) })} />
          <span className="field__hint">Every message you write and every card you review counts as one.</span>
        </label>
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Your data</h2>
        </header>
        <p className="muted">Conversations, vocabulary and progress live in this browser. Download a backup to move them to another device.</p>
        <div className="data-actions">
          <button type="button" className="btn btn--ghost" onClick={exportData}>
            <LuDownload aria-hidden="true" />
            Download backup
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            <LuUpload aria-hidden="true" />
            Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importData(e)} />
          <button type="button" className="btn btn--danger-ghost" onClick={() => setConfirmReset(true)}>
            <LuRotateCcw aria-hidden="true" />
            Delete everything
          </button>
        </div>
      </section>

      {confirmReset && (
        <ConfirmDialog
          title="Delete all LinguaAI data?"
          message="This removes every conversation, saved word, statistic and setting from this browser. It cannot be undone."
          confirmLabel="Delete everything"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetAll();
            setConfirmReset(false);
            window.location.hash = '/';
          }}
        />
      )}
    </div>
  );
}
