/**
 * Local-first progress model. Everything the learner did is an append-only
 * event with a UUID; XP, streak, daily goal and completion are derived
 * deterministically from the log, so devices can merge logs without conflicts.
 */

import { completedLessons, type Catalog } from './compile.ts';

export type EventContext = 'lesson' | 'review' | 'unit-review' | 'placement' | 'daily' | 'mistakes';

interface Base {
  id: string;
  /** epoch ms */
  ts: number;
  /** local calendar day YYYY-MM-DD at the time of the event */
  day: string;
}

export interface AttemptEvent extends Base {
  type: 'attempt';
  stepId: string;
  conceptId?: string;
  topicId?: string;
  context: EventContext;
  /** false for explain screens */
  problem: boolean;
  seed: number;
  correct: boolean;
  /** true if this attempt concludes the step (correct, or solution shown) */
  final: boolean;
  attemptNo: number;
  hintsUsed: number;
  revealed?: boolean;
  durationMs: number;
  difficulty: number;
  state?: unknown;
}

export interface ConceptCompletedEvent extends Base {
  type: 'concept_completed';
  conceptId: string;
  topicId: string;
  problems: number;
  firstTryCorrect: number;
  durationMs: number;
}

export interface ReviewEvent extends Base {
  type: 'review';
  itemId: string;
  rating: 1 | 2 | 3 | 4;
  seed: number;
}

export interface ReviewSessionEvent extends Base {
  type: 'review_session_completed';
  items: number;
  correct: number;
  unitId?: string;
}

export interface PlacementEvent extends Base {
  type: 'placement_completed';
  topicId: string;
  unitId?: string;
  correct: number;
  total: number;
}

export type LumenEvent = AttemptEvent | ConceptCompletedEvent | ReviewEvent | ReviewSessionEvent | PlacementEvent;

export const XP = {
  conceptCompleted: 10,
  reviewSession: 5,
} as const;

export const FREEZES_PER_WEEK = 2;
/** Problems that make a day count for the streak. */
export const STREAK_PROBLEMS = 3;
/** Cap per step so idle time does not inflate the daily goal. */
export const MAX_STEP_MS = 3 * 60 * 1000;

// ---------- calendar helpers (on day keys, timezone-free) ----------

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function keyToUTC(k: string): number {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(k: string, n: number): string {
  return utcToKey(keyToUTC(k) + n * 86400000);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000);
}

/** Monday of the ISO week containing day k. */
export function weekKey(k: string): string {
  const dow = (new Date(keyToUTC(k)).getUTCDay() + 6) % 7; // Mon=0
  return addDays(k, -dow);
}

// ---------- derivation ----------

export interface DayActivity {
  xp: number;
  problemsSolved: number;
  conceptsCompleted: number;
  reviewSessions: number;
  ms: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
  todayDone: boolean;
  /** Days bridged by an automatic freeze, newest first. */
  frozenDays: string[];
  freezesLeftThisWeek: number;
}

export interface ProgressSummary {
  xpTotal: number;
  xpThisWeek: number;
  days: Record<string, DayActivity>;
  streak: StreakInfo;
  minutesToday: number;
  completedConcepts: Set<string>;
  /** lesson id → last completion day */
  lastCompleted: Record<string, string>;
  problemsSolved: number;
  firstTryAccuracy: number | null;
}

function emptyDay(): DayActivity {
  return { xp: 0, problemsSolved: 0, conceptsCompleted: 0, reviewSessions: 0, ms: 0 };
}

export function sortEvents(events: readonly LumenEvent[]): LumenEvent[] {
  return [...events].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
}

/** Merges two logs idempotently by event id. */
export function mergeEvents(a: readonly LumenEvent[], b: readonly LumenEvent[]): LumenEvent[] {
  const map = new Map<string, LumenEvent>();
  for (const e of [...a, ...b]) map.set(e.id, e);
  return sortEvents([...map.values()]);
}

export function isActiveDay(d: DayActivity | undefined): boolean {
  return !!d && (d.conceptsCompleted > 0 || d.problemsSolved >= STREAK_PROBLEMS || d.reviewSessions > 0);
}

/**
 * Streak with automatic freezes: up to FREEZES_PER_WEEK missed days per ISO
 * week are bridged. Freezes spent on a gap that ultimately breaks the streak
 * are refunded. Today never breaks the streak (the day is not over yet).
 */
export function computeStreak(days: Record<string, DayActivity>, today: string): StreakInfo {
  const active = Object.keys(days).filter((k) => isActiveDay(days[k])).sort();
  const todayDone = isActiveDay(days[today]);
  const empty: StreakInfo = { current: 0, longest: 0, todayDone, frozenDays: [], freezesLeftThisWeek: FREEZES_PER_WEEK };
  if (!active.length) return empty;
  const used = new Map<string, number>();
  const frozen: string[] = [];
  let pending: string[] = [];
  let run = 0;
  let longest = 0;
  const yesterday = addDays(today, -1);
  for (let d = active[0]; d <= yesterday || d === today; d = addDays(d, 1)) {
    if (d === today) {
      if (todayDone) {
        frozen.push(...pending);
        pending = [];
        run++;
      }
      break;
    }
    if (isActiveDay(days[d])) {
      frozen.push(...pending);
      pending = [];
      run++;
    } else {
      const wk = weekKey(d);
      const n = used.get(wk) ?? 0;
      if (run > 0 && n < FREEZES_PER_WEEK) {
        used.set(wk, n + 1);
        pending.push(d);
      } else {
        for (const p of pending) used.set(weekKey(p), (used.get(weekKey(p)) ?? 1) - 1);
        pending = [];
        run = 0;
      }
    }
    longest = Math.max(longest, run);
    if (d > today) break;
  }
  longest = Math.max(longest, run);
  // Pending freezes (gap up to yesterday) keep the streak alive until today ends.
  frozen.push(...pending);
  return {
    current: run,
    longest,
    todayDone,
    frozenDays: frozen.reverse(),
    freezesLeftThisWeek: Math.max(0, FREEZES_PER_WEEK - (used.get(weekKey(today)) ?? 0)),
  };
}

/**
 * XP rules:
 *  - solved problem: its difficulty (1–3) XP, once per step and day
 *  - concept completed: +10, once per concept and day
 *  - review session: +5
 * Repeating on the same day gives no XP; on a later day it does again.
 *
 * With a catalog, completions logged before concepts were cut into short
 * lessons count for the core lessons of that concept.
 */
export function deriveProgress(events: readonly LumenEvent[], today: string, catalog?: Pick<Catalog, 'concepts' | 'groups'> | null): ProgressSummary {
  const days: Record<string, DayActivity> = {};
  const stepXpDays = new Set<string>();
  const conceptXpDays = new Set<string>();
  const completed = new Set<string>();
  const lastCompleted: Record<string, string> = {};
  let xpTotal = 0;
  let problemsSolved = 0;
  let firstTries = 0;
  let firstTryCorrect = 0;
  const day = (k: string) => (days[k] ??= emptyDay());

  for (const e of sortEvents(events)) {
    const d = day(e.day);
    switch (e.type) {
      case 'attempt': {
        d.ms += Math.min(Math.max(0, e.durationMs), MAX_STEP_MS);
        if (!e.problem) break;
        if (e.attemptNo === 1 && e.context !== 'placement') {
          firstTries++;
          if (e.correct) firstTryCorrect++;
        }
        if (e.final && e.correct && !e.revealed) {
          problemsSolved++;
          d.problemsSolved++;
          const key = `${e.stepId}@${e.day}`;
          if (!stepXpDays.has(key) && e.context !== 'placement') {
            stepXpDays.add(key);
            const xp = Math.min(3, Math.max(1, e.difficulty || 1));
            d.xp += xp;
            xpTotal += xp;
          }
        }
        break;
      }
      case 'concept_completed': {
        d.conceptsCompleted++;
        for (const id of completedLessons(catalog, e.conceptId)) {
          completed.add(id);
          lastCompleted[id] = e.day;
        }
        const key = `${e.conceptId}@${e.day}`;
        if (!conceptXpDays.has(key)) {
          conceptXpDays.add(key);
          d.xp += XP.conceptCompleted;
          xpTotal += XP.conceptCompleted;
        }
        break;
      }
      case 'review_session_completed':
        if (e.items > 0) {
          d.reviewSessions++;
          d.xp += XP.reviewSession;
          xpTotal += XP.reviewSession;
        }
        break;
      default:
        break;
    }
  }

  const week = weekKey(today);
  const xpThisWeek = Object.entries(days)
    .filter(([k]) => weekKey(k) === week)
    .reduce((s, [, v]) => s + v.xp, 0);

  return {
    xpTotal,
    xpThisWeek,
    days,
    streak: computeStreak(days, today),
    minutesToday: Math.round(((days[today]?.ms ?? 0) / 60000) * 10) / 10,
    completedConcepts: completed,
    lastCompleted,
    problemsSolved,
    firstTryAccuracy: firstTries ? firstTryCorrect / firstTries : null,
  };
}

export interface OpenMistake {
  stepId: string;
  conceptId?: string;
  topicId?: string;
  seed: number;
  /** The learner's wrong answer, to revisit it with the tutor. */
  state: unknown;
  ts: number;
}

/**
 * Steps where the learner went wrong and has not yet cleared the mistake in a
 * mistakes review. Keeps the newest wrong attempt per step (same variant, same
 * answer), oldest mistakes first.
 */
export function openMistakes(events: readonly LumenEvent[], filter: { topicId?: string; conceptId?: string } = {}): OpenMistake[] {
  const byStep = new Map<string, OpenMistake>();
  for (const e of events) {
    if (e.type !== 'attempt' || !e.problem || e.context === 'placement') continue;
    if (filter.topicId && e.topicId !== filter.topicId) continue;
    if (filter.conceptId && e.conceptId !== filter.conceptId) continue;
    if (!e.correct && e.state !== undefined) byStep.set(e.stepId, { stepId: e.stepId, conceptId: e.conceptId, topicId: e.topicId, seed: e.seed, state: e.state, ts: e.ts });
    else if (e.correct && e.context === 'mistakes') {
      const open = byStep.get(e.stepId);
      if (open && open.ts <= e.ts) byStep.delete(e.stepId);
    }
  }
  return [...byStep.values()].sort((a, b) => a.ts - b.ts);
}
