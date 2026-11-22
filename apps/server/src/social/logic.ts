/**
 * Pure social logic (AGPL-3.0-or-later): streaks per user, friend streaks,
 * weekly leagues and feed milestones. Everything is derived from per-day
 * activity rows, so it stays deterministic and testable without a database.
 */
import { addDays, computeStreak, daysBetween, STREAK_PROBLEMS, weekKey, type DayActivity, type StreakInfo } from '@lumen/engine';

/** One row per account and local day, written on every sync. */
export interface DayRow {
  day: string;
  xp: number;
  active: boolean;
}

/** League tiers, lowest first. The web app localises the names. */
export const TIERS = ['spark', 'ember', 'glow', 'beam', 'prism', 'aurora', 'comet', 'nova', 'pulsar', 'zenith'] as const;
export type Tier = (typeof TIERS)[number];
export const COHORT_SIZE = 30;
/** XP above this per day do not count for leagues (plausibility cap). */
export const MAX_LEAGUE_XP_PER_DAY = 1500;

export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 150, 200, 250, 300, 365, 500, 730, 1000];
export const FRIEND_STREAK_MILESTONES = [7, 30, 50, 100, 200, 365];
export const LEVEL_MILESTONE_EVERY = 5;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDayKey = (s: unknown): s is string => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * The client's local day, if plausible (timezones are at most ±14 h away from
 * UTC). Falls back to the server's UTC day.
 */
export function clientToday(v: unknown, now = Date.now()): string {
  const server = utcDay(now);
  if (!isDayKey(v)) return server;
  return Math.abs(daysBetween(server, v)) <= 1 ? v : server;
}

function toActivity(rows: readonly DayRow[]): Record<string, DayActivity> {
  const days: Record<string, DayActivity> = {};
  for (const r of rows) days[r.day] = { xp: r.xp, problemsSolved: r.active ? STREAK_PROBLEMS : 0, conceptsCompleted: 0, reviewSessions: 0, ms: 0 };
  return days;
}

/** A user's streak as seen by a viewer: a friend a day ahead in another timezone still counts today. */
export function userStreak(rows: readonly DayRow[], viewerToday: string, lastToday: string | null): StreakInfo {
  const today = lastToday && lastToday > viewerToday ? lastToday : viewerToday;
  return computeStreak(toActivity(rows), today);
}

/** Days that keep a user's streak alive: active days and days bridged by a freeze. */
export function coveredDays(rows: readonly DayRow[], streak: StreakInfo): Set<string> {
  const s = new Set(streak.frozenDays);
  for (const r of rows) if (r.active) s.add(r.day);
  return s;
}

export interface FriendStreak {
  current: number;
  /** Both practised today. */
  todayDone: boolean;
  meToday: boolean;
  friendToday: boolean;
}

/**
 * Consecutive days on which both friends kept their streak, counted back from
 * today and never before the friendship started. Today only counts once both
 * are done; it never breaks the friend streak (the day is not over yet).
 */
export function friendStreak(mine: Set<string>, theirs: Set<string>, since: string, today: string): FriendStreak {
  const meToday = mine.has(today);
  const friendToday = theirs.has(today);
  let current = 0;
  for (let d = today; d >= since; d = addDays(d, -1)) {
    const both = mine.has(d) && theirs.has(d);
    if (d === today && !both) continue;
    if (!both) break;
    current++;
    if (current > 5000) break;
  }
  return { current, todayDone: meToday && friendToday, meToday, friendToday };
}

export function weekRange(today: string): { week: string; from: string; to: string } {
  const week = weekKey(today);
  return { week, from: week, to: addDays(week, 6) };
}

export function weekXp(rows: readonly DayRow[], week: string): number {
  const to = addDays(week, 6);
  return rows.filter((r) => r.day >= week && r.day <= to).reduce((s, r) => s + Math.min(r.xp, MAX_LEAGUE_XP_PER_DAY), 0);
}

/** How many of a cohort move up or down at the end of the week. */
export function zones(size: number, tier: number): { promote: number; demote: number } {
  const promote = tier >= TIERS.length - 1 || size < 2 ? 0 : Math.max(1, Math.min(7, Math.floor(size / 4)));
  const demote = tier === 0 || size < 5 ? 0 : Math.min(5, Math.floor(size / 5));
  return { promote, demote };
}

export type Zone = 'promote' | 'demote' | 'stay';

export function zoneOf(rank: number, size: number, tier: number): Zone {
  const z = zones(size, tier);
  if (rank <= z.promote) return 'promote';
  if (rank > size - z.demote) return 'demote';
  return 'stay';
}

export interface Standing {
  account: string;
  xp: number;
  joinedAt: number;
}

/** Ranks by weekly XP; on a tie, whoever joined the league first ranks higher. */
export function rankStandings<T extends Standing>(list: readonly T[]): (T & { rank: number })[] {
  return [...list].sort((a, b) => b.xp - a.xp || a.joinedAt - b.joinedAt || a.account.localeCompare(b.account)).map((s, i) => ({ ...s, rank: i + 1 }));
}

export type Outcome = 'promoted' | 'demoted' | 'stayed';

/**
 * Tier for a new week from the result of the last league week. Skipping weeks
 * costs one tier per extra missed week (never below the first tier).
 */
export function nextTier(last: { week: string; tier: number; rank: number; size: number } | null, week: string): { tier: number; outcome: Outcome | null } {
  if (!last) return { tier: 0, outcome: null };
  const z = zoneOf(last.rank, last.size, last.tier);
  let tier = last.tier + (z === 'promote' ? 1 : z === 'demote' ? -1 : 0);
  const missed = Math.max(0, Math.round(daysBetween(last.week, week) / 7) - 1);
  tier = Math.max(0, Math.min(TIERS.length - 1, tier - missed));
  return { tier, outcome: z === 'promote' ? 'promoted' : z === 'demote' ? 'demoted' : 'stayed' };
}

/** The highest milestone reached by a streak, if any. */
export function milestoneReached(value: number, list: readonly number[]): number | null {
  let hit: number | null = null;
  for (const m of list) if (value >= m) hit = m;
  return hit;
}
