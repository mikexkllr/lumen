import { describe, expect, it } from 'vitest';
import type { Catalog, ConceptMeta, ProgressSummary, Topic } from '@lumen/engine';
import { translate } from '../src/lib/i18n.ts';
import { courseSequence, lessonBlurb, lessonName, lessonTag, nextAfter } from '../src/lib/lessons.ts';

const meta = (id: string, group: string, depth: 1 | 2 | 3, part = 1, parts = 1, extra: Partial<ConceptMeta> = {}): ConceptMeta => ({ id, title: `Titel ${group}`, summary: 'Worum es geht', estimated_minutes: 3, skills: [], topicId: 'tp', unitId: 'tp.u1', problems: 3, steps: 5, srsCards: [], group, depth, part, parts, ...extra });

// a: two core parts plus deeper and expert; b: one lesson; c: core plus deeper
const concepts: Record<string, ConceptMeta> = Object.fromEntries(
  [meta('a~c1', 'a', 1, 1, 2), meta('a~c2', 'a', 1, 2, 2, { focus: 'Nenner · Zähler' }), meta('a~d1', 'a', 2), meta('a~x1', 'a', 3), meta('b', 'b', 1), meta('c~c1', 'c', 1), meta('c~d1', 'c', 2)].map((m) => [m.id, m]),
);
const topic = { id: 'tp', title: 'Kurs', area: 'math', prerequisites: [], units: [{ id: 'tp.u1', title: 'U1', concepts: ['a~c1', 'a~c2', 'b'], review: true }, { id: 'tp.u2', title: 'U2', concepts: ['c~c1'], review: true }] } as unknown as Topic;
const catalog = { topics: [topic], paths: [{ id: 'path.math', area: 'math', title: 'Mathe', topics: ['tp'] }], concepts, groups: { a: ['a~c1', 'a~c2', 'a~d1', 'a~x1'], b: ['b'], c: ['c~c1', 'c~d1'] }, skills: [] } as unknown as Catalog;
const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('de', k, v);

describe('lesson names', () => {
  it('tags parts and extras, leaves single lessons alone', () => {
    expect(lessonTag(concepts['a~c2'], t)).toBe('Teil 2 von 2');
    expect(lessonTag(concepts['a~d1'], t)).toBe('Tiefer');
    expect(lessonTag(concepts['a~x1'], t)).toBe('Experte');
    expect(lessonTag(concepts.b, t)).toBeNull();
    expect(lessonName(concepts['a~c1'], t)).toBe('Titel a · Teil 1 von 2');
    expect(lessonName(concepts.b, t)).toBe('Titel b');
    expect(lessonName(undefined, t)).toBe('');
  });

  it('describes later parts by their key terms', () => {
    expect(lessonBlurb(concepts['a~c1'])).toBe('Worum es geht');
    expect(lessonBlurb(concepts['a~c2'])).toBe('Nenner · Zähler');
    expect(lessonBlurb(concepts['a~d1'])).toBeUndefined();
  });
});

describe('the way through a course', () => {
  it('follows the core by default and takes the extras along for a deeper goal', () => {
    expect(courseSequence(catalog, topic)).toEqual(['a~c1', 'a~c2', 'b', 'c~c1']);
    expect(courseSequence(catalog, topic, 2)).toEqual(['a~c1', 'a~c2', 'a~d1', 'b', 'c~c1', 'c~d1']);
    expect(courseSequence(catalog, topic, 3)).toEqual(['a~c1', 'a~c2', 'a~d1', 'a~x1', 'b', 'c~c1', 'c~d1']);
  });

  it('after a core part the next core lesson is up; extras are offered once the core of a concept is done', () => {
    expect(nextAfter(catalog, topic, 'a~c1', new Set(['a~c1']))).toEqual({ next: 'a~c2', bonus: null });
    expect(nextAfter(catalog, topic, 'a~c2', new Set(['a~c1', 'a~c2']))).toEqual({ next: 'b', bonus: 'a~d1' });
    expect(nextAfter(catalog, topic, 'a~d1', new Set(['a~c1', 'a~c2', 'a~d1']))).toEqual({ next: 'b', bonus: 'a~x1' });
    expect(nextAfter(catalog, topic, 'a~x1', new Set(['a~c1', 'a~c2', 'a~d1', 'a~x1']))).toEqual({ next: 'b', bonus: null });
    // the last lesson of the course: nothing next, its extra still on offer
    expect(nextAfter(catalog, topic, 'c~c1', new Set(['c~c1']))).toEqual({ next: null, bonus: 'c~d1' });
    expect(nextAfter(catalog, undefined, 'b', new Set())).toEqual({ next: null, bonus: null });
  });

  it('with a deeper goal the extras are the way, not an offer', () => {
    expect(nextAfter(catalog, topic, 'a~c2', new Set(['a~c1', 'a~c2']), 2)).toEqual({ next: 'a~d1', bonus: null });
    expect(nextAfter(catalog, topic, 'a~d1', new Set(['a~c1', 'a~c2', 'a~d1']), 2)).toEqual({ next: 'b', bonus: 'a~x1' });
    expect(nextAfter(catalog, topic, 'a~d1', new Set(['a~c1', 'a~c2', 'a~d1']), 3)).toEqual({ next: 'a~x1', bonus: null });
  });

  it('skips what is already done', () => {
    expect(nextAfter(catalog, topic, 'a~c1', new Set(['a~c1', 'a~c2', 'b']))).toEqual({ next: 'c~c1', bonus: null });
    expect(nextAfter(catalog, topic, 'a~c2', new Set(['a~c1', 'a~c2', 'a~d1']))).toEqual({ next: 'b', bonus: 'a~x1' });
  });
});

describe('the learning path', async () => {
  const { buildPath } = await import('../src/screens/Home.tsx');
  const progress = (done: string[]) => ({ completedConcepts: new Set(done) }) as unknown as ProgressSummary;

  it('shows core lessons as nodes and hangs the extras below the last part of a concept', () => {
    const { units, next } = buildPath(catalog, 'path.math', progress(['a~c1']), null, new Set());
    expect(next).toBe('a~c2');
    expect(units[0].nodes.map((n) => [n.conceptId, n.state, n.part?.n ?? null, n.extras.map((x) => `${x.conceptId}:${x.state}`)])).toEqual([
      ['a~c1', 'done', 1, []],
      ['a~c2', 'next', 2, ['a~d1:open', 'a~x1:open']],
      ['b', 'later', null, []],
    ]);
    expect(units[1].nodes[0].extras.map((x) => x.depth)).toEqual([2]);
  });

  it('a course the learner never touched does not pull them back from further along', () => {
    // a new course in front of the path, like a starter course added later
    const fresh = { id: 'new', title: 'Neu', area: 'math', prerequisites: [], units: [{ id: 'new.u1', title: 'N1', concepts: ['n1', 'n2'], review: true }] } as unknown as Topic;
    const wider = { ...catalog, topics: [fresh, topic], paths: [{ id: 'path.math', area: 'math', title: 'Mathe', topics: ['new', 'tp'] }], concepts: { ...concepts, n1: meta('n1', 'n1', 1), n2: meta('n2', 'n2', 1) }, groups: { ...catalog.groups, n1: ['n1'], n2: ['n2'] } } as unknown as Catalog;
    // someone new starts at the very beginning
    expect(buildPath(wider, 'path.math', progress([]), null, new Set()).next).toBe('n1');
    // someone already in the second course carries on there; the new course stays open, not locked
    const along = buildPath(wider, 'path.math', progress(['a~c1']), null, new Set());
    expect(along.next).toBe('a~c2');
    expect(along.units[0].nodes.map((n) => n.state)).toEqual(['later', 'later']);
    // once they try the new course it is theirs to finish
    expect(buildPath(wider, 'path.math', progress(['a~c1', 'n1']), null, new Set()).next).toBe('n2');
    // everything else done: the untouched course is what is left
    expect(buildPath(wider, 'path.math', progress(['a~c1', 'a~c2', 'b', 'c~c1']), null, new Set()).next).toBe('n1');
  });

  it('leads through the extras when the learner wants more depth', () => {
    const done = ['a~c1', 'a~c2'];
    expect(buildPath(catalog, 'path.math', progress(done), null, new Set()).next).toBe('b');
    const deeper = buildPath(catalog, 'path.math', progress(done), null, new Set(), 2);
    expect(deeper.next).toBe('a~d1');
    expect(deeper.units[0].nodes[1].extras.map((x) => x.state)).toEqual(['next', 'open']);
    expect(buildPath(catalog, 'path.math', progress([...done, 'a~d1']), null, new Set(), 3).next).toBe('a~x1');
    expect(buildPath(catalog, 'path.math', progress([...done, 'a~d1']), null, new Set(), 2).next).toBe('b');
  });
});
