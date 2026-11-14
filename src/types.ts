export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Theme = 'system' | 'light' | 'dark';
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface Language {
  code: string;
  /** English name */
  name: string;
  /** Name in the language itself */
  nativeName: string;
  /** Imported SVG asset URL */
  flag: string;
  /** Why this flag stands for the language, shown as a tooltip where relevant */
  flagNote?: string;
  /** BCP 47 tag used for speech synthesis */
  speech: string;
  /** Fallback speech tag when no voice exists for the language (e.g. Latin) */
  speechFallback?: string;
  /** LanguageTool code – undefined when LanguageTool does not cover the language */
  grammar?: string;
  /** MyMemory language code */
  translate: string;
  /** false when browsers offer no speech recognition for the language */
  recognition?: false;
  rtl?: boolean;
  hello: string;
}

export interface CorrectionIssue {
  original: string;
  replacement: string;
  note: string;
}

export interface Correction {
  status: 'ok' | 'fixed' | 'unavailable';
  corrected?: string;
  issues: CorrectionIssue[];
  source: 'ai' | 'languagetool';
  /** Explains an "unavailable" result */
  note?: string;
  /** One encouraging sentence about what the learner did well (AI only) */
  praise?: string;
  /** A more natural way to say the same thing (AI only) */
  alternative?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  createdAt: number;
  /** learner messages spoken in Live Speaking (transcribed by the browser) */
  via?: 'voice';
  /** tutor messages: which AI service and model wrote it */
  model?: string;
  /** tutor messages; 'script' only exists on messages saved by LinguaAI 2.0/2.1 */
  source?: 'ai' | 'script';
  translation?: string;
  correction?: Correction;
}

export interface Conversation {
  id: string;
  title: string;
  lang: string;
  level: Level;
  scenarioId: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface Srs {
  reps: number;
  lapses: number;
  /** days */
  interval: number;
  ease: number;
  due: number;
}

export interface VocabItem {
  id: string;
  lang: string;
  term: string;
  translation: string;
  example?: string;
  createdAt: number;
  srs: Srs;
}

export interface DayActivity {
  messages: number;
  reviews: number;
  correct: number;
  words: number;
  checked: number;
  clean: number;
}

export interface Profile {
  name: string;
  nativeLang: string;
  avatarHue: number;
  dailyGoal: number;
  joinedAt: number;
}

export interface Settings {
  targetLang: string;
  level: Level;
  theme: Theme;
  autoCorrect: boolean;
  autoSpeak: boolean;
  speechRate: number;
  /** voiceURI per language code */
  voices: Record<string, string>;
  /** Live Speaking: start listening automatically when the tutor has finished speaking */
  handsFree: boolean;
}

export interface AppData {
  version: 2;
  onboarded: boolean;
  profile: Profile;
  settings: Settings;
  conversations: Conversation[];
  vocab: VocabItem[];
  activity: Record<string, DayActivity>;
}
