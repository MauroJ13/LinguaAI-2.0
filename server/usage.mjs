import fs from 'node:fs';
import { TutorError } from './errors.mjs';

/**
 * Usage protection. Keeps LinguaAI inside the provider's free quota no matter
 * how many visitors there are, and stops any single visitor from using it up.
 *
 *   per visitor (IP): requests per minute and per day
 *   whole site:       requests per minute and per day
 *
 * "Day" follows Pacific Time, because that is when Gemini's daily quota resets.
 * Counters live in memory; with a file path they also survive restarts.
 */

const MINUTE = 60_000;

export const DEFAULT_LIMITS = {
  visitorPerMinute: 15,
  visitorPerDay: 150,
  sitePerMinute: 12,
  sitePerDay: 400,
};

/** Milliseconds timestamp of the next midnight in America/Los_Angeles. */
export function nextQuotaReset(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000;
  return now - elapsed + 24 * 3600 * 1000;
}

function quotaDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(now));
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** @param {Record<string, string | undefined>} env */
export function limitsFromEnv(env) {
  return {
    visitorPerMinute: positive(env.VISITOR_PER_MINUTE, DEFAULT_LIMITS.visitorPerMinute),
    visitorPerDay: positive(env.VISITOR_PER_DAY, DEFAULT_LIMITS.visitorPerDay),
    sitePerMinute: positive(env.SITE_PER_MINUTE, DEFAULT_LIMITS.sitePerMinute),
    sitePerDay: positive(env.SITE_PER_DAY, DEFAULT_LIMITS.sitePerDay),
  };
}

/** @param {{ file?: string }} [options] */
export function createUsage(options = {}) {
  let day = quotaDay();
  let siteToday = 0;
  /** @type {Map<string, number>} */
  let visitorsToday = new Map();
  /** @type {number[]} */
  let siteRecent = [];
  /** @type {Map<string, number[]>} */
  const visitorRecent = new Map();

  if (options.file) {
    try {
      const saved = JSON.parse(fs.readFileSync(options.file, 'utf8'));
      if (saved && saved.day === day) {
        siteToday = positive(saved.site, 0);
        visitorsToday = new Map(Object.entries(saved.visitors ?? {}).map(([ip, n]) => [ip, positive(n, 0)]));
      }
    } catch {
      /* no saved counters yet */
    }
  }

  let saveTimer = null;
  const save = () => {
    if (!options.file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        fs.writeFileSync(options.file, JSON.stringify({ day, site: siteToday, visitors: Object.fromEntries(visitorsToday) }));
      } catch {
        /* counters stay in memory */
      }
    }, 2000);
    saveTimer.unref?.();
  };

  const rollover = () => {
    const today = quotaDay();
    if (today !== day) {
      day = today;
      siteToday = 0;
      visitorsToday = new Map();
    }
  };

  return {
    /**
     * Counts one tutor request or throws a TutorError explaining which limit was hit.
     * @param {string} ip
     * @param {typeof DEFAULT_LIMITS} limits
     */
    spend(ip, limits) {
      rollover();
      const now = Date.now();
      const resetAt = nextQuotaReset(now);

      if (siteToday >= limits.sitePerDay) {
        throw new TutorError('site_quota', 'LinguaAI’s free AI quota for today is used up. The tutor is available again after the daily reset.', { status: 429, resetAt });
      }
      const mine = visitorsToday.get(ip) ?? 0;
      if (mine >= limits.visitorPerDay) {
        throw new TutorError('visitor_quota', `You have reached today’s limit of ${limits.visitorPerDay} tutor requests. It resets once a day.`, { status: 429, resetAt });
      }

      siteRecent = siteRecent.filter((t) => now - t < MINUTE);
      if (siteRecent.length >= limits.sitePerMinute) {
        const wait = Math.max(1, Math.ceil((MINUTE - (now - siteRecent[0])) / 1000));
        throw new TutorError('busy', `The tutor is busy with other learners right now. Try again in ${wait} seconds.`, { status: 429, retryAfter: wait });
      }
      const recent = (visitorRecent.get(ip) ?? []).filter((t) => now - t < MINUTE);
      if (recent.length >= limits.visitorPerMinute) {
        const wait = Math.max(1, Math.ceil((MINUTE - (now - recent[0])) / 1000));
        throw new TutorError('too_many_requests', `That was a lot of requests in a short time. Try again in ${wait} seconds.`, { status: 429, retryAfter: wait });
      }

      recent.push(now);
      visitorRecent.set(ip, recent);
      if (visitorRecent.size > 5000) visitorRecent.clear();
      siteRecent.push(now);
      siteToday += 1;
      visitorsToday.set(ip, mine + 1);
      save();
    },
    snapshot(limits) {
      rollover();
      return { day, usedToday: siteToday, sitePerDay: limits.sitePerDay, resetAt: nextQuotaReset() };
    },
  };
}
