import { describe, expect, it } from 'vitest';
import { compileContent, completedLessons, isLastCorePart, lessonExtras, resolveLesson, splitBundles } from '../src/compile.ts';
import { chunkSteps, LESSON_MAX_STEPS, LESSON_MIN_STEPS, planLessons } from '../src/lessons.ts';
import { deriveProgress, type LumenEvent } from '../src/progress.ts';
import { deriveReviewItems } from '../src/srs.ts';
import type { Concept, Step } from '../src/schema.ts';

const explain = (id: string, depth?: number, extra: Record<string, unknown> = {}): Step => ({ kind: 'explain', id: `c/${id}`, body: `Die **Idee ${id}** in einem Satz.`, ...(depth ? { depth } : {}), ...extra }) as Step;
const problem = (id: string, depth?: number): Step => ({ kind: 'problem', id: `c/${id}`, widget: 'numeric', params: {}, prompt: '1 + 1?', answer: { value: 2 }, hints: [], feedback: [], difficulty: 1, ...(depth ? { depth } : {}) }) as Step;

const concept = (steps: Step[], cards: string[] = []): Concept => ({ id: 'c', type: 'concept', title: 'Concept', summary: 'Summary', locale: 'de', license: 'CC-BY-SA-4.0', authors: ['x'], skills: [], estimated_minutes: 14, steps, srs: cards.length ? { cards_from: cards.map((c) => `c/${c}`) } : undefined });

describe('chunkSteps', () => {
  it('keeps a short tier in one lesson', () => {
    const steps = [explain('i'), problem('a'), problem('b'), problem('c')];
    expect(chunkSteps(steps)).toEqual([steps]);
    expect(chunkSteps([])).toEqual([]);
  });

  it('cuts long tiers into balanced lessons within the size limits', () => {
    for (let n = LESSON_MAX_STEPS + 1; n <= 20; n++) {
      const steps = Array.from({ length: n }, (_, i) => problem(`p${i}`));
      const chunks = chunkSteps(steps);
      expect(chunks.flat()).toEqual(steps);
      expect(chunks.length).toBe(Math.ceil(n / LESSON_MAX_STEPS));
      for (const c of chunks) {
        expect(c.length).toBeLessThanOrEqual(LESSON_MAX_STEPS);
        expect(c.length).toBeGreaterThanOrEqual(LESSON_MIN_STEPS);
      }
      const sizes = chunks.map((c) => c.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it('never ends a lesson on an explanation when it can cut elsewhere', () => {
    // 8 steps: an even 4 + 4 would cut between the explanation e2 and the problem that practises it
    const steps = [explain('i', undefined, { intro: true }), problem('a'), problem('b'), explain('e2'), problem('c'), problem('d'), problem('e'), problem('f')];
    const [first, second] = chunkSteps(steps);
    expect(first[first.length - 1].kind).toBe('problem');
    expect(second[0].id).toBe('c/e2');
  });
});

describe('planLessons', () => {
  const steps = [explain('intro', undefined, { intro: true }), problem('a'), explain('e1'), problem('b'), problem('c'), explain('e2'), problem('d'), problem('e'), problem('d1', 2), problem('d2', 2), explain('x0', 3), problem('x1', 3)];
  const lessons = planLessons(concept(steps, ['b', 'e', 'd2']));

  it('cuts the core into parts and makes each deeper tier a lesson of its own', () => {
    expect(lessons.map((l) => l.id)).toEqual(['c~c1', 'c~c2', 'c~d1', 'c~x1']);
    expect(lessons.map((l) => [l.depth, l.part, l.parts])).toEqual([[1, 1, 2], [1, 2, 2], [2, 1, 1], [3, 1, 1]]);
    expect(lessons.flatMap((l) => l.steps)).toEqual(steps);
    for (const l of lessons) {
      expect(l.group).toBe('c');
      expect(new Set(l.steps.map((s) => s.depth ?? 1))).toEqual(new Set([l.depth]));
      expect(l.estimated_minutes).toBeGreaterThanOrEqual(1);
    }
    expect(lessons.reduce((s, l) => s + l.estimated_minutes, 0)).toBeGreaterThanOrEqual(12);
  });

  it('keeps step ids and gives each review card to the lesson that holds its step', () => {
    expect(lessons.map((l) => l.srs?.cards_from ?? [])).toEqual([['c/b'], ['c/e'], ['c/d2'], []]);
    expect(lessons[0].steps[0].id).toBe('c/intro');
  });

  it('names the parts after their key terms', () => {
    expect(lessons[1].focus).toBe('Idee e2');
    expect(lessons[2].focus).toBeUndefined();
  });

  it('a concept that fits into one lesson keeps its id', () => {
    const one = planLessons(concept([explain('i'), problem('a'), problem('b')]));
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ id: 'c', group: 'c', depth: 1, part: 1, parts: 1 });
  });
});

describe('bundles and progress', () => {
  const yaml = (id: string, extra = '') => `id: ${id}
type: concept
title: Lesson ${id}
license: CC-BY-SA-4.0
authors: ["x"]
estimated_minutes: 10
steps:
  - { kind: explain, id: in, intro: true, body: "Hello **World**." }
  - { kind: problem, id: aa, widget: numeric, prompt: "1 + 1?", answer: { value: 2 } }
  - { kind: problem, id: bb, widget: numeric, prompt: "1 + 2?", answer: { value: 3 } }
${extra}`;
  const deep = `  - { kind: problem, id: dd, depth: 2, widget: numeric, prompt: "2 + 2?", answer: { value: 4 } }
  - { kind: problem, id: xx, depth: 3, widget: numeric, prompt: "3 + 3?", answer: { value: 6 } }
srs:
  cards_from: [aa, dd]
`;
  const { course } = compileContent([
    { path: 'a.yaml', text: yaml('t.a', deep) },
    { path: 'b.yaml', text: yaml('t.b') },
    { path: 't.yaml', text: 'id: tp\ntype: topic\ntitle: T\ndescription: D\nlevel: Einstieg\narea: math\nlicense: CC-BY-SA-4.0\nauthors: ["x"]\nunits:\n  - { id: t.u, title: U, concepts: [t.a, t.b] }\n' },
  ]);
  const { catalog, topics } = splitBundles(course);

  it('lists the core lessons in the units and keeps the extras reachable', () => {
    expect(catalog.topics[0].units[0].concepts).toEqual(['t.a~c1', 't.b']);
    expect(catalog.groups).toEqual({ 't.a': ['t.a~c1', 't.a~d1', 't.a~x1'], 't.b': ['t.b'] });
    expect(lessonExtras(catalog, 't.a~c1')).toEqual(['t.a~d1', 't.a~x1']);
    expect(lessonExtras(catalog, 't.b')).toEqual([]);
    expect(isLastCorePart(catalog, 't.a~c1')).toBe(true);
    expect(isLastCorePart(catalog, 't.a~d1')).toBe(false);
    expect(topics[0].concepts.map((c) => c.id)).toEqual(['t.a~c1', 't.a~d1', 't.a~x1', 't.b']);
    expect(catalog.concepts['t.a~d1']).toMatchObject({ depth: 2, group: 't.a', topicId: 'tp', unitId: 't.u', problems: 1, steps: 1, srsCards: ['t.a/dd'] });
    // the authored course is untouched: evals keep seeing whole concepts
    expect(course.topics[0].units[0].concepts).toEqual(['t.a', 't.b']);
  });

  it('resolves concept ids from old links and events', () => {
    expect(completedLessons(catalog, 't.a')).toEqual(['t.a~c1']);
    expect(completedLessons(catalog, 't.a~d1')).toEqual(['t.a~d1']);
    expect(completedLessons(catalog, 'gone')).toEqual(['gone']);
    expect(resolveLesson(catalog, 't.a')).toBe('t.a~c1');
    expect(resolveLesson(catalog, 't.a~x1')).toBe('t.a~x1');
    expect(resolveLesson(catalog, 't.b', new Set(['t.b']))).toBe('t.b');
  });

  const done = (n: number, conceptId: string): LumenEvent => ({ id: `e${n}`, type: 'concept_completed', ts: Date.parse('2026-11-16T10:00:00Z') + n, day: '2026-11-16', conceptId, topicId: 't', problems: 2, firstTryCorrect: 2, durationMs: 1000 });

  it('a completion from before the cut counts for the core lessons of the concept', () => {
    const p = deriveProgress([done(1, 't.a')], '2026-11-16', catalog);
    expect([...p.completedConcepts].sort()).toEqual(['t.a~c1']);
    expect(p.lastCompleted['t.a~c1']).toBe('2026-11-16');
    expect(p.xpTotal).toBe(10);
    // without a catalog (on the server) nothing is mapped
    expect([...deriveProgress([done(1, 't.a')], '2026-11-16').completedConcepts]).toEqual(['t.a']);
  });

  it('new completions name the lesson, each one earns its XP', () => {
    const p = deriveProgress([done(1, 't.a~c1'), done(2, 't.a~d1'), done(3, 't.b')], '2026-11-16', catalog);
    expect([...p.completedConcepts].sort()).toEqual(['t.a~c1', 't.a~d1', 't.b']);
    expect(p.xpTotal).toBe(30);
  });

  it('review cards start with the lesson that holds them; an old completion starts all cards of the concept', () => {
    expect([...deriveReviewItems([done(1, 't.a~c1')], catalog).keys()]).toEqual(['t.a/aa']);
    expect([...deriveReviewItems([done(1, 't.a~c1'), done(2, 't.a~d1')], catalog).keys()]).toEqual(['t.a/aa', 't.a/dd']);
    const old = deriveReviewItems([done(1, 't.a')], catalog);
    expect([...old.keys()].sort()).toEqual(['t.a/aa', 't.a/dd']);
    expect(old.get('t.a/dd')).toMatchObject({ conceptId: 't.a~d1', topicId: 'tp' });
  });
});
