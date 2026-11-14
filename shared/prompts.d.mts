export interface PromptContext {
  /** English name of the language being learned */
  language: string;
  /** English name of the learner's own language */
  native: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  /** the latest learner message is a speech-recognition transcript */
  spoken: boolean;
  scenario: { title: string; brief: string };
}

export interface FeedbackPayload {
  verdict: 'correct' | 'improve';
  corrected: string;
  issues: { original: string; replacement: string; explanation: string }[];
  alternative: string;
  praise: string;
}

export const LEVEL_IDS: string[];
export function replyPrompt(ctx: PromptContext): string;
export function turnPrompt(ctx: PromptContext): string;
export function correctionPrompt(ctx: PromptContext): string;
export function translatePrompt(from: string, to: string): string;
export function detectTranslatePrompt(to: string, languageList: string): string;
export function feedbackReminder(ctx: PromptContext, withReply: boolean): string;
export function parseJson(raw: string): Record<string, unknown> | null;
export function normalizeFeedback(value: unknown, original: string, level: PromptContext['level']): FeedbackPayload;
