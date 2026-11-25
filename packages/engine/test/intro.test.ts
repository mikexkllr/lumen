import { describe, expect, it } from 'vitest';
import { compileContent } from '../src/compile.ts';
import { runEvals } from '../src/evals.ts';
import { recallCheck } from '../src/recall.ts';
import { checkProblem, initialState, resolveProblem } from '../src/runtime.ts';
import { referenceSolve } from '../src/solver.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { flipCanOpen, flipWidget, type FlipParams } from '../src/widgets/flip.ts';
import { fractionPieces, gridShape, polygonArea } from '../src/widgets/fraction.ts';
import { getWidget } from '../src/widgets/registry.ts';

const concept = (steps: string) => `
id: test.c
type: concept
title: Test
locale: de
license: CC-BY-SA-4.0
authors: [tester]
estimated_minutes: 3
steps:
${steps}
`;

const problem = `  - kind: problem
    id: sum
    widget: numeric
    prompt: Wie viel ist 2 + 2?
    answer: { value: 4 }
    hints: [Zähl weiter.]`;

const intro = `  - kind: explain
    id: intro
    intro: true
    title: Hallo
    body: Ein kurzer Text zum Einstieg, damit du weißt, worum es geht.
    visual: { widget: flip, interactive: true, params: { cards: [{ icon: "🍕", front: Pizza, back: Acht Stücke. }, { icon: "🍰", front: Kuchen, back: Zwölf Stücke. }] } }`;

function errors(yaml: string): string[] {
  const { course, issues } = compileContent([{ path: 'c.yaml', text: yaml }]);
  return [...issues, ...runEvals(course, { variantSamples: 2, fuzzRuns: 2 }).issues].filter((i) => i.level === 'error').map((i) => i.code);
}

describe('fraction shapes', () => {
  it('cuts squares, triangles and hexagons into pieces of equal area', () => {
    for (const shape of ['square', 'triangle', 'hexagon'] as const) {
      for (let n = 1; n <= 24; n++) {
        const areas = fractionPieces(shape, n).map(polygonArea);
        expect(areas).toHaveLength(n);
        const mean = areas.reduce((a, b) => a + b, 0) / n;
        for (const a of areas) expect(Math.abs(a - mean) / mean).toBeLessThan(1e-6);
      }
    }
  });

  it('uses a grid for squares and a triangle grid for square numbers', () => {
    expect(gridShape(12)).toEqual({ rows: 3, cols: 4 });
    expect(gridShape(100)).toEqual({ rows: 10, cols: 10 });
    expect(gridShape(7)).toEqual({ rows: 1, cols: 7 });
    expect(fractionPieces('triangle', 9).every((p) => p.length === 3)).toBe(true);
  });

  it('checks a triangle problem and a 10 × 10 percent grid', () => {
    const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', prompt: 'Test', ...s }), id: 't/s1' }) as ProblemStep;
    for (const s of [step({ widget: 'fraction', params: { parts: 3, shape: 'triangle' }, answer: { fraction: '2/3' } }), step({ widget: 'fraction', params: { parts: 100, shape: 'square' }, answer: { fraction: '37/100' } })]) {
      const rp = resolveProblem(s);
      expect(checkProblem(rp, initialState(rp)).correct).toBe(false);
      const sol = referenceSolve(rp);
      expect(sol && checkProblem(rp, sol.state).correct).toBe(true);
    }
  });

  it('allows more than 24 parts only as a square grid', () => {
    const w = getWidget('fraction')!;
    const lint = (params: unknown) => (w.lint?.(w.params.parse(params), undefined, 'de') ?? []).filter((i) => i.level === 'error').map((i) => i.code);
    expect(lint({ parts: 100, shape: 'square' })).toEqual([]);
    expect(lint({ parts: 30, shape: 'bar' })).toContain('visual.dense');
  });
});

describe('flip cards', () => {
  const p = (layout: 'grid' | 'flow' | 'cycle'): FlipParams => flipWidget.params.parse({ layout, cards: [{ icon: '💧', front: 'A', back: 'a' }, { icon: '☁️', front: 'B', back: 'b' }, { icon: '🌧️', front: 'C', back: 'c' }] });

  it('opens grid cards in any order and chains in order', () => {
    const grid = p('grid');
    expect(flipWidget.applyAction(flipWidget.init(grid, { locale: 'de', seed: 1 }), { type: 'flip', index: 2 }, grid).open).toEqual([false, false, true]);
    const flow = p('flow');
    const s0 = flipWidget.init(flow, { locale: 'de', seed: 1 });
    expect(flipWidget.applyAction(s0, { type: 'flip', index: 2 }, flow)).toBe(s0);
    expect(flipCanOpen(s0, flow, 0)).toBe(true);
    let s = s0;
    for (const index of [0, 1, 2]) s = flipWidget.applyAction(s, { type: 'flip', index }, flow);
    expect(flipWidget.isSolved!(s, flow)).toBe(true);
    expect(flipWidget.validateState!(s, flow)).toEqual([]);
    expect(flipWidget.describe(s, p('cycle'), 'en')).toMatch(/starts over/);
  });

  it('is a display widget: it cannot be a problem', () => {
    expect(flipWidget.interactive).toBe(false);
  });
});

describe('lesson intros', () => {
  it('accepts an intro at the start and gets no quick check', () => {
    expect(errors(concept(`${intro}\n${problem}`))).toEqual([]);
    expect(recallCheck({ id: 'i', intro: true, body: 'Ein **Bruch** ist ein Teil.' }, ['Nenner', 'Zähler', 'Kürzen'])).toBeNull();
  });

  it('rejects an intro after the first step', () => {
    expect(errors(concept(`${problem}\n${intro}`))).toContain('intro.position');
  });
});
