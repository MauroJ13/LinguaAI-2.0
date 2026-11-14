import { TutorError } from './errors.mjs';

/** How the tutor talks and how much it corrects at each CEFR level. */
const LEVELS = {
  A1: {
    name: 'beginner',
    talk: 'Use only the most common words, the present tense and very short sentences (eight words at most).',
    feedback:
      'Point out at most ONE mistake – the one that matters most for being understood – and ignore everything else. Explain it in one very short sentence with everyday words and no grammar terms beyond "past", "plural" or "word order".',
    maxIssues: 1,
  },
  A2: {
    name: 'elementary',
    talk: 'Use simple everyday vocabulary, short sentences, the present and the basic past tense.',
    feedback: 'Point out at most TWO clear mistakes. Explain each in one short, simple sentence. Ignore style.',
    maxIssues: 2,
  },
  B1: {
    name: 'intermediate',
    talk: 'Use clear standard language, common tenses and connected sentences. Avoid rare idioms.',
    feedback: 'Point out up to THREE mistakes in grammar or word choice. Explanations may use basic grammar terms and should stay to one or two sentences.',
    maxIssues: 3,
  },
  B2: {
    name: 'upper intermediate',
    talk: 'Use natural, varied language with some idioms and subordinate clauses.',
    feedback: 'Point out up to THREE mistakes, including unnatural or unidiomatic phrasing. Explain the rule or the nuance briefly.',
    maxIssues: 3,
  },
  C1: {
    name: 'advanced',
    talk: 'Use rich, idiomatic, nuanced language as with an educated native speaker.',
    feedback: 'Point out up to FOUR issues, including register, collocation and subtle nuance. Be precise and concise.',
    maxIssues: 4,
  },
  C2: {
    name: 'mastery',
    talk: 'Use fully native-level language with register shifts and cultural references.',
    feedback: 'Point out up to FOUR issues of style, register, idiom or precision that separate this text from an articulate native speaker.',
    maxIssues: 4,
  },
};

export const LEVEL_IDS = Object.keys(LEVELS);

const FEEDBACK_SHAPE =
  '{"verdict": "correct" | "improve", "corrected": "the learner\'s full message with the mistakes fixed", "issues": [{"original": "the wrong part, copied exactly", "replacement": "the fixed part", "explanation": "why"}], "alternative": "one more natural way to say the same thing, or an empty string", "praise": "one short encouraging sentence"}';

function tutorRules(ctx) {
  const level = LEVELS[ctx.level];
  return [
    `You are Lingua, a warm, patient tutor helping someone practise ${ctx.language} in conversation.`,
    `Always speak ${ctx.language} only.`,
    `The learner is at CEFR level ${ctx.level} (${level.name}). ${level.talk}`,
    `Scenario: ${ctx.scenario.title}. ${ctx.scenario.brief}`,
    'Keep each reply to one to three short sentences and end with a question or prompt that keeps the learner talking.',
    'Respond to what the learner meant, even if they made mistakes. Never correct or translate inside your reply.',
    'Plain text only: no markdown, no emojis, no lists.',
  ];
}

function feedbackRules(ctx) {
  const level = LEVELS[ctx.level];
  return [
    `Review the learner's latest ${ctx.language} message as a kind teacher would for a CEFR ${ctx.level} (${level.name}) learner.`,
    level.feedback,
    `Never ask for vocabulary or structures above level ${ctx.level}.`,
    ctx.spoken
      ? 'The message is a speech-recognition transcript of what the learner SAID. Ignore punctuation, capitalisation and spelling completely. You cannot hear the learner, so never comment on pronunciation or accent. If a word makes no sense in context it is probably a recognition error – do not count it as a mistake.'
      : 'Ignore missing capital letters and missing final punctuation in casual chat.',
    'If the message is already correct, say so: verdict "correct", "corrected" identical to the message, and no issues. Do not invent problems.',
    `Write "explanation" and "praise" in ${ctx.native}. "praise" names one specific thing the learner did well (a tense, a word, getting the meaning across) – always include it, even when there are mistakes.`,
    `"alternative" is optional: one more natural way to say the same thing in ${ctx.language} that the learner could understand at their level, or "".`,
    `Feedback JSON shape: ${FEEDBACK_SHAPE}`,
  ];
}

export function replyPrompt(ctx) {
  return tutorRules(ctx).join(' ');
}

export function turnPrompt(ctx) {
  return [
    ...tutorRules(ctx),
    'In addition to your reply, give feedback on the learner’s latest message.',
    ...feedbackRules(ctx),
    'Answer with JSON only, exactly: {"reply": "your next line in the conversation", "feedback": <feedback JSON>}',
  ].join(' ');
}

export function correctionPrompt(ctx) {
  return [...feedbackRules(ctx), 'Answer with the feedback JSON only.'].join(' ');
}

export function translatePrompt(from, to) {
  return `You are a translator. Translate the user's text from ${from} into ${to}. Output only the translation – no quotes, no notes, no alternatives.`;
}

/* ---------- reading model output ---------- */

export function parseJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new TutorError('bad_response', 'The AI tutor sent an answer LinguaAI could not read. Try again.');
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const squash = (s) => s.toLowerCase().replace(/[\s.,!?;:¿¡"'“”‘’-]+/g, ' ').trim();

/** Turns whatever the model returned into a well-formed feedback object. */
export function normalizeFeedback(value, original, level) {
  const f = value && typeof value === 'object' ? value : {};
  const corrected = text(f.corrected, 2000) || original;
  const issues = (Array.isArray(f.issues) ? f.issues : [])
    .map((i) => ({
      original: text(i?.original, 300),
      replacement: text(i?.replacement, 300),
      explanation: text(i?.explanation, 500),
    }))
    .filter((i) => i.original || i.replacement || i.explanation)
    .slice(0, LEVELS[level].maxIssues);
  const unchanged = squash(corrected) === squash(original);
  const correct = issues.length === 0 && (f.verdict === 'correct' || unchanged);
  const alternative = text(f.alternative, 600);
  return {
    verdict: correct ? 'correct' : 'improve',
    corrected: correct ? original : corrected,
    issues: correct ? [] : issues,
    alternative: alternative && squash(alternative) !== squash(corrected) ? alternative : '',
    praise: text(f.praise, 300),
  };
}
