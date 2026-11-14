import {
  correctionPrompt,
  detectTranslatePrompt,
  feedbackReminder,
  normalizeFeedback,
  parseJson,
  replyPrompt,
  translatePrompt,
  turnPrompt,
  type FeedbackPayload,
  type PromptContext,
} from '../../shared/prompts.mjs';
import { ServiceError } from './ai';
import { freeChat, type ChatTurn } from './freeAi';

/**
 * The tutor's tasks on the free keyless AI services – the same prompts and the
 * same answer shapes as LinguaAI's optional Gemini backend (server/api.mjs),
 * so the rest of the app does not care which one answered.
 */

export interface HistoryEntry {
  role: 'user' | 'tutor';
  text: string;
}

const UNREADABLE = 'The AI sent an answer LinguaAI could not read. Try again.';

function toTurns(system: string, history: HistoryEntry[]): ChatTurn[] {
  const turns: ChatTurn[] = [{ role: 'system', content: system }];
  for (const m of history.slice(-24)) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const last = turns[turns.length - 1];
    if (last.role === role) last.content += `\n${m.text}`;
    else turns.push({ role, content: m.text });
  }
  // chat models expect the first turn after the system prompt to come from the user
  if (turns.length === 1 || turns[1].role !== 'user') turns.splice(1, 0, { role: 'user', content: '(The learner has joined.)' });
  return turns;
}

/** Free models occasionally return broken JSON: ask once more before giving up. */
async function jsonChat(turns: ChatTurn[], temperature: number, signal?: AbortSignal): Promise<{ data: Record<string, unknown>; model: string }> {
  for (let attempt = 0; ; attempt += 1) {
    const out = await freeChat(turns, { json: true, temperature, signal });
    const data = parseJson(out.text);
    if (data) return { data, model: out.model };
    if (attempt >= 1) throw new ServiceError(UNREADABLE, 'bad_response');
  }
}

export async function freeReply(ctx: PromptContext, history: HistoryEntry[], signal?: AbortSignal): Promise<{ text: string; model: string }> {
  const out = await freeChat(toTurns(replyPrompt(ctx), history), { temperature: 0.8, signal });
  return { text: out.text, model: out.model };
}

export async function freeTurn(ctx: PromptContext, history: HistoryEntry[], signal?: AbortSignal): Promise<{ reply: string; feedback: FeedbackPayload; model: string }> {
  const last = history[history.length - 1];
  const turns = toTurns(turnPrompt(ctx), history);
  // the latest instruction is the one small models follow best: repeat which language the feedback is in
  turns[turns.length - 1].content += feedbackReminder(ctx, true);
  const { data, model } = await jsonChat(turns, 0.6, signal);
  const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
  if (!reply) throw new ServiceError(UNREADABLE, 'bad_response');
  return { reply, feedback: normalizeFeedback(data.feedback, last?.text ?? '', ctx.level), model };
}

export async function freeCorrection(ctx: PromptContext, text: string, signal?: AbortSignal): Promise<{ feedback: FeedbackPayload; model: string }> {
  const { data, model } = await jsonChat(
    [
      { role: 'system', content: correctionPrompt(ctx) },
      { role: 'user', content: text + feedbackReminder(ctx, false) },
    ],
    0.1,
    signal,
  );
  return { feedback: normalizeFeedback(data, text, ctx.level), model };
}

export async function freeTranslation(text: string, from: string, to: string, signal?: AbortSignal): Promise<{ text: string; model: string }> {
  const out = await freeChat(
    [
      { role: 'system', content: translatePrompt(from, to) },
      { role: 'user', content: text },
    ],
    { temperature: 0.2, signal },
  );
  return { text: out.text, model: out.model };
}

/** Lingua Translate with “Detect language”: the language code and the translation from one request. */
export async function freeDetectTranslation(text: string, to: string, languageList: string, signal?: AbortSignal): Promise<{ detected: string; text: string; model: string }> {
  const { data, model } = await jsonChat(
    [
      { role: 'system', content: detectTranslatePrompt(to, languageList) },
      { role: 'user', content: text },
    ],
    0.2,
    signal,
  );
  const translation = typeof data.translation === 'string' ? data.translation.trim() : '';
  if (!translation) throw new ServiceError(UNREADABLE, 'bad_response');
  return { detected: typeof data.detected === 'string' ? data.detected.trim().toLowerCase().slice(0, 2) : '', text: translation, model };
}
