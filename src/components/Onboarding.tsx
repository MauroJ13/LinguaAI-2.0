import { useState } from 'react';
import type { Level } from '../types';
import { useStore } from '../state/store';
import { LanguageSelect, LevelSelect, Modal } from './ui';
import { Logo } from './Logo';

function guessNative(): string {
  const tag = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'hr', 'pl', 'sv', 'tr', 'el', 'uk', 'ja', 'zh', 'ar', 'he'].includes(tag) ? tag : 'en';
}

export function Onboarding() {
  const { data, completeOnboarding } = useStore();
  const [name, setName] = useState(data.profile.name);
  const [nativeLang, setNativeLang] = useState(guessNative);
  const [targetLang, setTargetLang] = useState(() => (guessNative() === 'es' ? 'en' : data.settings.targetLang));
  const [level, setLevel] = useState<Level>(data.settings.level);

  const submit = () => {
    completeOnboarding({ name: name.trim(), nativeLang, joinedAt: Date.now() }, { targetLang, level });
  };

  return (
    <Modal
      title="Welcome"
      locked
      onClose={() => undefined}
      footer={
        <button type="button" className="btn btn--primary" onClick={submit} disabled={nativeLang === targetLang}>
          Start learning
        </button>
      }
    >
      <Logo size="lg" />
      <p className="lede">Three quick questions so your tutor knows who it is talking to. You can change all of this later.</p>
      <div className="form">
        <label className="field">
          <span className="field__label">Your first name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana" autoComplete="given-name" maxLength={40} />
        </label>
        <LanguageSelect label="I speak" value={nativeLang} onChange={setNativeLang} />
        <LanguageSelect label="I want to learn" value={targetLang} onChange={setTargetLang} />
        {nativeLang === targetLang && <p className="field__error">Pick two different languages.</p>}
        <LevelSelect value={level} onChange={setLevel} label="My current level" />
      </div>
    </Modal>
  );
}
