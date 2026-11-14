import { useEffect, type ReactNode } from 'react';
import { useRoute } from './lib/hooks';
import { useStore } from './state/store';
import { Shell } from './components/Shell';
import { Onboarding } from './components/Onboarding';
import { LinguaTranslate } from './components/LinguaTranslate';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { Speak } from './pages/Speak';
import { Vocabulary } from './pages/Vocabulary';
import { Flashcards } from './pages/Flashcards';
import { Progress } from './pages/Progress';
import { SettingsPage } from './pages/Settings';
import { ProfilePage } from './pages/Profile';

export default function App() {
  const { data } = useStore();
  const route = useRoute();
  const page = route[0] ?? 'home';
  const { theme } = data.settings;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  let content: ReactNode;
  switch (page) {
    case 'chat':
      content = <Chat conversationId={route[1]} />;
      break;
    case 'speak':
      content = <Speak conversationId={route[1]} />;
      break;
    case 'vocabulary':
      content = <Vocabulary />;
      break;
    case 'flashcards':
      content = <Flashcards />;
      break;
    case 'progress':
      content = <Progress />;
      break;
    case 'settings':
      content = <SettingsPage />;
      break;
    case 'profile':
      content = <ProfilePage />;
      break;
    default:
      content = <Dashboard />;
  }

  return (
    <>
      <Shell page={page}>{content}</Shell>
      <LinguaTranslate />
      {!data.onboarded && <Onboarding />}
    </>
  );
}
