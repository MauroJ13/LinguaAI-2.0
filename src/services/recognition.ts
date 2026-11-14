/**
 * Speech-to-text through the browser's SpeechRecognition API (Web Speech API).
 * Available in Chrome, Edge and Safari; not in Firefox. In Chrome and Edge the
 * audio is sent to the browser vendor's speech service, so it needs a
 * connection. This turns speech into text – it does not assess pronunciation.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => Recognition;

function getConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function recognitionSupported(): boolean {
  return Boolean(getConstructor());
}

export type RecognitionProblem = 'denied' | 'service-off' | 'no-speech' | 'no-microphone' | 'network' | 'language' | 'other';

function toProblem(code: string): RecognitionProblem | null {
  switch (code) {
    case 'not-allowed':
      return 'denied';
    case 'service-not-allowed':
      return 'service-off';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'no-microphone';
    case 'network':
      return 'network';
    case 'language-not-supported':
      return 'language';
    case 'aborted':
      return null;
    default:
      return 'other';
  }
}

export interface ListenOptions {
  /** BCP 47 tag of the language being spoken */
  lang: string;
  /** keep listening through pauses (desktop); false ends at the first pause (more reliable on phones) */
  continuous: boolean;
  /** with `continuous`: stop after this much silence once something was said */
  silenceMs: number;
  onInterim: (text: string) => void;
  /** called exactly once; `text` is what was recognised (may be empty) */
  onEnd: (text: string, problem: RecognitionProblem | null) => void;
}

export interface Listener {
  /** finish and deliver what was heard so far */
  stop: () => void;
  /** cancel without delivering anything */
  abort: () => void;
}

export function listen(options: ListenOptions): Listener | null {
  const Ctor = getConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = options.lang;
  recognition.interimResults = true;
  recognition.continuous = options.continuous;
  recognition.maxAlternatives = 1;

  let text = '';
  let problem: RecognitionProblem | null = null;
  let finished = false;
  let cancelled = false;
  let silence = 0;

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(silence);
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    // Safari can keep the microphone open after a session ends; aborting releases it
    try {
      recognition.abort();
    } catch {
      /* already released */
    }
    if (!cancelled) options.onEnd(text.trim(), text.trim() ? null : problem);
  };

  recognition.onresult = (event) => {
    let heard = '';
    for (let i = 0; i < event.results.length; i += 1) heard += event.results[i][0].transcript;
    text = heard.replace(/\s+/g, ' ');
    options.onInterim(text.trim());
    if (options.continuous && text.trim()) {
      window.clearTimeout(silence);
      silence = window.setTimeout(() => recognition.stop(), options.silenceMs);
    }
  };
  recognition.onerror = (event) => {
    problem = toProblem(event.error) ?? problem;
  };
  recognition.onend = finish;

  try {
    recognition.start();
  } catch {
    problem = 'other';
    finish();
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        finish();
      }
    },
    abort: () => {
      cancelled = true;
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
      finish();
    },
  };
}
