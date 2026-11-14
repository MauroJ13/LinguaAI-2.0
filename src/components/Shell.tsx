import type { ReactNode } from 'react';
import { LuBookOpen, LuChartColumn, LuHouse, LuLanguages, LuLayers, LuMessagesSquare, LuMic, LuSettings } from 'react-icons/lu';
import { useStore } from '../state/store';
import { useTutor } from '../state/tutor';
import { useTranslator } from '../state/translator';
import { isDue } from '../lib/util';
import { Avatar, LanguageSelect } from './ui';
import { Logo } from './Logo';

const NAV = [
  { id: 'home', href: '#/', label: 'Today', short: 'Today', icon: LuHouse, mobile: true },
  { id: 'chat', href: '#/chat', label: 'AI Chat', short: 'Chat', icon: LuMessagesSquare, mobile: true },
  { id: 'speak', href: '#/speak', label: 'Live Speaking', short: 'Speak', icon: LuMic, mobile: true },
  { id: 'vocabulary', href: '#/vocabulary', label: 'Vocabulary', short: 'Words', icon: LuBookOpen, mobile: true },
  { id: 'flashcards', href: '#/flashcards', label: 'Flashcards', short: 'Cards', icon: LuLayers, mobile: true },
  { id: 'progress', href: '#/progress', label: 'Progress', short: 'Progress', icon: LuChartColumn, mobile: false },
];

export function Shell({ page, children }: { page: string; children: ReactNode }) {
  const { data, updateSettings } = useStore();
  const { status, known, server } = useTutor();
  const translator = useTranslator();
  const due = data.vocab.filter((v) => v.lang === data.settings.targetLang && isDue(v)).length;
  const paused = status.state === 'ready' && !server && status.pausedUntil;

  return (
    <div className={`shell shell--${page}`}>
      <aside className="sidebar">
        <Logo href="#/" />
        <LanguageSelect
          label="I am learning"
          value={data.settings.targetLang}
          exclude={data.profile.nativeLang}
          onChange={(code) => updateSettings({ targetLang: code })}
        />
        <nav className="sidebar__nav" aria-label="Main">
          {NAV.map((item) => (
            <a key={item.id} href={item.href} className={`nav-link ${page === item.id ? 'is-active' : ''}`} aria-current={page === item.id ? 'page' : undefined}>
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === 'flashcards' && due > 0 && <span className="nav-link__badge">{due}</span>}
            </a>
          ))}
          <button type="button" className={`nav-link nav-link--button ${translator.mode === 'open' ? 'is-active' : ''}`} onClick={() => translator.open()} aria-haspopup="dialog">
            <LuLanguages aria-hidden="true" />
            <span>Lingua Translate</span>
          </button>
        </nav>
        <div className="sidebar__foot">
          <a className="tutor-status" href="#/settings">
            <span className={`tutor-status__dot tutor-status__dot--${known ? 'ready' : 'checking'}`} aria-hidden="true" />
            <span>
              <strong>{known ? 'AI tutor is ready' : 'Connecting to your tutor'}</strong>
              <small>{!known ? 'One moment' : server ? (status.label ?? 'Google Gemini') : paused ? 'Free AI services (Gemini quota used up)' : 'Free AI services, no account'}</small>
            </span>
          </a>
          <a href="#/settings" className={`nav-link ${page === 'settings' ? 'is-active' : ''}`}>
            <LuSettings aria-hidden="true" />
            <span>Settings</span>
          </a>
          <a href="#/profile" className={`profile-link ${page === 'profile' ? 'is-active' : ''}`}>
            <Avatar name={data.profile.name} hue={data.profile.avatarHue} size={34} />
            <span>
              <strong>{data.profile.name || 'Your profile'}</strong>
              <small>Level {data.settings.level}</small>
            </span>
          </a>
        </div>
      </aside>

      <header className="topbar">
        <Logo href="#/" />
        <div className="topbar__actions">
          <button type="button" className="icon-btn" onClick={() => translator.open()} aria-label="Lingua Translate" aria-haspopup="dialog">
            <LuLanguages />
          </button>
          <a href="#/progress" className="icon-btn" aria-label="Progress">
            <LuChartColumn />
          </a>
          <a href="#/settings" className="icon-btn" aria-label="Settings">
            <LuSettings />
          </a>
          <a href="#/profile" aria-label="Profile">
            <Avatar name={data.profile.name} hue={data.profile.avatarHue} size={32} />
          </a>
        </div>
      </header>

      <main className="main" id="main">
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.filter((item) => item.mobile).map((item) => (
          <a key={item.id} href={item.href} className={`tabbar__item ${page === item.id ? 'is-active' : ''}`} aria-current={page === item.id ? 'page' : undefined}>
            <span className="tabbar__icon">
              <item.icon aria-hidden="true" />
              {item.id === 'flashcards' && due > 0 && <i className="tabbar__dot" />}
            </span>
            <span>{item.short}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
