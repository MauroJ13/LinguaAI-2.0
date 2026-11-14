import { useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuExternalLink, LuLoaderCircle, LuMonitor, LuMoon, LuRotateCcw, LuSun, LuVolume2 } from 'react-icons/lu';
import type { Theme } from '../types';
import { formatReset } from '../services/ai';
import { FREE_SERVICES_LABEL } from '../services/freeAi';
import { recognitionSupported } from '../services/recognition';
import { speechSupported, voicesFor } from '../services/speech';
import { useSpeech, useVoices } from '../lib/hooks';
import { useStore } from '../state/store';
import { useTutor } from '../state/tutor';
import { Flag, LanguageSelect, LevelSelect, Toggle } from '../components/ui';

const THEMES: { id: Theme; label: string; icon: typeof LuSun }[] = [
  { id: 'system', label: 'System', icon: LuMonitor },
  { id: 'light', label: 'Light', icon: LuSun },
  { id: 'dark', label: 'Dark', icon: LuMoon },
];

const CREDITS = [
  { name: 'OVHcloud AI Endpoints', url: 'https://endpoints.ai.cloud.ovh.net', use: 'The AI tutor (conversation and feedback): open models such as Mistral Small and Llama, used without an account.' },
  { name: 'LLM7.io', url: 'https://llm7.io', use: 'Second free AI service for the tutor, used without an account when the first is busy.' },
  { name: 'Google Gemini API', url: 'https://ai.google.dev', use: 'Optional: only used if a key has been configured on LinguaAI’s server.' },
  { name: 'Web Speech API', url: 'https://developer.mozilla.org/docs/Web/API/Web_Speech_API', use: 'Speech recognition and voices come from your browser. Chrome and Edge send microphone audio to their own speech service to recognise it.' },
  { name: 'LanguageTool', url: 'https://languagetool.org', use: 'Grammar and spelling for the “Check” button when no AI can answer (public API).' },
  { name: 'MyMemory by Translated', url: 'https://mymemory.translated.net', use: 'Translations of messages and words (public API); the AI steps in when it is unavailable.' },
  { name: 'Lucide', url: 'https://lucide.dev', use: 'Icons (ISC licence), via react-icons.' },
  { name: 'Plus Jakarta Sans and Literata', url: 'https://fonts.google.com', use: 'Typefaces (SIL Open Font Licence), served by Google Fonts.' },
];

export function SettingsPage() {
  const { data, target, updateSettings } = useStore();
  const { settings } = data;
  const { status, known, server, refresh } = useTutor();
  const voices = useVoices();
  const speech = useSpeech();
  const [checking, setChecking] = useState(false);

  const targetVoices = voicesFor(target, voices);
  const usingFallbackVoice = Boolean(target.speechFallback) && targetVoices.length > 0 && !targetVoices.some((v) => v.lang.toLowerCase().startsWith(target.speech.toLowerCase()));
  const canListen = recognitionSupported() && target.recognition !== false;

  const recheck = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <div>
          <h1>Settings</h1>
          <p className="lede">Your settings, conversations and words are saved in this browser only.</p>
        </div>
      </header>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Learning</h2>
        </header>
        <div className="form">
          <LanguageSelect label="Language I am learning" value={settings.targetLang} exclude={data.profile.nativeLang} onChange={(code) => updateSettings({ targetLang: code })} />
          {target.flagNote && <p className="field__hint">{target.flagNote}</p>}
          <LevelSelect value={settings.level} onChange={(level) => updateSettings({ level })} label="My level (CEFR)" />
          <p className="field__hint">
            The same language and level apply to AI Chat and Live Speaking. Conversations you already started keep the ones they began with.
          </p>
        </div>
      </section>

      <section className="panel settings" id="tutor">
        <header className="panel__head">
          <h2>AI tutor</h2>
          <span className={`chip ${known ? 'chip--on' : 'chip--muted'}`}>{known ? 'Ready' : 'Checking'}</span>
        </header>

        {!known && (
          <p className="tutor-card">
            <LuLoaderCircle className="spin" aria-hidden="true" />
            <span>Checking which AI is available…</span>
          </p>
        )}

        {known && server && (
          <div className="tutor-card tutor-card--ok">
            <LuCircleCheck aria-hidden="true" />
            <div>
              <strong>Your tutor runs on {status.label ?? 'Google Gemini'} through LinguaAI’s server.</strong>
              <p>
                {status.model ? `Model in use: ${status.model}. ` : ''}
                The key stays on the server. Only Gemini’s free tier is used, and the server stops before its limits. If the quota runs out, the free
                services below take over automatically.
              </p>
            </div>
          </div>
        )}

        {known && !server && (
          <div className="tutor-card tutor-card--ok">
            <LuCircleCheck aria-hidden="true" />
            <div>
              <strong>Your tutor runs on free AI services that need no account and no key.</strong>
              <p>
                {FREE_SERVICES_LABEL}, called directly from your browser. Nothing has to be set up and nothing can be charged. Without an account these
                services allow only a few requests per minute, so LinguaAI takes turns between several models and tells you when a short wait is needed.
                Answers can take a few seconds.
              </p>
              {status.state === 'ready' && status.pausedUntil && (
                <p>
                  The Gemini quota on LinguaAI’s server is used up until {formatReset(status.pausedUntil).replace(/^at /, '')}; the free services are answering in
                  the meantime.
                </p>
              )}
              {status.state === 'problem' && <p>The server has a Gemini key that is not accepted ({status.problem}), so the free services are used.</p>}
            </div>
          </div>
        )}

        <p className="field__hint">
          There are no scripted or simulated answers in LinguaAI: every reply and correction comes from one of these AI services, and when none can answer,
          the app says so.
        </p>

        {known && (
          <button type="button" className="btn btn--ghost btn--small settings__recheck" onClick={() => void recheck()} disabled={checking}>
            {checking ? <LuLoaderCircle className="spin" aria-hidden="true" /> : <LuRotateCcw aria-hidden="true" />}
            Check again
          </button>
        )}
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Feedback</h2>
        </header>
        <Toggle
          label="Review every message I write in Chat"
          hint={`Your tutor answers and reviews your message in one step, adapted to level ${settings.level}: fewer and simpler explanations for beginners, finer points for advanced learners. In Live Speaking every answer is reviewed. With this off, use “Check” under a message.`}
          checked={settings.autoCorrect}
          onChange={(v) => updateSettings({ autoCorrect: v })}
        />
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Voice and microphone</h2>
          <span className="settings__lang">
            <Flag code={target.code} size="sm" />
            {target.name}
          </span>
        </header>
        {!speechSupported() ? (
          <p className="notice notice--warn">
            <LuCircleAlert aria-hidden="true" />
            <span>This browser has no text-to-speech. Audio buttons will not work here; try Chrome, Edge or Safari.</span>
          </p>
        ) : (
          <div className="form">
            <label className="field">
              <span className="field__label">Voice for {target.name}</span>
              <select className="input" value={settings.voices[target.code] ?? ''} onChange={(e) => updateSettings({ voices: { ...settings.voices, [target.code]: e.target.value } })} disabled={targetVoices.length === 0}>
                <option value="">{targetVoices.length === 0 ? 'No voice installed' : 'Automatic'}</option>
                {targetVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              {targetVoices.length === 0 && (
                <span className="field__hint">
                  Your device has no {target.name} voice. Install one in the system’s language or speech settings, then reload this page.
                </span>
              )}
              {usingFallbackVoice && <span className="field__hint">No {target.name} voice exists on this device, so an Italian voice reads it as an approximation.</span>}
            </label>
            <label className="field">
              <span className="field__label">Speed: {settings.speechRate.toFixed(2)}×</span>
              <input type="range" min={0.6} max={1.3} step={0.05} value={settings.speechRate} onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })} />
            </label>
            <div>
              <button type="button" className="btn btn--ghost" onClick={() => speech.say('sample', target.hello, target)} disabled={targetVoices.length === 0}>
                <LuVolume2 aria-hidden="true" />
                Play “{target.hello}”
              </button>
            </div>
            <Toggle label="Read tutor replies aloud in Chat" checked={settings.autoSpeak} onChange={(v) => updateSettings({ autoSpeak: v })} />
            <Toggle
              label="Hands-free Live Speaking"
              hint="The microphone opens by itself when the tutor has finished speaking."
              checked={settings.handsFree}
              onChange={(v) => updateSettings({ handsFree: v })}
            />
          </div>
        )}
        <p className={`notice ${canListen ? '' : 'notice--warn'} settings__listen`}>
          {canListen ? <LuCircleCheck aria-hidden="true" /> : <LuCircleAlert aria-hidden="true" />}
          <span>
            {canListen
              ? `This browser can recognise spoken ${target.name} for Live Speaking. It converts speech to text; it does not rate pronunciation.`
              : target.recognition === false
                ? `Browsers offer no speech recognition for ${target.name}, so Live Speaking is not available for it.`
                : 'This browser has no speech recognition. Live Speaking works in Chrome, Edge and Safari.'}
          </span>
        </p>
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Appearance</h2>
        </header>
        <div className="segmented" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} type="button" className={settings.theme === t.id ? 'is-active' : ''} aria-pressed={settings.theme === t.id} onClick={() => updateSettings({ theme: t.id })}>
              <t.icon aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel settings">
        <header className="panel__head">
          <h2>Services and credits</h2>
        </header>
        <ul className="credits">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.name} <LuExternalLink aria-hidden="true" />
              </a>
              <span>{c.use}</span>
            </li>
          ))}
        </ul>
        <p className="field__hint">Flag graphics are drawn for LinguaAI as SVG files; coats of arms are simplified. Text you write, check or translate is sent to the services named above, which may store or use it under their own terms. Do not enter personal or private information.</p>
      </section>
    </div>
  );
}
