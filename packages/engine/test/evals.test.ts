import { describe, expect, it } from 'vitest';
import { compileContent } from '../src/compile.ts';
import { runEvals } from '../src/evals.ts';

const concept = (steps: string, extra = '') => `
id: test.c
type: concept
title: Test
locale: de
license: CC-BY-SA-4.0
authors: [tester]
estimated_minutes: 3
${extra}
steps:
${steps}
`;

function codes(yaml: string): string[] {
  const { course, issues } = compileContent([{ path: 'c.yaml', text: yaml }]);
  return [...issues, ...runEvals(course, { variantSamples: 4, fuzzRuns: 4 }).issues].filter((i) => i.level === 'error').map((i) => i.code);
}

describe('content evals catch broken content', () => {
  it('accepts a valid problem', () => {
    expect(codes(concept(`  - kind: problem
    widget: numeric
    prompt: Wie viel ist 2 + 2?
    answer: { value: 4 }
    hints: [Zähle.]`))).toEqual([]);
  });

  it('flags schema errors', () => {
    expect(codes(concept(`  - kind: problem
    prompt: ohne Widget`))).toContain('schema');
  });

  it('flags an unsolvable balance', () => {
    expect(codes(concept(`  - kind: problem
    widget: balance
    params: { left: { x: 1, units: 3 }, right: { x: 0, units: 7 }, allow: [add_unit] }
    prompt: x allein
    hints: [h]`))).toContain('unsolvable');
  });

  it('flags a balance whose solution is not a positive integer', () => {
    expect(codes(concept(`  - kind: problem
    widget: balance
    params: { left: { x: 2, units: 0 }, right: { x: 0, units: 5 } }
    prompt: x allein
    hints: [h]`))).toContain('balance.bad-solution');
  });

  it('flags trivial problems (start state already correct)', () => {
    expect(codes(concept(`  - kind: problem
    widget: numberline
    params: { min: 0, max: 1, ticks: 4, initial: 0.5 }
    answer: { value: "1/2" }
    prompt: Wo liegt 1/2?
    hints: [h]`))).toContain('numberline.trivial');
  });

  it('flags single choice with two correct answers', () => {
    expect(codes(concept(`  - kind: problem
    widget: choice
    prompt: Wähle
    params: { options: [{ label: a, correct: true }, { label: b, correct: true }] }
    hints: [h]`))).toContain('not-unique');
  });

  it('flags a logic grid with more than one solution', () => {
    expect(codes(concept(`  - kind: problem
    widget: logic-grid
    prompt: Rätsel
    params:
      categories: [{ name: K, items: [A, B, C] }, { name: T, items: [X, Y, Z] }]
      clues: [{ text: A hat nicht X., rule: { not: [A, X] } }]
    hints: [h]`))).toContain('not-unique');
  });

  it('flags broken predicates and unknown widgets', () => {
    expect(codes(concept(`  - kind: problem
    widget: numeric
    prompt: p
    answer: { value: 1 }
    check: { predicate: "state.input ==" }
    hints: [h]`))).toContain('predicate.syntax');
    expect(codes(concept(`  - kind: problem
    widget: hologram
    prompt: p
    hints: [h]`))).toContain('widget.unknown');
  });

  it('flags variants whose constraints cannot be satisfied', () => {
    expect(codes(concept(`  - kind: problem
    widget: numeric
    prompt: "{{a}}"
    answer: { value: "{{a}}" }
    variants: { params: { a: "int[1,3]" }, constraints: ["a > 5"] }
    hints: [h]`))).toContain('variant.invalid');
  });

  it('requires the content license', () => {
    expect(codes(concept(`  - kind: problem
    widget: numeric
    prompt: p
    answer: { value: 1 }
    hints: [h]`).replace('CC-BY-SA-4.0', 'CC-BY-NC-4.0'))).toContain('license');
  });

  it('warns about overly long screens', () => {
    const long = Array.from({ length: 60 }, () => 'Wort').join(' ');
    const { course } = compileContent([{ path: 'c.yaml', text: concept(`  - kind: explain
    body: "${long}."
  - kind: problem
    widget: numeric
    prompt: p
    answer: { value: 1 }
    hints: [h]`) }]);
    expect(runEvals(course).issues.map((i) => i.code)).toContain('text.too-long');
  });
});

describe('learning paths run from zero to hero', () => {
  const topic = (id: string, level: string, pre: string[] = []) => ({
    path: `${id}.yaml`,
    text: `id: ${id}\ntype: topic\ntitle: ${id}\ndescription: Test\nlevel: ${level}\narea: math\nlicense: CC-BY-SA-4.0\nauthors: [tester]\nprerequisites: [${pre.join(', ')}]\nunits:\n  - id: ${id}.u1\n    title: U\n    concepts: [${id}.c]\n`,
  });
  const conceptOf = (id: string) => ({ path: `${id}.c.yaml`, text: concept(`  - kind: explain\n    body: Hallo Welt, das ist ein kurzer Text.`).replace('id: test.c', `id: ${id}.c`) });
  const path = (topics: string[]) => ({ path: 'p.yaml', text: `id: path.math\ntype: path\ntitle: Mathe\ndescription: Test\narea: math\ntopics: [${topics.join(', ')}]\n` });
  const run = (files: { path: string; text: string }[]) => {
    const { course, issues } = compileContent(files);
    return [...issues, ...runEvals(course, { variantSamples: 2, fuzzRuns: 2 }).issues].map((i) => i.code);
  };
  const base = [topic('t.easy', 'Einstieg'), topic('t.hard', 'Aufbau', ['t.easy']), conceptOf('t.easy'), conceptOf('t.hard')];

  it('accepts ascending stages with prerequisites first', () => {
    expect(run([...base, path(['t.easy', 't.hard'])]).filter((c) => c.startsWith('path.'))).toEqual([]);
  });
  it('rejects a harder course before an easier one', () => {
    expect(run([...base, path(['t.hard', 't.easy'])])).toEqual(expect.arrayContaining(['path.order', 'path.prereq-order']));
  });
  it('warns about courses outside every path', () => {
    expect(run([...base, path(['t.easy'])])).toContain('path.orphan');
  });
  it('rejects unknown stage names', () => {
    expect(run([topic('t.odd', 'Mittelstufe'), conceptOf('t.odd')])).toContain('schema');
  });
});

describe('broken slider formulas', () => {
  it('reports a bad expression instead of crashing', () => {
    expect(codes(concept(`  - kind: problem
    widget: slider
    prompt: Stelle die Kurve ein.
    params: { expr: "a ** x", x: [0, 4], y: [0, 20], sliders: [{ id: a, label: Basis, min: 1, max: 4, step: 1, initial: 1 }], target: { expr: "2^x" } }
    answer: { matchTarget: true }
    hints: [Probier.]`))).toContain('slider.bad-expr');
  });
});
