import { describe, expect, it } from 'vitest';
import { addDays, computeStreak, deriveProgress, mergeEvents, openMistakes, weekKey, type DayActivity, type LumenEvent } from '../src/progress.ts';
import { buildReviewSession, deriveRating, deriveReviewItems, dueItems } from '../src/srs.ts';
import type { Catalog } from '../src/compile.ts';

let n = 0;
const id = () => `e${++n}`;
const attempt = (day: string, stepId: string, over: Partial<LumenEvent> = {}): LumenEvent => ({
  id: id(), type: 'attempt', ts: Date.parse(`${day}T10:00:00Z`) + n, day, stepId, context: 'lesson', problem: true, seed: 0,
  correct: true, final: true, attemptNo: 1, hintsUsed: 0, durationMs: 20000, difficulty: 2, ...over,
} as LumenEvent);
const completed = (day: string, conceptId: string): LumenEvent => ({ id: id(), type: 'concept_completed', ts: Date.parse(`${day}T11:00:00Z`) + n, day, conceptId, topicId: 't', problems: 3, firstTryCorrect: 3, durationMs: 300000 });

const active: DayActivity = { xp: 10, problemsSolved: 0, conceptsCompleted: 1, reviewSessions: 0, ms: 0 };

describe('calendar', () => {
  it('computes ISO week starts', () => {
    expect(weekKey('2026-11-18')).toBe('2026-11-16'); // Wednesday → Monday
    expect(weekKey('2026-11-16')).toBe('2026-11-16');
    expect(weekKey('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('XP', () => {
  it('awards XP once per step and concept per day, again on a later day', () => {
    const evs = [attempt('2026-11-16', 'c/s1'), attempt('2026-11-16', 'c/s1'), completed('2026-11-16', 'c'), completed('2026-11-16', 'c'), attempt('2026-11-17', 'c/s1')];
    const p = deriveProgress(evs, '2026-11-17');
    expect(p.days['2026-11-16'].xp).toBe(2 + 10);
    expect(p.days['2026-11-17'].xp).toBe(2);
    expect(p.xpTotal).toBe(14);
    expect(p.xpThisWeek).toBe(14);
  });

  it('gives no XP for revealed solutions or placement', () => {
    const evs = [attempt('2026-11-16', 'a', { revealed: true, correct: false }), attempt('2026-11-16', 'b', { context: 'placement' })];
    expect(deriveProgress(evs, '2026-11-16').xpTotal).toBe(0);
  });
});

describe('streak', () => {
  it('counts consecutive active days and keeps today open', () => {
    const days = { '2026-11-14': active, '2026-11-15': active, '2026-11-16': active };
    expect(computeStreak(days, '2026-11-17')).toMatchObject({ current: 3, todayDone: false });
    expect(computeStreak({ ...days, '2026-11-17': active }, '2026-11-17')).toMatchObject({ current: 4, todayDone: true, longest: 4 });
  });

  it('bridges up to two missed days per week with freezes', () => {
    // Mon active, Tue+Wed missed, Thu active (today)
    const s = computeStreak({ '2026-11-16': active, '2026-11-19': active }, '2026-11-19');
    expect(s.current).toBe(2);
    expect(s.frozenDays).toEqual(['2026-11-18', '2026-11-17']);
    expect(s.freezesLeftThisWeek).toBe(0);
  });

  it('breaks after three missed days in one week and refunds unused freezes', () => {
    const s = computeStreak({ '2026-11-16': active, '2026-11-20': active }, '2026-11-20');
    expect(s.current).toBe(1);
    expect(s.frozenDays).toEqual([]);
    expect(s.freezesLeftThisWeek).toBe(2);
  });

  it('three solved problems make a day count', () => {
    const evs = ['a', 'b', 'c'].map((s) => attempt('2026-11-16', s));
    expect(deriveProgress(evs, '2026-11-16').streak.current).toBe(1);
    expect(deriveProgress(evs.slice(0, 2), '2026-11-16').streak.current).toBe(0);
  });
});

describe('sync merge', () => {
  it('is idempotent and order independent', () => {
    const a = [attempt('2026-11-16', 'x'), attempt('2026-11-16', 'y')];
    const b = [a[1], attempt('2026-11-17', 'z')];
    const m1 = mergeEvents(a, b);
    const m2 = mergeEvents(b, mergeEvents(a, a));
    expect(m1.map((e) => e.id)).toEqual(m2.map((e) => e.id));
    expect(m1).toHaveLength(3);
  });
});

describe('spaced repetition', () => {
  const catalog = {
    concepts: {
      c1: { id: 'c1', title: '', estimated_minutes: 5, skills: ['s2'], topicId: 't1', unitId: 'u', problems: 1, steps: 1, srsCards: ['c1/s1'] },
      c0: { id: 'c0', title: '', estimated_minutes: 5, skills: ['s1'], topicId: 't0', unitId: 'u', problems: 1, steps: 1, srsCards: ['c0/s1'] },
    },
    skills: [{ id: 's1', title: '', prerequisites: [] }, { id: 's2', title: '', prerequisites: ['s1'] }],
    paths: [], topics: [], schema: '0.1', locale: 'de',
  } as unknown as Catalog;

  it('derives ratings from performance', () => {
    expect(deriveRating({ correct: false, hintsUsed: 0, attemptNo: 1, durationMs: 1 })).toBe(1);
    expect(deriveRating({ correct: true, hintsUsed: 1, attemptNo: 1, durationMs: 1 })).toBe(2);
    expect(deriveRating({ correct: true, hintsUsed: 0, attemptNo: 1, durationMs: 30000 })).toBe(3);
    expect(deriveRating({ correct: true, hintsUsed: 0, attemptNo: 1, durationMs: 5000 })).toBe(4);
  });

  it('introduces cards on concept completion and schedules them in the future', () => {
    const evs = [attempt('2026-11-16', 'c1/s1'), completed('2026-11-16', 'c1')];
    const items = deriveReviewItems(evs, catalog);
    expect(items.size).toBe(1);
    const it1 = items.get('c1/s1')!;
    expect(new Date(it1.card.due).getTime()).toBeGreaterThan(Date.parse('2026-11-16T12:00:00Z'));
    expect(dueItems(items, new Date('2026-11-16T12:00:00Z'))).toHaveLength(0);
    expect(dueItems(items, new Date('2026-12-30T12:00:00Z'))).toHaveLength(1);
  });

  it('a failed lesson attempt makes the card due soon, reviews push it out', () => {
    const evs: LumenEvent[] = [attempt('2026-11-16', 'c1/s1', { correct: false, revealed: true }), completed('2026-11-16', 'c1')];
    const items = deriveReviewItems(evs, catalog);
    const due1 = new Date(items.get('c1/s1')!.card.due).getTime();
    expect(due1 - Date.parse('2026-11-16T11:00:00Z')).toBeLessThanOrEqual(2 * 86400000);
    evs.push({ id: id(), type: 'review', ts: due1 + 1000, day: '2026-11-17', itemId: 'c1/s1', rating: 3, seed: 5 });
    const after = deriveReviewItems(evs, catalog).get('c1/s1')!;
    expect(new Date(after.card.due).getTime()).toBeGreaterThan(due1);
    expect(after.reviews).toBe(2);
  });

  it('interleaves topics in a session', () => {
    const evs = [attempt('2026-11-16', 'c1/s1'), completed('2026-11-16', 'c1'), attempt('2026-11-16', 'c0/s1'), completed('2026-11-16', 'c0')];
    const items = deriveReviewItems(evs, catalog);
    const session = buildReviewSession(items, new Date('2027-01-30T12:00:00Z'), 10);
    expect(new Set(session.map((s) => s.topicId)).size).toBe(2);
  });
});

describe('open mistakes', () => {
  const at = (n: number, extra: Record<string, unknown>) => ({ id: `e${n}`, ts: n, day: '2026-11-19', type: 'attempt', problem: true, seed: 3, final: false, attemptNo: 1, hintsUsed: 0, durationMs: 1, difficulty: 1, topicId: 't', conceptId: 't.c', ...extra }) as never;
  it('collects wrong attempts until they are cleared in a mistakes review', () => {
    const events = [
      at(1, { stepId: 't.c/a', context: 'lesson', correct: false, state: { input: '6' } }),
      at(2, { stepId: 't.c/a', context: 'lesson', correct: true, attemptNo: 2 }),
      at(3, { stepId: 't.c/b', context: 'lesson', correct: false, state: { input: '1' } }),
      at(4, { stepId: 'u.c/x', context: 'lesson', correct: false, state: {}, topicId: 'u' }),
      at(5, { stepId: 't.c/b', context: 'mistakes', correct: true }),
    ];
    const open = openMistakes(events, { topicId: 't' });
    expect(open.map((m) => m.stepId)).toEqual(['t.c/a']);
    expect(open[0].state).toEqual({ input: '6' });
    expect(openMistakes(events).map((m) => m.stepId)).toEqual(['t.c/a', 'u.c/x']);
  });
});
