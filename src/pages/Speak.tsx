import { useCallback, useEffect, useRef, useState } from 'react';
import { LuCircleAlert, LuInfo, LuLoaderCircle, LuMic, LuSquare, LuVolume2 } from 'react-icons/lu';
import type { ChatMessage, Conversation } from '../types';
import { getLevel } from '../data/languages';
import { isIOS, isPhoneOrTablet, MicrophoneError, openMicrophone, type Microphone } from '../services/microphone';
import { listen, recognitionSupported, type Listener, type RecognitionProblem } from '../services/recognition';
import { speechSupported } from '../services/speech';
import { useCountdown, useSpeech } from '../lib/hooks';
import { useConversation } from '../lib/useConversation';
import { useStore } from '../state/store';
import { Flag, Toggle } from '../components/ui';
import { Feedback, TurnErrorNotice } from '../components/Feedback';
import { ModeSwitch } from '../components/ModeSwitch';
import { Visualizer, type VoicePhase } from '../components/Visualizer';
import { StartView } from './Chat';

export function Speak({ conversationId }: { conversationId?: string }) {
  const { data } = useStore();
  const conversation = data.conversations.find((c) => c.id === conversationId);
  return (
    <div className="speak">
      {conversation ? <Session key={conversation.id} conversation={conversation} /> : <StartView mode="speak" missing={Boolean(conversationId)} />}
    </div>
  );
}

interface Notice {
  kind: 'error' | 'info';
  title: string;
  text: string;
}

const MIC_DENIED: Notice = {
  kind: 'error',
  title: 'The microphone is blocked',
  text: 'Allow microphone access for this site (the icon at the left of the address bar, or your browser’s site settings), then press the microphone again.',
};

function recognitionNotice(problem: RecognitionProblem | null, language: string): Notice {
  switch (problem) {
    case 'denied':
      return MIC_DENIED;
    case 'service-off':
      return {
        kind: 'error',
        title: 'Speech recognition is switched off on this device',
        text: isIOS()
          ? 'On iPhone and iPad it uses Apple’s dictation. Turn on Dictation (Settings → General → Keyboard) and Siri, then press the microphone again.'
          : 'The browser’s speech service is disabled. Check the browser’s privacy settings, or continue this conversation in Chat.',
      };
    case 'no-microphone':
      return { kind: 'error', title: 'No microphone found', text: 'Connect or enable a microphone, then press the microphone button again.' };
    case 'network':
      return {
        kind: 'error',
        title: 'Speech recognition is offline',
        text: 'Your browser turns speech into text through an online service and could not reach it. Check your connection and try again.',
      };
    case 'language':
      return {
        kind: 'error',
        title: `${language} is not supported here`,
        text: `This browser has no speech recognition for ${language}. Try Chrome or Edge, or continue this conversation in Chat.`,
      };
    case 'other':
      return { kind: 'error', title: 'Speech recognition stopped', text: 'Something interrupted the recording. Press the microphone to try again.' };
    default:
      return { kind: 'info', title: 'Nothing heard', text: `Press the microphone and answer in ${language}. Take your time.` };
  }
}

const PHASE_TEXT: Record<VoicePhase, string> = {
  idle: 'Ready when you are',
  speaking: 'Your tutor is speaking',
  listening: 'Listening',
  thinking: 'Thinking about what you said',
  waiting: 'Your turn',
};

function Session({ conversation }: { conversation: Conversation }) {
  const { data, updateSettings } = useStore();
  const speech = useSpeech();
  const level = getLevel(conversation.level);
  // Safari on iPhone and iPad only opens the microphone in response to a tap
  const ios = isIOS();
  const handsFree = data.settings.handsFree && !ios;

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [microphone, setMicrophone] = useState<Microphone | null>(null);

  const listenerRef = useRef<Listener | null>(null);
  const microphoneRef = useRef<Microphone | null>(null);
  const activeRef = useRef(false);
  /** true while a tutor line is being read and the microphone should open afterwards */
  const listenAfterSpeech = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const handlers = useRef<{ speakLine: (m: ChatMessage) => void }>({ speakLine: () => undefined });

  const tutor = useConversation(conversation, {
    voice: true,
    active,
    onTutorMessage: (message) => handlers.current.speakLine(message),
  });
  const { lang, pending, error, send } = tutor;
  const wait = useCountdown(error?.retryAt ?? null);

  const { messages } = conversation;
  const last = messages[messages.length - 1];
  const lastTutor = [...messages].reverse().find((m) => m.role === 'tutor');
  const canRecognise = recognitionSupported() && lang.recognition !== false;

  const phase: VoicePhase = !active ? 'idle' : listening ? 'listening' : pending ? 'thinking' : speech.speakingId ? 'speaking' : 'waiting';

  /* ----- listening ----- */

  const beginListening = useCallback(() => {
    if (!activeRef.current || listenerRef.current) return;
    setNotice(null);
    setInterim('');
    const listener = listen({
      lang: lang.speech,
      continuous: !isPhoneOrTablet(),
      silenceMs: 2400,
      onInterim: setInterim,
      onEnd: (text, problem) => {
        listenerRef.current = null;
        setListening(false);
        setInterim('');
        if (!activeRef.current) return;
        if (text) send(text);
        else setNotice(recognitionNotice(problem, lang.name));
      },
    });
    if (!listener) {
      setNotice(recognitionNotice('other', lang.name));
      return;
    }
    listenerRef.current = listener;
    setListening(true);
  }, [lang.speech, lang.name, send]);

  /* ----- tutor speech ----- */

  const speakLine = useCallback(
    (message: ChatMessage) => {
      if (!activeRef.current) return;
      listenAfterSpeech.current = handsFree;
      const started = speech.say(message.id, message.text, lang);
      // no voice for this language: the line stays on screen and the learner answers
      if (!started) {
        listenAfterSpeech.current = false;
        if (handsFree) beginListening();
      }
    },
    [speech, lang, handsFree, beginListening],
  );
  handlers.current.speakLine = speakLine;

  // when the tutor has finished speaking, the floor goes to the learner
  const wasSpeaking = useRef<string | null>(null);
  useEffect(() => {
    if (wasSpeaking.current && !speech.speakingId && listenAfterSpeech.current) {
      listenAfterSpeech.current = false;
      beginListening();
    }
    wasSpeaking.current = speech.speakingId;
  }, [speech.speakingId, beginListening]);

  /* ----- session control ----- */

  const start = async () => {
    // must happen inside the tap itself: unlocks spoken replies on iPhone and iPad
    speech.unlock();
    setNotice(null);
    setStarting(true);
    let mic: Microphone | null = null;
    try {
      // on iOS the recogniser asks for the microphone itself; a second request here only causes a second prompt
      if (!ios) mic = await openMicrophone(!isPhoneOrTablet());
    } catch (err) {
      const problem = err instanceof MicrophoneError ? err.problem : 'other';
      if (problem === 'denied') {
        setNotice(MIC_DENIED);
        setStarting(false);
        return;
      }
      if (problem === 'no-microphone') {
        setNotice(recognitionNotice('no-microphone', lang.name));
        setStarting(false);
        return;
      }
      // no permission API here: the browser asks when recognition starts
    }
    microphoneRef.current = mic;
    setMicrophone(mic);
    activeRef.current = true;
    setActive(true);
    setStarting(false);
    // picking up an existing conversation: repeat the tutor's last line, then listen
    if (last?.role === 'tutor') speakLine(last);
  };

  const end = useCallback(() => {
    activeRef.current = false;
    listenAfterSpeech.current = false;
    listenerRef.current?.abort();
    listenerRef.current = null;
    microphoneRef.current?.close();
    microphoneRef.current = null;
    setMicrophone(null);
    setListening(false);
    setInterim('');
    setActive(false);
    speech.stop();
  }, [speech]);

  const endRef = useRef(end);
  endRef.current = end;
  useEffect(() => () => endRef.current(), []);

  const onMic = () => {
    if (!active) {
      void start();
    } else if (listening) {
      listenerRef.current?.stop();
    } else if (speech.speakingId) {
      listenAfterSpeech.current = false;
      speech.stop();
      beginListening();
    } else if (!pending) {
      beginListening();
    }
  };

  const repeat = () => {
    if (!lastTutor) return;
    listenerRef.current?.abort();
    listenerRef.current = null;
    setListening(false);
    if (active) speakLine(lastTutor);
    else speech.say(lastTutor.id, lastTutor.text, lang);
  };

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, last?.correction, interim]);

  const micLabel = !active
    ? 'Start speaking'
    : listening
      ? 'Finish my answer'
      : speech.speakingId
        ? 'Interrupt and answer'
        : pending
          ? 'The tutor is thinking'
          : 'Answer now';

  const caption =
    phase === 'listening'
      ? interim || `Speak ${lang.name} now…`
      : phase === 'thinking'
        ? (last?.role === 'user' ? last.text : '')
        : (lastTutor?.text ?? `Press the microphone. Your tutor starts with a question in ${lang.name}.`);

  return (
    <>
      <header className="chat__head">
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
        <ModeSwitch mode="speak" conversationId={conversation.id} />
      </header>

      <div className="speak__body">
        <section className={`stage stage--${phase}`} aria-label="Live Speaking">
          {!canRecognise ? (
            <div className="stage__blocked">
              <LuCircleAlert aria-hidden="true" />
              <h2>{lang.recognition === false ? `No speech recognition for ${lang.name}` : 'This browser cannot listen'}</h2>
              <p>
                {lang.recognition === false
                  ? `Browsers do not offer speech recognition for ${lang.name}, so Live Speaking cannot understand spoken answers in it.`
                  : 'Live Speaking needs the browser’s speech recognition, which Firefox and some other browsers do not provide. Open LinguaAI in Chrome, Edge or Safari.'}
              </p>
              <a className="btn btn--primary" href={`#/chat/${conversation.id}`}>
                Continue in Chat
              </a>
            </div>
          ) : (
            <>
              <p className="stage__phase" role="status">
                {phase === 'thinking' && <LuLoaderCircle className="spin" aria-hidden="true" />}
                {PHASE_TEXT[phase]}
              </p>

              <Visualizer phase={phase} microphone={microphone} />

              <p className={`stage__caption ${phase === 'listening' && !interim ? 'is-hint' : ''}`} lang={lang.code} dir={lang.rtl ? 'rtl' : 'ltr'}>
                {caption}
              </p>

              <div className="stage__controls">
                <button type="button" className="stage__side" onClick={repeat} disabled={!lastTutor || pending || !speechSupported()}>
                  <LuVolume2 aria-hidden="true" />
                  <span>Repeat</span>
                </button>
                <button type="button" className={`micbtn micbtn--${phase}`} onClick={onMic} disabled={starting || (active && pending && !listening)} aria-label={micLabel} title={micLabel}>
                  {starting ? <LuLoaderCircle className="spin" /> : listening ? <LuSquare /> : <LuMic />}
                </button>
                <button type="button" className="stage__side" onClick={end} disabled={!active}>
                  <LuSquare aria-hidden="true" />
                  <span>End</span>
                </button>
              </div>
              <p className="stage__hint">{micLabel}</p>

              {notice && (
                <div className={`notice ${notice.kind === 'error' ? 'notice--warn' : ''} stage__notice`} role={notice.kind === 'error' ? 'alert' : 'status'}>
                  {notice.kind === 'error' ? <LuCircleAlert aria-hidden="true" /> : <LuInfo aria-hidden="true" />}
                  <span>
                    <strong>{notice.title}.</strong> {notice.text}
                  </span>
                </div>
              )}

              {speech.blocked && (
                <div className="notice stage__notice" role="status">
                  <LuInfo aria-hidden="true" />
                  <span>
                    <strong>The browser did not start the audio by itself.</strong> Press “Repeat” to hear your tutor.
                  </span>
                </div>
              )}

              {error && <TurnErrorNotice error={error} wait={wait} onRetry={tutor.retry} />}

              <div className="stage__options">
                {ios ? (
                  <p className="stage__ios">
                    <LuInfo aria-hidden="true" />
                    On iPhone and iPad, press the microphone for each answer and press it again when you have finished: Safari only opens the microphone
                    after a tap.
                  </p>
                ) : (
                  <Toggle
                    label="Hands-free"
                    hint="The microphone opens by itself when the tutor has finished speaking."
                    checked={handsFree}
                    onChange={(v) => updateSettings({ handsFree: v })}
                  />
                )}
              </div>
            </>
          )}
        </section>

        <aside className="transcript" aria-label="Conversation transcript">
          <div className="transcript__head">
            <h2>Transcript</h2>
            <a href={`#/chat/${conversation.id}`}>Open in Chat</a>
          </div>
          <div className="transcript__scroll" ref={transcriptRef}>
            {messages.length === 0 && !pending ? (
              <p className="transcript__empty">What you and your tutor say appears here, with feedback on each of your answers.</p>
            ) : (
              <div className="thread thread--compact" aria-live="polite">
                {messages.map((m) =>
                  m.role === 'tutor' ? (
                    <div className="msg msg--tutor" key={m.id}>
                      <div className="bubble" lang={lang.code} dir={lang.rtl ? 'rtl' : 'ltr'}>
                        <p>{m.text}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="msg msg--user" key={m.id}>
                      <div className="bubble" dir="auto">
                        <p>{m.text}</p>
                      </div>
                      {!(pending && m.id === last?.id && !m.correction) && (
                        <Feedback
                          message={m}
                          lang={lang}
                          checking={tutor.checking.has(m.id)}
                          onCheck={() => void tutor.check(m.id, m.text, m.via === 'voice')}
                          speakingId={speech.speakingId}
                          onSpeak={(id, text) => {
                            listenAfterSpeech.current = false;
                            speech.say(id, text, lang);
                          }}
                        />
                      )}
                    </div>
                  ),
                )}
                {listening && interim && (
                  <div className="msg msg--user msg--live">
                    <div className="bubble" dir="auto">
                      <p>{interim}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="transcript__note">
            <LuInfo aria-hidden="true" />
            Feedback covers grammar and word choice of what your browser’s speech recognition understood. LinguaAI does not hear your accent and gives no
            pronunciation score.
          </p>
        </aside>
      </div>
    </>
  );
}
