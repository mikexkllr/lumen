/**
 * Lessons: authors write one concept with three depth tiers, learners get a
 * handful of steps at a time. Every concept is cut into short lessons when the
 * bundles for the apps are built – never across tiers, never longer than
 * LESSON_MAX_STEPS. The core tier becomes the lessons on the learning path;
 * the deeper and expert tiers become optional extras of their own.
 *
 * Step ids stay `concept/step`, so progress, mistakes and spaced repetition
 * keep working when a concept is cut differently later on.
 */
import { keyTerms } from './recall.ts';
import type { Concept, Step } from './schema.ts';

/** Segments in the progress bar of one lesson, at most. */
export const LESSON_MAX_STEPS = 6;
/** A lesson shorter than this is not worth a celebration (unless the tier itself is that short). */
export const LESSON_MIN_STEPS = 3;

export type LessonDepth = 1 | 2 | 3;

const TIER_CODE: Record<LessonDepth, string> = { 1: 'c', 2: 'd', 3: 'x' };

export interface Lesson extends Concept {
  /** The authored concept this lesson was cut from. */
  group: string;
  /** 1 = core (on the path), 2 = deeper, 3 = expert (both optional extras). */
  depth: LessonDepth;
  /** Position among the lessons of the same tier (from 1) and how many there are. */
  part: number;
  parts: number;
  /** Key terms of this lesson, to tell the parts of one concept apart. */
  focus?: string;
}

/**
 * Cuts the steps of one tier into balanced lessons. A cut prefers to fall in
 * front of an explanation (a new idea starts there) and avoids falling right
 * behind one (the explanation would lose the problem that practises it).
 */
export function chunkSteps(steps: readonly Step[]): Step[][] {
  const n = steps.length;
  if (!n) return [];
  if (n <= LESSON_MAX_STEPS) return [[...steps]];
  const k = Math.ceil(n / LESSON_MAX_STEPS);
  const ideal = n / k;
  const cutCost = (i: number) => (steps[i - 1].kind === 'explain' ? 4 : 0) - (steps[i].kind === 'explain' ? 0.5 : 0);
  const chunkCost = (from: number, to: number) => (to - from - ideal) ** 2 + (steps.slice(from, to).some((s) => s.kind === 'problem') ? 0 : 6);
  let best: { cost: number; cuts: number[] } | null = null;
  const walk = (start: number, left: number, cuts: number[], cost: number) => {
    if (left === 1) {
      const size = n - start;
      if (size < LESSON_MIN_STEPS || size > LESSON_MAX_STEPS) return;
      const total = cost + chunkCost(start, n);
      if (!best || total < best.cost - 1e-9) best = { cost: total, cuts };
      return;
    }
    for (let size = LESSON_MIN_STEPS; size <= LESSON_MAX_STEPS; size++) {
      const cut = start + size;
      if (n - cut < (left - 1) * LESSON_MIN_STEPS) break;
      walk(cut, left - 1, [...cuts, cut], cost + chunkCost(start, cut) + cutCost(cut));
    }
  };
  walk(0, k, [], 0);
  const cuts = (best as { cost: number; cuts: number[] } | null)?.cuts ?? Array.from({ length: k - 1 }, (_v, i) => Math.round((i + 1) * ideal));
  const out: Step[][] = [];
  let from = 0;
  for (const cut of [...cuts, n]) {
    out.push(steps.slice(from, cut));
    from = cut;
  }
  return out;
}

/** Up to two key terms from the explanations of a lesson. */
function focusOf(steps: readonly Step[]): string | undefined {
  const terms: string[] = [];
  for (const s of steps) {
    if (s.kind !== 'explain') continue;
    for (const term of [...keyTerms(s.body), ...(s.reveal ? keyTerms(s.reveal.body) : [])]) if (!terms.some((x) => x.toLowerCase() === term.toLowerCase())) terms.push(term);
  }
  return terms.length ? terms.slice(0, 2).join(' · ') : undefined;
}

/**
 * The lessons of one concept, in learning order: core parts, then deeper, then
 * expert. A concept that fits into one lesson keeps its id; otherwise the
 * lessons are called `<concept>~c1`, `~c2` (core), `~d1` (deeper), `~x1` (expert).
 */
export function planLessons(concept: Concept): Lesson[] {
  const tiers: Record<LessonDepth, Step[]> = { 1: [], 2: [], 3: [] };
  for (const s of concept.steps) tiers[(s.depth ?? 1) as LessonDepth].push(s);
  const chunks = ([1, 2, 3] as const).flatMap((depth) => {
    const parts = chunkSteps(tiers[depth]);
    return parts.map((steps, i) => ({ depth, part: i + 1, parts: parts.length, steps }));
  });
  const single = chunks.length === 1;
  const cards = new Set(concept.srs?.cards_from ?? []);
  return chunks.map((ch) => {
    const own = ch.steps.filter((s) => cards.has(s.id)).map((s) => s.id);
    return {
      ...concept,
      id: single ? concept.id : `${concept.id}~${TIER_CODE[ch.depth]}${ch.part}`,
      estimated_minutes: Math.max(1, Math.round((concept.estimated_minutes * ch.steps.length) / concept.steps.length)),
      steps: ch.steps,
      srs: own.length ? { cards_from: own } : undefined,
      group: concept.id,
      depth: ch.depth,
      part: ch.part,
      parts: ch.parts,
      focus: focusOf(ch.steps),
    };
  });
}

/** The authored concept a step belongs to (step ids are `concept/step`). */
export const groupOfStep = (stepId: string): string => stepId.split('/')[0];
