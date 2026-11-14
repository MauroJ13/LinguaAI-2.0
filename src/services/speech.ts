import type { Language } from '../types';

/**
 * Text-to-speech through the browser's Web Speech API. Voices come from the
 * operating system / browser, so the available languages differ per device.
 */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function getVoices(): SpeechSynthesisVoice[] {
  return speechSupported() ? window.speechSynthesis.getVoices() : [];
}

function matches(voice: SpeechSynthesisVoice, tag: string): boolean {
  const v = voice.lang.replace('_', '-').toLowerCase();
  const t = tag.toLowerCase();
  return v === t || v.split('-')[0] === t.split('-')[0];
}

export function voicesFor(lang: Language, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.speech.toLowerCase());
  const loose = voices.filter((v) => matches(v, lang.speech) && !exact.includes(v));
  const primary = [...exact, ...loose];
  if (primary.length > 0 || !lang.speechFallback) return primary;
  const fallback = lang.speechFallback;
  return voices.filter((v) => matches(v, fallback));
}

export interface SpeakOptions {
  lang: Language;
  voiceURI?: string;
  rate: number;
  /** audio has actually started (some browsers silently drop speech that was not started by a tap) */
  onStart?: () => void;
  onEnd: () => void;
}

/**
 * iPhone and iPad only allow speech that begins inside a tap. Calling this
 * from a tap handler plays a silent utterance, which unlocks speech for the
 * rest of the visit so later tutor replies can be read aloud automatically.
 */
export function unlockSpeech(): void {
  if (!speechSupported()) return;
  try {
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* nothing to unlock */
  }
}

export type SpeakResult = { ok: true } | { ok: false; reason: string };

export function speak(text: string, options: SpeakOptions): SpeakResult {
  if (!speechSupported()) {
    return { ok: false, reason: 'This browser has no text-to-speech. Try Chrome, Edge or Safari.' };
  }
  const voices = getVoices();
  const candidates = voicesFor(options.lang, voices);
  if (voices.length > 0 && candidates.length === 0) {
    return {
      ok: false,
      reason: `No ${options.lang.name} voice is installed on this device. Add one in your system’s speech settings, then reload.`,
    };
  }
  const voice = candidates.find((v) => v.voiceURI === options.voiceURI) ?? candidates[0];
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = options.lang.speech;
  }
  utterance.rate = options.rate;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = options.onEnd;
  utterance.onerror = options.onEnd;
  synth.speak(utterance);
  return { ok: true };
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
