import type { Language, Level } from '../types';
import gb from '../assets/flags/gb.svg';
import de from '../assets/flags/de.svg';
import fr from '../assets/flags/fr.svg';
import es from '../assets/flags/es.svg';
import it from '../assets/flags/it.svg';
import pt from '../assets/flags/pt.svg';
import nl from '../assets/flags/nl.svg';
import hr from '../assets/flags/hr.svg';
import pl from '../assets/flags/pl.svg';
import se from '../assets/flags/se.svg';
import tr from '../assets/flags/tr.svg';
import gr from '../assets/flags/gr.svg';
import ua from '../assets/flags/ua.svg';
import jp from '../assets/flags/jp.svg';
import cn from '../assets/flags/cn.svg';
import il from '../assets/flags/il.svg';
import va from '../assets/flags/va.svg';
import arabic from '../assets/flags/arabic.svg';
import globe from '../assets/flags/globe.svg';

/** Neutral graphic used if a language ever has no flag asset. Never a country code. */
export const FALLBACK_FLAG = globe;

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: gb, flagNote: 'English is shown with the flag of the United Kingdom.', speech: 'en-GB', grammar: 'en-GB', translate: 'en-GB', hello: 'Hello' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: de, speech: 'de-DE', grammar: 'de-DE', translate: 'de-DE', hello: 'Hallo' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: fr, speech: 'fr-FR', grammar: 'fr', translate: 'fr-FR', hello: 'Bonjour' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: es, speech: 'es-ES', grammar: 'es', translate: 'es-ES', hello: 'Hola' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: it, speech: 'it-IT', grammar: 'it', translate: 'it-IT', hello: 'Ciao' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: pt, flagNote: 'Portuguese is shown with the flag of Portugal.', speech: 'pt-PT', grammar: 'pt-PT', translate: 'pt-PT', hello: 'Olá' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: nl, speech: 'nl-NL', grammar: 'nl', translate: 'nl-NL', hello: 'Hallo' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flag: hr, speech: 'hr-HR', translate: 'hr-HR', hello: 'Bok' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: pl, speech: 'pl-PL', grammar: 'pl-PL', translate: 'pl-PL', hello: 'Cześć' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: se, speech: 'sv-SE', grammar: 'sv', translate: 'sv-SE', hello: 'Hej' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: tr, speech: 'tr-TR', translate: 'tr-TR', hello: 'Merhaba' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: gr, speech: 'el-GR', grammar: 'el-GR', translate: 'el-GR', hello: 'Γεια σου' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: ua, speech: 'uk-UA', grammar: 'uk-UA', translate: 'uk-UA', hello: 'Привіт' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: jp, speech: 'ja-JP', grammar: 'ja-JP', translate: 'ja-JP', hello: 'こんにちは' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: cn, flagNote: 'Mandarin Chinese (simplified) is shown with the flag of China.', speech: 'zh-CN', grammar: 'zh-CN', translate: 'zh-CN', hello: '你好' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: arabic, flagNote: 'Arabic is spoken in more than 20 countries, so it is shown with the letter ʿayn instead of one national flag.', speech: 'ar-SA', grammar: 'ar', translate: 'ar-SA', rtl: true, hello: 'مرحبا' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: il, speech: 'he-IL', translate: 'he-IL', rtl: true, hello: 'שלום' },
  { code: 'la', name: 'Latin', nativeName: 'Latina', flag: va, flagNote: 'Latin has no country of its own; it is shown with the flag of Vatican City, where it is an official language.', speech: 'la', speechFallback: 'it-IT', translate: 'la', recognition: false, hello: 'Salve' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): Language {
  return BY_CODE.get(code) ?? LANGUAGES[0];
}

export interface LevelInfo {
  id: Level;
  name: string;
  summary: string;
  /** guidance handed to the AI tutor */
  guidance: string;
}

export const LEVELS: LevelInfo[] = [
  { id: 'A1', name: 'Beginner', summary: 'Single words and very short sentences', guidance: 'Use only the most common words, present tense and very short sentences (max. 8 words).' },
  { id: 'A2', name: 'Elementary', summary: 'Everyday topics in simple sentences', guidance: 'Use simple everyday vocabulary, short sentences, present and basic past tense.' },
  { id: 'B1', name: 'Intermediate', summary: 'Familiar topics, connected sentences', guidance: 'Use clear standard language, common tenses and connected sentences. Avoid rare idioms.' },
  { id: 'B2', name: 'Upper intermediate', summary: 'Fluent talk about most subjects', guidance: 'Use natural, varied language including some idioms and subordinate clauses.' },
  { id: 'C1', name: 'Advanced', summary: 'Nuanced, flexible, precise', guidance: 'Use rich, idiomatic, nuanced language as you would with an educated native speaker.' },
  { id: 'C2', name: 'Mastery', summary: 'Near-native in every register', guidance: 'Use fully native-level language with subtle register shifts, wordplay and cultural references.' },
];

export function getLevel(id: Level): LevelInfo {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
