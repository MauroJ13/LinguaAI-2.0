import type { ChatMessage, Correction, CorrectionIssue, Language, Level } from '../types';
import type { Scenario } from '../data/scenarios';
import type { FeedbackPayload, PromptContext } from '../../shared/prompts.mjs';
import { callTutor, isAbort, ServiceError } from './ai';
import { freeCorrection, freeDetectTranslation, freeReply, freeTranslation, freeTurn } from './freeTutor';
import { getLanguage, LANGUAGES } from '../data/languages';
import { guessLanguage, writtenInWrongLanguage } from '../lib/langGuess';

/**
 * Everything the app needs from the tutor: replies, feedback, translations.
 *
 * Two real AI engines, never a simulated one:
 *   1. LinguaAI's own server with Google Gemini – only when someone has
 *      configured a key there (optional, see README)
 *   2. free keyless AI services called from the browser (services/freeAi.ts)
 *      – the default, needs no account, key or setup
 * If the server cannot answer (not configured, quota used up, offline), the
 * keyless services take over. When no AI can answer, the app says so.
 * Side tools have a further real source: LanguageTool for manual checks and
 * MyMemory for translations.
 */

export interface TutorContext {
  /** LinguaAI's server has a working AI provider right now */
  server: boolean;
  lang: Language;
  native: Language;
  level: Level;
  scenario: Scenario;
}

/** errors that another engine would not fix */
const FINAL = ['bad_request', 'too_long', 'blocked', 'forbidden'];

async function withEngines<T>(server: boolean, viaServer: () => Promise<T>, viaFree: () => Promise<T>): Promise<T> {
  if (server) {
    try {
      return await viaServer();
    } catch (err) {
      if (isAbort(err) || (err instanceof ServiceError && FINAL.includes(err.code))) throw err;
      // server busy, over its quota or gone: the keyless services take over
    }
  }
  return viaFree();
}

function toCorrection(f: FeedbackPayload): Correction {
  const extras = { praise: f.praise || undefined, alternative: f.alternative || undefined };
  if (f.verdict === 'correct') return { status: 'ok', issues: [], source: 'ai', ...extras };
  const issues: CorrectionIssue[] = f.issues.map((i) => ({ original: i.original, replacement: i.replacement, note: i.explanation }));
  return { status: 'fixed', corrected: f.corrected, issues, source: 'ai', ...extras };
}

function promptContext(ctx: TutorContext, spoken: boolean): PromptContext {
  return {
    language: ctx.lang.name,
    native: ctx.native.name,
    level: ctx.level,
    spoken,
    scenario: { title: ctx.scenario.title, brief: ctx.scenario.brief },
  };
}

function toHistory(messages: ChatMessage[]) {
  return messages.slice(-24).map((m) => ({ role: m.role, text: m.text }));
}

/* ------------------------------------------------------------------ */
/* Translation                                                         */
/* ------------------------------------------------------------------ */

interface MyMemoryResponse {
  responseStatus?: number | string;
  responseDetails?: string;
  responseData?: { translatedText?: string };
}

const translationCache = new Map<string, string>();

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?。！？\n]+[.!?。！？\n]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if ((current + part).length > max && current) {
      chunks.push(current);
      current = '';
    }
    current += part;
    while (current.length > max) {
      chunks.push(current.slice(0, max));
      current = current.slice(max);
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

async function myMemory(text: string, from: Language, to: Language, signal?: AbortSignal): Promise<string> {
  const out: string[] = [];
  for (const chunk of chunkText(text, 450)) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(`${from.translate}|${to.translate}`)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ServiceError('The translation service (MyMemory) could not be reached. Check your connection.', 'translate_unreachable');
    }
    if (res.status === 429) throw new ServiceError('The free translation limit for today is used up (MyMemory).', 'translate_limit');
    if (!res.ok) throw new ServiceError(`The translation service answered with an error (HTTP ${res.status}).`, 'translate_error');
    const data = (await res.json()) as MyMemoryResponse;
    const translated = data.responseData?.translatedText;
    if (Number(data.responseStatus) !== 200 || !translated) {
      throw new ServiceError(data.responseDetails ? `Translation failed: ${data.responseDetails}` : 'Translation failed.', 'translate_error');
    }
    out.push(translated);
  }
  return out.join(' ').trim();
}

/**
 * Translation. A dedicated translation service comes first so that looking up
 * words does not use up the few AI requests per minute that conversation needs;
 * the AI steps in when that service is unavailable.
 */
export async function translateText(server: boolean, text: string, from: Language, to: Language, signal?: AbortSignal): Promise<string> {
  const clean = text.trim();
  if (!clean || from.code === to.code) return clean;
  const key = `${from.code}>${to.code}:${clean}`;
  const cached = translationCache.get(key);
  if (cached) return cached;

  const viaServer = async () => (await callTutor<{ text: string }>({ task: 'translate', text: clean, from: from.name, to: to.name }, signal)).text;
  const sources: (() => Promise<string>)[] = server
    ? [viaServer, () => myMemory(clean, from, to, signal), async () => (await freeTranslation(clean, from.name, to.name, signal)).text]
    : [() => myMemory(clean, from, to, signal), async () => (await freeTranslation(clean, from.name, to.name, signal)).text];

  let failure: unknown = null;
  for (const source of sources) {
    try {
      const result = await source();
      translationCache.set(key, result);
      return result;
    } catch (err) {
      if (isAbort(err)) throw err;
      failure = err;
    }
  }
  throw failure instanceof Error ? failure : new ServiceError('Translation is not available right now.', 'translate_error');
}

/**
 * Explanations and praise belong in the learner's own language, never in the
 * one they are learning. The prompts demand it; this is the safety net for the
 * cases where a model (or LanguageTool, which always answers in the checked
 * language) writes them in the learning language anyway.
 */
async function inNativeLanguage(correction: Correction, ctx: TutorContext, always: boolean, signal?: AbortSignal): Promise<Correction> {
  if (ctx.native.code === ctx.lang.code) return correction;
  const fix = async (text: string | undefined): Promise<string | undefined> => {
    if (!text) return text;
    if (!always && !writtenInWrongLanguage(text, ctx.native.code, ctx.lang.code)) return text;
    try {
      return await myMemory(text, ctx.lang, ctx.native, signal);
    } catch (err) {
      if (isAbort(err)) throw err;
      return text;
    }
  };
  const [praise, ...notes] = await Promise.all([fix(correction.praise), ...correction.issues.map((i) => fix(i.note))]);
  return { ...correction, praise, issues: correction.issues.map((issue, i) => ({ ...issue, note: notes[i] ?? issue.note })) };
}

/* ------------------------------------------------------------------ */
/* Lingua Translate                                                    */
/* ------------------------------------------------------------------ */

export const MAX_TRANSLATE_CHARS = 3000;

export interface TranslatorResult {
  text: string;
  /** set when the source was “Detect language” and the language is one LinguaAI knows */
  detected?: string;
}

const LANGUAGE_LIST = LANGUAGES.map((l) => `${l.code} = ${l.name}`).join(', ');
const isKnown = (code: string) => LANGUAGES.some((l) => l.code === code);

/**
 * Translation for the Lingua Translate window. With a fixed source language it
 * is the same pipeline as everywhere else. With “Detect language” the text is
 * first recognised offline (script and common words); only when that is unclear
 * does the AI detect and translate in one request.
 */
export async function translateForTranslator(server: boolean, raw: string, source: string, target: string, signal?: AbortSignal): Promise<TranslatorResult> {
  const text = raw.trim().slice(0, MAX_TRANSLATE_CHARS);
  if (!text) return { text: '' };
  const to = getLanguage(target);
  if (source !== 'auto') return { text: await translateText(server, text, getLanguage(source), to, signal) };

  const guessed = guessLanguage(text);
  if (guessed) return { text: await translateText(server, text, getLanguage(guessed), to, signal), detected: guessed };

  const key = `auto>${target}:${text}`;
  const cached = translationCache.get(key);
  if (cached) return JSON.parse(cached) as TranslatorResult;
  const out = await freeDetectTranslation(text, to.name, LANGUAGE_LIST, signal);
  const result: TranslatorResult = { text: out.text, detected: isKnown(out.detected) ? out.detected : undefined };
  translationCache.set(key, JSON.stringify(result));
  return result;
}

/* ------------------------------------------------------------------ */
/* Tutor replies                                                       */
/* ------------------------------------------------------------------ */

export interface TutorReply {
  text: string;
  /** which service and model answered – shown in the app as a credit */
  model: string;
  /** feedback on the learner's latest message, when it was requested */
  correction?: Correction;
}

/** The tutor's next line, optionally with feedback on the learner's latest message in the same request. */
export async function aiReply(ctx: TutorContext, history: ChatMessage[], withFeedback: boolean, signal?: AbortSignal): Promise<TutorReply> {
  const last = history[history.length - 1];
  const entries = toHistory(history);
  const prompt = promptContext(ctx, last?.via === 'voice');

  if (withFeedback && last?.role === 'user') {
    const data = await withEngines(
      ctx.server,
      () => callTutor<{ reply: string; feedback: FeedbackPayload; model: string }>({ task: 'turn', ...prompt, history: entries }, signal),
      () => freeTurn(prompt, entries, signal),
    );
    return { text: data.reply, model: data.model, correction: await inNativeLanguage(toCorrection(data.feedback), ctx, false, signal) };
  }
  const data = await withEngines(
    ctx.server,
    () => callTutor<{ text: string; model: string }>({ task: 'reply', ...prompt, history: entries }, signal),
    () => freeReply(prompt, entries, signal),
  );
  return { text: data.text, model: data.model };
}

/* ------------------------------------------------------------------ */
/* Corrections                                                         */
/* ------------------------------------------------------------------ */

interface LanguageToolResponse {
  matches?: {
    message: string;
    offset: number;
    length: number;
    replacements: { value: string }[];
  }[];
}

async function languageTool(ctx: TutorContext, text: string, signal?: AbortSignal): Promise<Correction> {
  if (!ctx.lang.grammar) {
    return {
      status: 'unavailable',
      issues: [],
      source: 'languagetool',
      note: `LanguageTool does not cover ${ctx.lang.name}, and the AI could not answer just now. Try again in a moment.`,
    };
  }
  const body = new URLSearchParams({ text, language: ctx.lang.grammar });
  if (ctx.level === 'B2' || ctx.level === 'C1' || ctx.level === 'C2') body.set('level', 'picky');

  let res: Response;
  try {
    res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ServiceError('The grammar checker (LanguageTool) could not be reached. Check your connection.', 'grammar_unreachable');
  }
  if (res.status === 429) throw new ServiceError('The grammar checker is rate-limited (20 checks per minute). Try again shortly.', 'grammar_limit');
  if (!res.ok) throw new ServiceError(`The grammar checker answered with an error (HTTP ${res.status}).`, 'grammar_error');

  const data = (await res.json()) as LanguageToolResponse;
  const matches = (data.matches ?? []).filter((m) => m.replacements.length > 0);
  if (matches.length === 0) return { status: 'ok', issues: [], source: 'languagetool' };

  const issues: CorrectionIssue[] = [];
  let corrected = text;
  // apply from the end so earlier offsets stay valid
  for (const m of [...matches].sort((a, b) => b.offset - a.offset)) {
    const original = text.slice(m.offset, m.offset + m.length);
    const replacement = m.replacements[0].value;
    corrected = corrected.slice(0, m.offset) + replacement + corrected.slice(m.offset + m.length);
    issues.unshift({ original, replacement, note: m.message });
  }
  return { status: 'fixed', corrected, issues, source: 'languagetool' };
}

/** A check on its own (the “Check” button): the AI first, LanguageTool when no AI can answer. */
export async function correctMessage(ctx: TutorContext, text: string, spoken: boolean, signal?: AbortSignal): Promise<Correction> {
  const prompt = promptContext(ctx, spoken);
  try {
    const data = await withEngines(
      ctx.server,
      () => callTutor<{ feedback: FeedbackPayload }>({ task: 'correct', ...prompt, text }, signal),
      () => freeCorrection(prompt, text, signal),
    );
    return await inNativeLanguage(toCorrection(data.feedback), ctx, false, signal);
  } catch (err) {
    if (isAbort(err)) throw err;
    // without a LanguageTool fallback for this language, the AI error is the honest answer
    if (!ctx.lang.grammar) throw err;
  }
  // LanguageTool writes its messages in the language of the checked text: bring them into the learner's language
  return inNativeLanguage(await languageTool(ctx, text, signal), ctx, true, signal);
}
