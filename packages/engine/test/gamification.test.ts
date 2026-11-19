import { describe, expect, it } from 'vitest';
import { dailyPuzzle, dailyQuests, dailySolved, dayStats, deriveAchievements, levelInfo, levelThreshold } from '../src/gamification.ts';
import { deriveProgress, type LumenEvent } from '../src/progress.ts';

let n = 0;
const at = (day: string, hour = 12) => ({ id: `e${n++}`, ts: new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime(), day });
const hit = (day: string, stepId: string, extra: Partial<LumenEvent> = {}): LumenEvent =>
  ({ ...at(day), type: 'attempt', stepId, context: 'lesson', problem: true, seed: 0, correct: true, final: true, attemptNo: 1, hintsUsed: 0, durationMs: 20000, difficulty: 2, ...extra }) as LumenEvent;
const miss = (day: string, stepId: string): LumenEvent => ({ ...hit(day, stepId), correct: false, final: false }) as LumenEvent;
const done = (day: string, conceptId: string, problems = 3, firstTryCorrect = 3, hour = 12): LumenEvent =>
  ({ ...at(day, hour), type: 'concept_completed', conceptId, topicId: 't', problems, firstTryCorrect, durationMs: 60000 }) as LumenEvent;

describe('levels', () => {
  it('thresholds grow quadratically', () => {
    expect(levelThreshold(1)).toBe(0);
    expect(levelThreshold(2)).toBe(50);
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(49).level).toBe(1);
    expect(levelInfo(50).level).toBe(2);
    expect(levelInfo(160)).toMatchObject({ level: 3, inLevel: 10, span: 150 });
  });
});

describe('achievements & quests', () => {
  const day = '2026-11-18';
  const events: LumenEvent[] = [hit(day, 'a'), hit(day, 'b'), hit(day, 'c'), hit(day, 'd'), hit(day, 'e'), miss(day, 'f'), hit(day, 'f', { attemptNo: 2 }), done(day, 'c1'), done(day, 'c2', 4, 2, 23)];
  const progress = deriveProgress(events, day);
  it('derives combos, perfect lessons and time-of-day badges', () => {
    const a = Object.fromEntries(deriveAchievements(events, null, progress).map((s) => [s.def.id, s.unlocked]));
    expect(a['first-lesson']).toBe(true);
    expect(a['combo-5']).toBe(true);
    expect(a['perfect-1']).toBe(true);
    expect(a['night-owl']).toBe(true);
    expect(a['lessons-10']).toBe(false);
  });
  it('day stats and quests are deterministic', () => {
    const s = dayStats(events, day);
    expect(s).toMatchObject({ solved: 6, combo: 5, lessons: 2, perfect: 1 });
    const q1 = dailyQuests(events, day, { dailyGoal: 10 });
    expect(q1).toHaveLength(3);
    expect(new Set(q1.map((q) => q.kind)).size).toBe(3);
    expect(dailyQuests(events, day, { dailyGoal: 10 })).toEqual(q1);
  });
  it('daily puzzle is stable per day and tracks solving', () => {
    const catalog = { schema: '', locale: 'de', paths: [], topics: [], skills: [], concepts: { c: { id: 'c', title: 'C', estimated_minutes: 5, skills: [], topicId: 't', unitId: 'u', problems: 2, steps: 3, srsCards: ['c/x', 'c/y'] } } };
    const p = dailyPuzzle(catalog, day)!;
    expect(dailyPuzzle(catalog, day)).toEqual(p);
    expect(['c/x', 'c/y']).toContain(p.itemId);
    expect(dailySolved([hit(day, p.itemId, { context: 'daily' })], day)).toBe('solved');
    expect(dailySolved([], day)).toBe('open');
  });
});
