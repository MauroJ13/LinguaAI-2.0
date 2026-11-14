import type { DayActivity, Grade, Srs, VocabItem } from '../types';

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function dayKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

export function lastDays(count: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
  }
  return days;
}

export const EMPTY_DAY: DayActivity = { messages: 0, reviews: 0, correct: 0, words: 0, checked: 0, clean: 0 };

export function dayPoints(day: DayActivity | undefined): number {
  return day ? day.messages + day.reviews : 0;
}

/** Consecutive days with practice, counting back from today (or yesterday if today is still empty). */
export function currentStreak(activity: Record<string, DayActivity>): number {
  const now = new Date();
  let streak = 0;
  let offset = dayPoints(activity[dayKey(now)]) > 0 ? 0 : 1;
  for (;;) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    if (dayPoints(activity[dayKey(d)]) > 0) {
      streak += 1;
      offset += 1;
    } else {
      return streak;
    }
  }
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ---------- spaced repetition (simplified SM-2) ---------- */

const DAY = 86_400_000;

export function newSrs(): Srs {
  return { reps: 0, lapses: 0, interval: 0, ease: 2.5, due: Date.now() };
}

export function reviewSrs(srs: Srs, grade: Grade, now = Date.now()): Srs {
  if (grade === 'again') {
    return { reps: 0, lapses: srs.lapses + 1, interval: 0, ease: Math.max(1.3, srs.ease - 0.2), due: now + 10 * 60_000 };
  }
  let { ease } = srs;
  let interval: number;
  if (grade === 'hard') {
    ease = Math.max(1.3, ease - 0.15);
    interval = Math.max(1, Math.round(srs.interval * 1.2));
  } else if (grade === 'good') {
    interval = srs.reps === 0 ? 1 : srs.reps === 1 ? 3 : Math.round(srs.interval * ease);
  } else {
    ease += 0.15;
    interval = srs.reps === 0 ? 3 : Math.max(4, Math.round(srs.interval * ease * 1.3));
  }
  return { reps: srs.reps + 1, lapses: srs.lapses, interval, ease, due: now + interval * DAY };
}

/** What the answer buttons promise, e.g. "3 d". */
export function nextIntervalLabel(srs: Srs, grade: Grade): string {
  if (grade === 'again') return '10 min';
  const days = reviewSrs(srs, grade).interval;
  if (days < 30) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} y`;
}

export type VocabStatus = 'new' | 'learning' | 'mastered';

export function vocabStatus(item: VocabItem): VocabStatus {
  if (item.srs.reps === 0 && item.srs.lapses === 0) return 'new';
  return item.srs.interval >= 21 ? 'mastered' : 'learning';
}

export function isDue(item: VocabItem, now = Date.now()): boolean {
  return item.srs.due <= now;
}

/** Splits text into words and the gaps between them, script-aware where the browser allows it. */
export function segmentWords(text: string, locale: string): { text: string; word: boolean }[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const seg = new Intl.Segmenter(locale, { granularity: 'word' });
      return Array.from(seg.segment(text), (s) => ({ text: s.segment, word: Boolean(s.isWordLike) }));
    } catch {
      /* fall through */
    }
  }
  return text
    .split(/(\s+|[.,!?;:«»"“”()¿¡]+)/)
    .filter((p) => p.length > 0)
    .map((p) => ({ text: p, word: !/^(\s+|[.,!?;:«»"“”()¿¡]+)$/.test(p) }));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
