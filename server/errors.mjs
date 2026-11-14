/**
 * One error type for everything that can go wrong between LinguaAI and an AI
 * provider. `code` is stable and machine-readable; `message` is written for
 * the learner and shown in the app as-is.
 */
export class TutorError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: number, retryAfter?: number, resetAt?: number }} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'TutorError';
    this.code = code;
    this.status = extra.status ?? 502;
    this.retryAfter = extra.retryAfter;
    /** timestamp (ms) when a daily quota resets */
    this.resetAt = extra.resetAt;
  }
}

export const notConfigured = () =>
  new TutorError(
    'not_configured',
    'The AI tutor is not set up yet. Add GEMINI_API_KEY to the .env file in the project folder and restart the server.',
    { status: 503 },
  );
