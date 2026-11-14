import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  LuArrowUp,
  LuBookmarkPlus,
  LuCopy,
  LuLanguages,
  LuLoaderCircle,
  LuMessageSquarePlus,
  LuMic,
  LuPanelLeft,
  LuSquare,
  LuTrash2,
  LuVolume2,
  LuX,
} from 'react-icons/lu';
import type { ChatMessage, Conversation, Language } from '../types';
import { getLanguage, getLevel } from '../data/languages';
import { SCENARIOS } from '../data/scenarios';
import { errorText } from '../services/ai';
import { translateText } from '../services/tutor';
import { clockTime, relativeTime, segmentWords } from '../lib/util';
import { navigate, useCountdown, useSpeech, useToast } from '../lib/hooks';
import { useConversation } from '../lib/useConversation';
import { useStore } from '../state/store';
import { ConfirmDialog, Dots, Flag, LanguageSelect, LevelSelect } from '../components/ui';
import { Feedback, TurnErrorNotice } from '../components/Feedback';
import { ModeSwitch } from '../components/ModeSwitch';

/** First messages typed on the Today page wait here until the conversation view sends them. */
const queuedDrafts = new Map<string, string>();

export function queueFirstMessage(conversationId: string, text: string): void {
  queuedDrafts.set(conversationId, text);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function Chat({ conversationId }: { conversationId?: string }) {
  const { data } = useStore();
  const [listOpen, setListOpen] = useState(false);
  const conversation = data.conversations.find((c) => c.id === conversationId);

  useEffect(() => setListOpen(false), [conversationId]);

  return (
    <div className={`chat ${listOpen ? 'chat--list-open' : ''}`}>
      <ConversationList activeId={conversation?.id} onClose={() => setListOpen(false)} />
      {listOpen && <button type="button" className="chat__scrim" aria-label="Close conversation list" onClick={() => setListOpen(false)} />}
      <section className="chat__main">
        {conversation ? (
          <ConversationView key={conversation.id} conversation={conversation} onOpenList={() => setListOpen(true)} />
        ) : (
          <StartView mode="chat" missing={Boolean(conversationId)} onOpenList={() => setListOpen(true)} />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversation history                                                */
/* ------------------------------------------------------------------ */

function ConversationList({ activeId, onClose }: { activeId?: string; onClose: () => void }) {
  const { data } = useStore();
  const sorted = useMemo(() => [...data.conversations].sort((a, b) => b.updatedAt - a.updatedAt), [data.conversations]);

  return (
    <aside className="chat__list" aria-label="Conversation history">
      <div className="chat__list-head">
        <h2>History</h2>
        <button type="button" className="icon-btn chat__list-close" onClick={onClose} aria-label="Close">
          <LuX />
        </button>
      </div>
      <a className="btn btn--primary btn--block" href="#/chat" onClick={onClose}>
        <LuMessageSquarePlus aria-hidden="true" />
        New conversation
      </a>
      {sorted.length === 0 ? (
        <p className="chat__list-empty">Your conversations will be kept here so you can pick them up again.</p>
      ) : (
        <ul className="history">
          {sorted.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <li key={c.id}>
                <a href={`#/chat/${c.id}`} className={`history__item ${c.id === activeId ? 'is-active' : ''}`} onClick={onClose}>
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
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Start a conversation (shared by AI Chat and Live Speaking)          */
/* ------------------------------------------------------------------ */

interface StartViewProps {
  mode: 'chat' | 'speak';
  missing: boolean;
  onOpenList?: () => void;
}

export function StartView({ mode, missing, onOpenList }: StartViewProps) {
  const { data, target, updateSettings, createConversation } = useStore();
  const start = (scenarioId: string) => {
    const id = createConversation({ scenarioId, lang: data.settings.targetLang, level: data.settings.level });
    navigate(`/${mode}/${id}`);
  };

  return (
    <div className="start">
      <div className="start__inner">
        <div className="start__top">
          <ModeSwitch mode={mode} />
          {onOpenList && (
            <button type="button" className="btn btn--ghost btn--small start__history" onClick={onOpenList}>
              <LuPanelLeft aria-hidden="true" />
              History
            </button>
          )}
        </div>
        {missing && <p className="notice notice--warn">That conversation no longer exists. Start a new one below.</p>}
        <h1 className="display" lang={target.code} dir={target.rtl ? 'rtl' : 'ltr'}>
          {target.hello}!
        </h1>
        <p className="lede">
          {mode === 'speak'
            ? `Choose a scene and talk it through out loud. Your tutor asks in ${target.name}, listens to your answer and tells you how to say it better.`
            : `Choose what to talk about. Your tutor opens the conversation in ${target.name}, and you answer in your own words.`}
        </p>

        <div className="start__setup">
          <LanguageSelect label="Language" value={data.settings.targetLang} exclude={data.profile.nativeLang} onChange={(code) => updateSettings({ targetLang: code })} />
          <LevelSelect value={data.settings.level} onChange={(level) => updateSettings({ level })} />
        </div>

        <ul className="scenarios">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button type="button" className="scenario" onClick={() => start(s.id)}>
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </button>
            </li>
          ))}
        </ul>

      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One conversation                                                    */
/* ------------------------------------------------------------------ */

interface PickedWord {
  messageId: string;
  term: string;
  translation: string;
  loading: boolean;
  error?: string;
}

function ConversationView({ conversation, onOpenList }: { conversation: Conversation; onOpenList: () => void }) {
  const { data, native, patchMessage, deleteConversation, addVocab } = useStore();
  const toast = useToast();
  const speech = useSpeech();
  const level = getLevel(conversation.level);
  const { autoCorrect, autoSpeak } = data.settings;

  const [draft, setDraft] = useState('');
  const [translating, setTranslating] = useState<Set<string>>(() => new Set());
  const [shownTranslations, setShownTranslations] = useState<Set<string>>(() => new Set());
  const [pickMode, setPickMode] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedWord | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sayRef = useRef(speech.say);
  sayRef.current = speech.say;

  const hasQueuedDraft = queuedDrafts.has(conversation.id);
  const tutor = useConversation(conversation, {
    active: !hasQueuedDraft,
    onTutorMessage: (message) => {
      if (autoSpeak) sayRef.current(message.id, message.text, getLanguage(conversation.lang));
    },
  });
  const { lang, server, pending, error, send } = tutor;
  const wait = useCountdown(error?.retryAt ?? null);

  const { messages } = conversation;
  const last = messages[messages.length - 1];

  // a first message typed on the Today page
  useEffect(() => {
    const queued = queuedDrafts.get(conversation.id);
    if (queued !== undefined) {
      queuedDrafts.delete(conversation.id);
      send(queued);
    }
  }, [conversation.id, send]);

  // keep the newest message in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, error, last?.correction]);

  /* ----- message tools ----- */

  const toggleTranslation = async (m: ChatMessage) => {
    if (shownTranslations.has(m.id)) {
      setShownTranslations((s) => {
        const next = new Set(s);
        next.delete(m.id);
        return next;
      });
      return;
    }
    if (!m.translation) {
      setTranslating((s) => new Set(s).add(m.id));
      try {
        const translation = await translateText(server, m.text, lang, native);
        patchMessage(conversation.id, m.id, { translation });
      } catch (err) {
        toast(errorText(err), 'error');
        return;
      } finally {
        setTranslating((s) => {
          const next = new Set(s);
          next.delete(m.id);
          return next;
        });
      }
    }
    setShownTranslations((s) => new Set(s).add(m.id));
  };

  const pickWord = async (m: ChatMessage, term: string) => {
    setPicked({ messageId: m.id, term, translation: '', loading: true });
    try {
      const translation = await translateText(server, term, lang, native);
      setPicked((p) => (p && p.term === term && p.messageId === m.id ? { ...p, translation, loading: false } : p));
    } catch (err) {
      setPicked((p) => (p && p.term === term && p.messageId === m.id ? { ...p, loading: false, error: errorText(err) } : p));
    }
  };

  const savePicked = (m: ChatMessage) => {
    if (!picked) return;
    const added = addVocab({
      lang: lang.code,
      term: picked.term,
      translation: picked.translation,
      example: m.text.length <= 180 ? m.text : undefined,
    });
    toast(added ? `Saved “${picked.term}” to your vocabulary` : `“${picked.term}” is already in your vocabulary`, added ? 'success' : 'info');
    setPicked(null);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied', 'success');
    } catch {
      toast('Copying is blocked by the browser.', 'error');
    }
  };

  const translateDraft = async () => {
    if (!draft.trim()) return;
    setDraftBusy(true);
    try {
      setDraft(await translateText(server, draft, native, lang));
      inputRef.current?.focus();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setDraftBusy(false);
    }
  };

  const submit = () => {
    if (!draft.trim() || pending) return;
    send(draft);
    setDraft('');
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const remove = () => {
    speech.stop();
    deleteConversation(conversation.id);
    navigate('/chat');
  };

  return (
    <>
      <header className="chat__head">
        <button type="button" className="icon-btn chat__head-list" onClick={onOpenList} aria-label="Conversation history">
          <LuPanelLeft />
        </button>
        <Flag code={lang.code} size="lg" explain />
        <div className="chat__head-title">
          <h1>{conversation.title}</h1>
          <p>
            <span>{lang.name}</span>
            <span className="chip chip--level" title={`${level.name} – ${level.summary}`}>
              {level.id} {level.name}
            </span>
          </p>
        </div>
        <ModeSwitch mode="chat" conversationId={conversation.id} />
        <button type="button" className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete conversation">
          <LuTrash2 />
        </button>
      </header>

      <div className="chat__scroll" ref={scrollRef}>
        <div className="thread" aria-live="polite">
          <p className="thread__day">
            {new Date(conversation.createdAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>

          {messages.map((m) =>
            m.role === 'tutor' ? (
              <TutorMessage
                key={m.id}
                message={m}
                lang={lang}
                native={native}
                speaking={speech.speakingId === m.id}
                onSpeak={() => speech.say(m.id, m.text, lang)}
                translationShown={shownTranslations.has(m.id)}
                translating={translating.has(m.id)}
                onTranslate={() => void toggleTranslation(m)}
                picking={pickMode === m.id}
                onTogglePick={() => {
                  setPickMode((id) => (id === m.id ? null : m.id));
                  setPicked(null);
                }}
                picked={picked?.messageId === m.id ? picked : null}
                onPickWord={(term) => void pickWord(m, term)}
                onSavePicked={() => savePicked(m)}
                onCopy={() => void copy(m.text)}
              />
            ) : (
              <div className="msg msg--user" key={m.id}>
                <div className="bubble" dir="auto">
                  {m.via === 'voice' && <LuMic className="bubble__voice" aria-label="Spoken in Live Speaking" />}
                  <p>{m.text}</p>
                </div>
                {/* while the tutor is answering, feedback for the latest message is on its way with the reply */}
                {!(pending && m.id === last?.id && !m.correction && (autoCorrect || m.via === 'voice')) && (
                  <Feedback
                    message={m}
                    lang={lang}
                    checking={tutor.checking.has(m.id)}
                    onCheck={() => void tutor.check(m.id, m.text, m.via === 'voice')}
                    speakingId={speech.speakingId}
                    onSpeak={(id, text) => speech.say(id, text, lang)}
                  />
                )}
              </div>
            ),
          )}

          {pending && (
            <div className="msg msg--tutor msg--typing" aria-label="The tutor is writing">
              <div className="bubble">
                <Dots />
              </div>
            </div>
          )}

          {error && <TurnErrorNotice error={error} wait={wait} onRetry={tutor.retry} />}

        </div>
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="composer__box">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Write in ${lang.name}…`}
            aria-label={`Your message in ${lang.name}`}
            dir="auto"
          />
          {native.code !== lang.code && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => void translateDraft()}
              disabled={!draft.trim() || draftBusy}
              title={`Wrote it in ${native.name}? Translate your draft into ${lang.name}`}
              aria-label={`Translate draft from ${native.name} into ${lang.name}`}
            >
              {draftBusy ? <LuLoaderCircle className="spin" /> : <LuLanguages />}
            </button>
          )}
          <a className="icon-btn" href={`#/speak/${conversation.id}`} title="Continue this conversation by voice" aria-label="Continue this conversation in Live Speaking">
            <LuMic />
          </a>
          <button type="submit" className="composer__send" disabled={!draft.trim() || pending} aria-label="Send message">
            <LuArrowUp />
          </button>
        </div>
        <p className="composer__hint">
          Enter sends, Shift + Enter starts a new line.{' '}
          {autoCorrect ? `Your tutor reviews each message for level ${level.id}.` : 'Automatic feedback is off – use “Check” under a message.'}
        </p>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this conversation?"
          message="The messages and their feedback will be removed from this device. Saved vocabulary stays."
          confirmLabel="Delete conversation"
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tutor message                                                       */
/* ------------------------------------------------------------------ */

interface TutorMessageProps {
  message: ChatMessage;
  lang: Language;
  native: Language;
  speaking: boolean;
  onSpeak: () => void;
  translationShown: boolean;
  translating: boolean;
  onTranslate: () => void;
  picking: boolean;
  onTogglePick: () => void;
  picked: PickedWord | null;
  onPickWord: (term: string) => void;
  onSavePicked: () => void;
  onCopy: () => void;
}

function TutorMessage(props: TutorMessageProps) {
  const { message: m, lang, native, picking, picked } = props;
  const segments = useMemo(() => (picking ? segmentWords(m.text, lang.speech) : []), [picking, m.text, lang.speech]);

  return (
    <div className="msg msg--tutor">
      <div className="bubble" lang={lang.code} dir={lang.rtl ? 'rtl' : 'ltr'}>
        {picking ? (
          <p className="bubble__words">
            {segments.map((s, i) =>
              s.word ? (
                <button key={i} type="button" className={`word ${picked?.term === s.text ? 'is-picked' : ''}`} onClick={() => props.onPickWord(s.text)}>
                  {s.text}
                </button>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        ) : (
          <p>{m.text}</p>
        )}
        {props.translationShown && m.translation && (
          <p className="bubble__translation" lang={native.code} dir={native.rtl ? 'rtl' : 'ltr'}>
            {m.translation}
          </p>
        )}
      </div>

      {picking && (
        <div className="wordsheet">
          {picked ? (
            <>
              <div className="wordsheet__pair">
                <strong lang={lang.code}>{picked.term}</strong>
                <span>{picked.loading ? 'Translating…' : picked.error ? picked.error : picked.translation}</span>
              </div>
              <button type="button" className="btn btn--small btn--primary" onClick={props.onSavePicked} disabled={picked.loading}>
                <LuBookmarkPlus aria-hidden="true" />
                Save word
              </button>
            </>
          ) : (
            <span className="wordsheet__hint">Tap a word in the message to translate and save it.</span>
          )}
        </div>
      )}

      <div className="msg__tools">
        <button type="button" className={`tool ${props.speaking ? 'is-active' : ''}`} onClick={props.onSpeak}>
          {props.speaking ? <LuSquare aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
          {props.speaking ? 'Stop' : 'Listen'}
        </button>
        {native.code !== lang.code && (
          <button type="button" className={`tool ${props.translationShown ? 'is-active' : ''}`} onClick={props.onTranslate} disabled={props.translating}>
            {props.translating ? <LuLoaderCircle className="spin" aria-hidden="true" /> : <LuLanguages aria-hidden="true" />}
            {props.translationShown ? 'Hide translation' : 'Translate'}
          </button>
        )}
        <button type="button" className={`tool ${picking ? 'is-active' : ''}`} onClick={props.onTogglePick}>
          <LuBookmarkPlus aria-hidden="true" />
          {picking ? 'Done' : 'Save words'}
        </button>
        <button type="button" className="tool tool--icon" onClick={props.onCopy} aria-label="Copy message">
          <LuCopy aria-hidden="true" />
        </button>
        <time className="msg__time" title={m.model ? `Written by ${m.model}` : undefined}>
          {m.source === 'script' ? 'Scripted line, ' : ''}
          {clockTime(m.createdAt)}
        </time>
      </div>
    </div>
  );
}
