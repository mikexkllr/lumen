/**
 * Spaced repetition on top of FSRS (ts-fsrs). A review item is a problem step
 * with a variant generator: each review shows a fresh variant, so learners
 * retrieve the idea instead of a memorised answer.
 *
 * Card states are not stored: they are replayed from the event log, which
 * keeps sync conflict-free.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { Catalog } from './compile.ts';
import type { AttemptEvent, LumenEvent } from './progress.ts';
import { sortEvents } from './progress.ts';

export type ReviewRating = 1 | 2 | 3 | 4;

export const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.9 }));

/** Fast answers are rated Easy. */
export const FAST_MS = 12_000;

/**
 * Automatic rating: wrong → Again, right with hint/second try → Hard,
 * right → Good, right and fast → Easy.
 */
export function deriveRating(r: { correct: boolean; revealed?: boolean; hintsUsed: number; attemptNo: number; durationMs: number }): ReviewRating {
  if (!r.correct || r.revealed) return Rating.Again as ReviewRating;
  if (r.hintsUsed > 0 || r.attemptNo > 1) return Rating.Hard as ReviewRating;
  if (r.durationMs <= FAST_MS) return Rating.Easy as ReviewRating;
  return Rating.Good as ReviewRating;
}

export interface ReviewItemState {
  itemId: string;
  conceptId: string;
  topicId: string;
  card: Card;
  reviews: number;
  lastRating: ReviewRating;
}

/** Replays the log: the first lesson attempt counts as the first review. */
export function deriveReviewItems(events: readonly LumenEvent[], catalog: Catalog): Map<string, ReviewItemState> {
  const cardOwner = new Map<string, { conceptId: string; topicId: string; group: string }>();
  for (const c of Object.values(catalog.concepts)) for (const id of c.srsCards) cardOwner.set(id, { conceptId: c.id, topicId: c.topicId, group: c.group ?? c.id });

  const items = new Map<string, ReviewItemState>();
  const pendingLesson = new Map<string, AttemptEvent[]>();
  const sorted = sortEvents(events);
  for (const e of sorted) {
    if (e.type === 'attempt' && e.context === 'lesson' && cardOwner.has(e.stepId)) {
      const list = pendingLesson.get(e.stepId) ?? [];
      list.push(e);
      pendingLesson.set(e.stepId, list);
    }
    if (e.type === 'concept_completed') {
      // a completion from before concepts were cut into lessons names the whole concept: all its cards start
      const whole = !catalog.concepts[e.conceptId];
      for (const [stepId, { group, ...owner }] of cardOwner) {
        if ((whole ? group : owner.conceptId) !== e.conceptId || items.has(stepId)) continue;
        const attempts = pendingLesson.get(stepId) ?? [];
        const final = attempts.find((a) => a.final) ?? attempts[attempts.length - 1];
        const rating = final
          ? deriveRating({ correct: final.correct, revealed: final.revealed, hintsUsed: final.hintsUsed, attemptNo: final.attemptNo, durationMs: attempts.reduce((s, a) => s + a.durationMs, 0) })
          : (Rating.Good as ReviewRating);
        const now = new Date(e.ts);
        const card = scheduler.next(createEmptyCard(now), now, rating as Grade).card;
        items.set(stepId, { itemId: stepId, ...owner, card, reviews: 1, lastRating: rating });
      }
    }
    if (e.type === 'review') {
      const it = items.get(e.itemId);
      if (!it) continue;
      const now = new Date(e.ts);
      it.card = scheduler.next(it.card, now, e.rating as Grade).card;
      it.reviews++;
      it.lastRating = e.rating;
    }
  }
  return items;
}

export function retrievability(item: ReviewItemState, now: Date): number {
  return scheduler.retrievability(item.card, now);
}

export function endOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function dueItems(items: Map<string, ReviewItemState>, now: Date): ReviewItemState[] {
  const limit = endOfDay(now).getTime();
  return [...items.values()].filter((it) => new Date(it.card.due).getTime() <= limit);
}

/** Items per session derived from the daily goal (≈ 1 item per minute). */
export function sessionSize(dailyGoalMinutes: number): number {
  return Math.max(5, Math.min(20, Math.round(dailyGoalMinutes)));
}

/**
 * Builds a review session: due items sorted by retrievability (most at risk
 * first), interleaved round-robin across topics.
 */
export function buildReviewSession(items: Map<string, ReviewItemState>, now: Date, max: number): ReviewItemState[] {
  const due = dueItems(items, now).sort((a, b) => retrievability(a, now) - retrievability(b, now));
  const byTopic = new Map<string, ReviewItemState[]>();
  for (const it of due) byTopic.set(it.topicId, [...(byTopic.get(it.topicId) ?? []), it]);
  const queues = [...byTopic.values()];
  const out: ReviewItemState[] = [];
  while (out.length < max && queues.some((q) => q.length)) {
    for (const q of queues) {
      const it = q.shift();
      if (it && out.length < max) out.push(it);
    }
  }
  return out;
}

/**
 * Knowledge-graph fallback: when an item fails, find review items that train
 * prerequisite skills of the failed item's concept.
 */
export function prerequisiteItems(failedItemId: string, items: Map<string, ReviewItemState>, catalog: Catalog, exclude: Set<string>, max = 2): ReviewItemState[] {
  const failed = items.get(failedItemId);
  if (!failed) return [];
  const concept = catalog.concepts[failed.conceptId];
  const skillMap = new Map(catalog.skills.map((s) => [s.id, s]));
  const prereqs = new Set<string>();
  for (const sk of concept?.skills ?? []) for (const p of skillMap.get(sk)?.prerequisites ?? []) prereqs.add(p);
  if (!prereqs.size) return [];
  const out: ReviewItemState[] = [];
  for (const it of items.values()) {
    if (exclude.has(it.itemId) || it.itemId === failedItemId) continue;
    const c = catalog.concepts[it.conceptId];
    if (c?.skills.some((s) => prereqs.has(s))) out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

/** Earliest due date over all items (for "next review" previews). */
export function nextDue(items: Map<string, ReviewItemState>): Date | null {
  let min: number | null = null;
  for (const it of items.values()) {
    const t = new Date(it.card.due).getTime();
    if (min === null || t < min) min = t;
  }
  return min === null ? null : new Date(min);
}
