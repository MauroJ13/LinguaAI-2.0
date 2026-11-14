import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AppData,
  ChatMessage,
  Conversation,
  DayActivity,
  Grade,
  Language,
  Level,
  Profile,
  Settings,
  VocabItem,
} from '../types';
import { getLanguage } from '../data/languages';
import { getScenario } from '../data/scenarios';
import { dayKey, EMPTY_DAY, newSrs, reviewSrs, uid } from '../lib/util';

const STORAGE_KEY = 'linguaai.v2';

function defaultData(): AppData {
  return {
    version: 2,
    onboarded: false,
    profile: { name: '', nativeLang: 'en', avatarHue: 252, dailyGoal: 20, joinedAt: Date.now() },
    settings: {
      targetLang: 'es',
      level: 'A2',
      theme: 'system',
      autoCorrect: true,
      autoSpeak: false,
      speechRate: 0.95,
      voices: {},
      handsFree: true,
    },
    conversations: [],
    vocab: [],
    activity: {},
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merges stored or imported data over the defaults so missing fields never crash the app. */
export function normalizeData(raw: unknown): AppData | null {
  if (!isRecord(raw)) return null;
  const base = defaultData();
  const profile = isRecord(raw.profile) ? (raw.profile as Partial<Profile>) : {};
  // "ai" held browser-stored provider keys in LinguaAI 2.0 – dropped, keys now live on the server only
  const storedSettings: Record<string, unknown> = isRecord(raw.settings) ? { ...raw.settings } : {};
  delete storedSettings.ai;
  const settings = storedSettings as Partial<Settings>;
  return {
    version: 2,
    onboarded: raw.onboarded === true,
    profile: { ...base.profile, ...profile },
    settings: {
      ...base.settings,
      ...settings,
      voices: isRecord(settings.voices) ? (settings.voices as Record<string, string>) : {},
    },
    conversations: Array.isArray(raw.conversations) ? (raw.conversations as Conversation[]) : [],
    vocab: Array.isArray(raw.vocab) ? (raw.vocab as VocabItem[]) : [],
    activity: isRecord(raw.activity) ? (raw.activity as Record<string, DayActivity>) : {},
  };
}

function load(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = normalizeData(JSON.parse(stored));
      if (data) return data;
    }
  } catch {
    /* corrupted or unavailable storage – start fresh */
  }
  return defaultData();
}

export interface NewVocab {
  lang: string;
  term: string;
  translation: string;
  example?: string;
}

interface Store {
  data: AppData;
  target: Language;
  native: Language;
  today: DayActivity;
  completeOnboarding: (profile: Partial<Profile>, settings: Partial<Settings>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  createConversation: (input: { scenarioId: string; lang: string; level: Level }) => string;
  patchConversation: (id: string, patch: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  patchMessage: (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  /** returns false when the word is already saved for that language */
  addVocab: (input: NewVocab) => boolean;
  updateVocab: (id: string, patch: Partial<Pick<VocabItem, 'term' | 'translation' | 'example'>>) => void;
  deleteVocab: (id: string) => void;
  reviewVocab: (id: string, grade: Grade) => void;
  bump: (patch: Partial<DayActivity>) => void;
  replaceAll: (data: AppData) => void;
  resetAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

function bumpActivity(activity: Record<string, DayActivity>, patch: Partial<DayActivity>): Record<string, DayActivity> {
  const key = dayKey();
  const day = { ...EMPTY_DAY, ...activity[key] };
  (Object.keys(patch) as (keyof DayActivity)[]).forEach((k) => {
    day[k] += patch[k] ?? 0;
  });
  return { ...activity, [key]: day };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked – the session still works in memory */
    }
  }, [data]);

  const completeOnboarding = useCallback((profile: Partial<Profile>, settings: Partial<Settings>) => {
    setData((d) => ({
      ...d,
      onboarded: true,
      profile: { ...d.profile, ...profile },
      settings: { ...d.settings, ...settings },
    }));
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setData((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const createConversation = useCallback((input: { scenarioId: string; lang: string; level: Level }) => {
    const id = uid();
    const now = Date.now();
    const conversation: Conversation = {
      id,
      title: getScenario(input.scenarioId).title,
      lang: input.lang,
      level: input.level,
      scenarioId: input.scenarioId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    setData((d) => ({ ...d, conversations: [conversation, ...d.conversations] }));
    return id;
  }, []);

  const patchConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setData((d) => ({
      ...d,
      conversations: d.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setData((d) => ({ ...d, conversations: d.conversations.filter((c) => c.id !== id) }));
  }, []);

  const addMessage = useCallback((conversationId: string, message: ChatMessage) => {
    setData((d) => ({
      ...d,
      conversations: d.conversations.map((c) =>
        c.id === conversationId ? { ...c, updatedAt: message.createdAt, messages: [...c.messages, message] } : c,
      ),
      activity: message.role === 'user' ? bumpActivity(d.activity, { messages: 1 }) : d.activity,
    }));
  }, []);

  const patchMessage = useCallback((conversationId: string, messageId: string, patch: Partial<ChatMessage>) => {
    setData((d) => ({
      ...d,
      conversations: d.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }
          : c,
      ),
    }));
  }, []);

  const addVocab = useCallback(
    (input: NewVocab) => {
      const term = input.term.trim();
      const translation = input.translation.trim();
      if (!term) return false;
      const exists = data.vocab.some((v) => v.lang === input.lang && v.term.toLowerCase() === term.toLowerCase());
      if (exists) return false;
      const item: VocabItem = {
        id: uid(),
        lang: input.lang,
        term,
        translation,
        example: input.example?.trim() || undefined,
        createdAt: Date.now(),
        srs: newSrs(),
      };
      setData((d) => ({ ...d, vocab: [item, ...d.vocab], activity: bumpActivity(d.activity, { words: 1 }) }));
      return true;
    },
    [data.vocab],
  );

  const updateVocab = useCallback((id: string, patch: Partial<Pick<VocabItem, 'term' | 'translation' | 'example'>>) => {
    setData((d) => ({ ...d, vocab: d.vocab.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  }, []);

  const deleteVocab = useCallback((id: string) => {
    setData((d) => ({ ...d, vocab: d.vocab.filter((v) => v.id !== id) }));
  }, []);

  const reviewVocab = useCallback((id: string, grade: Grade) => {
    setData((d) => ({
      ...d,
      vocab: d.vocab.map((v) => (v.id === id ? { ...v, srs: reviewSrs(v.srs, grade) } : v)),
      activity: bumpActivity(d.activity, { reviews: 1, correct: grade === 'again' ? 0 : 1 }),
    }));
  }, []);

  const bump = useCallback((patch: Partial<DayActivity>) => {
    setData((d) => ({ ...d, activity: bumpActivity(d.activity, patch) }));
  }, []);

  const replaceAll = useCallback((next: AppData) => setData(next), []);

  const resetAll = useCallback(() => {
    setData(defaultData());
  }, []);

  const store = useMemo<Store>(
    () => ({
      data,
      target: getLanguage(data.settings.targetLang),
      native: getLanguage(data.profile.nativeLang),
      today: { ...EMPTY_DAY, ...data.activity[dayKey()] },
      completeOnboarding,
      updateProfile,
      updateSettings,
      createConversation,
      patchConversation,
      deleteConversation,
      addMessage,
      patchMessage,
      addVocab,
      updateVocab,
      deleteVocab,
      reviewVocab,
      bump,
      replaceAll,
      resetAll,
    }),
    [
      data,
      completeOnboarding,
      updateProfile,
      updateSettings,
      createConversation,
      patchConversation,
      deleteConversation,
      addMessage,
      patchMessage,
      addVocab,
      updateVocab,
      deleteVocab,
      reviewVocab,
      bump,
      replaceAll,
      resetAll,
    ],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
