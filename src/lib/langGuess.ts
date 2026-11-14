/**
 * A small offline language guesser for LinguaAI's 18 languages. It is used for
 * two things only:
 *   – a safety net: noticing when an explanation came back in the language
 *     being learned instead of the learner's own language
 *   – Lingua Translate's “Detect language”, so that ordinary sentences do not
 *     need an AI request just to find out what language they are in
 * It reads the script first (Greek, Cyrillic, kana …) and then counts very
 * common words. Short or mixed texts return null rather than a wrong guess.
 */

const SCRIPTS: [string, RegExp][] = [
  ['ja', /[぀-ヿ]/],
  ['zh', /[一-鿿]/],
  ['el', /[Ͱ-Ͽ]/],
  ['uk', /[Ѐ-ӿ]/],
  ['he', /[֐-׿]/],
  ['ar', /[؀-ۿ]/],
];

const COMMON: Record<string, string> = {
  en: 'the is are you and of to in that it with for this not was have your here should use because after when',
  de: 'der die das und ist nicht ein eine du mit für den dem wird man hier statt weil nach wenn auch sich im heißt verwendet richtig muss',
  fr: 'le les est et un une des pas pour avec que dans il faut au on ce après ici être avoir doit cette sont du',
  es: 'el los las es y un una que para con no se en del por debe aquí después usa cuando porque este esta',
  it: 'il lo gli è e un una che per con non si di della nel qui dopo usa quando perché questo questa deve',
  pt: 'o os as é e um uma que para com não se do da em aqui depois usa quando porque este esta deve você',
  nl: 'de het een is en niet van met voor je dat op wordt hier omdat na als ook moet gebruik dit',
  hr: 'je i se u na da nije za od što koji ovo treba ovdje nakon kada jer umjesto koristi riječ',
  pl: 'jest i w na się nie to że do z dla tutaj po kiedy ponieważ zamiast używa słowo powinno być',
  sv: 'är och det en ett inte för med på som du att här efter när eftersom ska använd detta',
  tr: 'bir ve bu için ile değil olarak da de çok burada sonra çünkü yerine kullanılır olmalı',
  la: 'est et in non ad cum sed qui quod ut hic post quia pro esse sunt',
};

const WORDS: Record<string, Set<string>> = Object.fromEntries(Object.entries(COMMON).map(([code, list]) => [code, new Set(list.split(' '))]));

function byScript(text: string): string | null {
  // Japanese is checked before Chinese: it mixes kana with the same characters
  for (const [code, pattern] of SCRIPTS) if (pattern.test(text)) return code;
  return null;
}

function score(tokens: string[], code: string): number {
  const words = WORDS[code];
  if (!words) return 0;
  let hits = 0;
  for (const token of tokens) if (words.has(token)) hits += 1;
  return hits;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

/** Which of LinguaAI's languages a text is most likely written in, or null when it is unclear. */
export function guessLanguage(text: string): string | null {
  const script = byScript(text);
  if (script) return script;
  const tokens = tokenize(text);
  if (tokens.length < 2) return null;
  let best: string | null = null;
  let bestScore = 0;
  let second = 0;
  for (const code of Object.keys(WORDS)) {
    const s = score(tokens, code);
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = code;
    } else if (s > second) {
      second = s;
    }
  }
  return best && bestScore >= 2 && bestScore > second ? best : null;
}

/** True when `text` clearly looks like `wrong` rather than `expected` (used to catch explanations in the learning language). */
export function writtenInWrongLanguage(text: string, expected: string, wrong: string): boolean {
  if (expected === wrong) return false;
  const script = byScript(text);
  const scripted = (code: string) => SCRIPTS.some(([c]) => c === code);
  if (scripted(expected) || scripted(wrong)) {
    if (script === expected) return false;
    if (script === wrong) return true;
    // no special script found: wrong if the expected language should have had one
    return scripted(expected) && !scripted(wrong) && tokenize(text).length >= 3;
  }
  const tokens = tokenize(text);
  const a = score(tokens, expected);
  const b = score(tokens, wrong);
  return b >= 2 && b > a;
}
