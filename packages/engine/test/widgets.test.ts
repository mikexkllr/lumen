import { describe, expect, it } from 'vitest';
import { checkProblem, initialState, isCorrect, resolveProblem } from '../src/runtime.ts';
import { referenceSolve } from '../src/solver.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { createWidgetInstance, getWidget } from '../src/widgets/registry.ts';
import { solveLogicGrid } from '../src/widgets/logicgrid.ts';

const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', prompt: 'Test', ...s }), id: 't/s1' }) as ProblemStep;

function solveAndCheck(s: ProblemStep) {
  const rp = resolveProblem(s);
  expect(isCorrect(rp, initialState(rp))).toBe(false);
  const sol = referenceSolve(rp);
  expect(sol).not.toBeNull();
  expect(isCorrect(rp, sol!.state)).toBe(true);
  return { rp, sol: sol! };
}

describe('widgets', () => {
  it('choice: single choice with per-option feedback', () => {
    const s = step({ widget: 'choice', params: { options: [{ label: '1/2', correct: true }, { label: '2/1', feedback: 'Zähler und Nenner vertauscht.' }] } });
    const { rp } = solveAndCheck(s);
    const wrong = rp.widget.applyAction(initialState(rp), { type: 'toggle', id: 'b' }, rp.params);
    expect(checkProblem(rp, wrong)).toEqual({ correct: false, feedback: { text: 'Zähler und Nenner vertauscht.' } });
  });

  it('numeric: accepts equivalent notation and enforces simplified form', () => {
    const s = step({ widget: 'numeric', answer: { value: '3/4', form: 'simplified' } });
    const { rp } = solveAndCheck(s);
    expect(isCorrect(rp, { input: '3/4' })).toBe(true);
    expect(isCorrect(rp, { input: '6/8' })).toBe(false);
    expect(checkProblem(rp, { input: '6/8' }).feedback?.text).toMatch(/kürze/);
    const any = resolveProblem(step({ widget: 'numeric', answer: { value: 0.75 } }));
    expect(isCorrect(any, { input: '0,75' })).toBe(true);
    expect(isCorrect(any, { input: '3/4' })).toBe(true);
  });

  it('expression: symbolic equivalence and form', () => {
    const s = step({ widget: 'expression', answer: { equivalentTo: '2x + 6', form: 'expanded' } });
    const { rp } = solveAndCheck(s);
    expect(isCorrect(rp, { input: '6 + 2x' })).toBe(true);
    expect(isCorrect(rp, { input: '2(x+3)' })).toBe(false);
    expect(checkProblem(rp, { input: '2(x+3)' }).feedback?.text).toMatch(/Klammern/);
  });

  it('order: never starts solved and accepts the authored order', () => {
    const s = step({ widget: 'order', params: { items: [{ label: '1/4' }, { label: '1/3' }, { label: '1/2' }] } });
    for (let seed = 0; seed < 20; seed++) {
      const rp = resolveProblem(s, seed);
      expect(isCorrect(rp, initialState(rp))).toBe(false);
    }
    solveAndCheck(s);
  });

  it('tiles: evaluatesTo is solved by search', () => {
    const s = step({ widget: 'tiles', params: { tiles: ['3', '4', '+', '×', '2'] }, answer: { evaluatesTo: 14 } });
    const { sol, rp } = solveAndCheck(s);
    expect(rp.widget.describe(sol.state, rp.params, 'de')).toMatch(/Gelegte Kacheln/);
  });

  it('graph: predicate with slope helper is solved by search', () => {
    const s = step({
      widget: 'graph',
      params: { x: [-3, 3], y: [-3, 3], points: [{ id: 'A', x: 0, y: 0, draggable: false }, { id: 'B', x: 1, y: 0 }], lines: [['A', 'B']] },
      check: { predicate: "slope('A', 'B') == 2" },
    });
    const { sol } = solveAndCheck(s);
    expect(sol.method).toBe('search');
  });

  it('slider: matchTarget is solved by search', () => {
    const s = step({
      widget: 'slider',
      params: { expr: 'm*x + b', sliders: [{ id: 'm', min: -3, max: 3, step: 1, initial: 1 }, { id: 'b', min: -3, max: 3, step: 1, initial: 0 }], target: { expr: '2x - 1' } },
      answer: { matchTarget: true },
    });
    const { sol } = solveAndCheck(s);
    expect(sol.state).toEqual({ values: { m: 2, b: -1 } });
  });

  it('balance: BFS finds the isolation of x and one-sided moves tip the scale', () => {
    const s = step({ widget: 'balance', params: { left: { x: 2, units: 3 }, right: { x: 0, units: 11 } } });
    const { rp, sol } = solveAndCheck(s);
    expect(sol.state).toMatchObject({ left: { x: 1, units: 0 }, right: { x: 0, units: 4 }, balanced: true });
    const tipped = rp.widget.applyAction(initialState(rp), { type: 'remove_unit', side: 'left' }, rp.params);
    expect(tipped).toMatchObject({ balanced: false, tilt: 1 });
    expect(checkProblem(rp, tipped).feedback?.text).toMatch(/gekippt/);
  });

  it('fraction: equivalent fractions and part-size misconception', () => {
    const s = step({ widget: 'fraction', params: { parts: 8 }, answer: { fraction: '3/4' } });
    const { rp } = solveAndCheck(s);
    let st = initialState(rp);
    for (const i of [0, 1, 2]) st = rp.widget.applyAction(st, { type: 'toggle', index: i }, rp.params);
    expect(checkProblem(rp, st).feedback?.text).toMatch(/Größe der Teile/);
  });

  it('numberline: snaps to ticks', () => {
    const s = step({ widget: 'numberline', params: { min: 0, max: 2, ticks: 4 }, answer: { value: '3/4' } });
    const { rp } = solveAndCheck(s);
    expect(rp.widget.applyAction({ value: null }, { type: 'set', value: 0.8 }, rp.params)).toEqual({ value: 0.75 });
  });

  it('logic-grid: unique solution and clue-specific feedback', () => {
    const params = {
      categories: [
        { name: 'Kind', items: ['Ada', 'Ben', 'Cleo'] },
        { name: 'Tier', items: ['Katze', 'Hund', 'Fisch'] },
      ],
      clues: [
        { text: 'Ada hat keinen Hund.', rule: { not: ['Ada', 'Hund'] } },
        { text: 'Ben hat den Fisch.', rule: { is: ['Ben', 'Fisch'] } },
      ],
    };
    const s = step({ widget: 'logic-grid', params });
    const { rp } = solveAndCheck(s);
    expect(solveLogicGrid(rp.params, 5)).toHaveLength(1);
    // learner claims Ada–Hund, Ben–Fisch, Cleo–Katze
    const marks = { '0:1:1': 2, '1:1:2': 2, '2:1:0': 2 } as const;
    expect(checkProblem(rp, { marks }).feedback?.text).toMatch(/Hinweis 1/);
  });

  it('exposes the spec widget contract via createWidgetInstance', () => {
    const w = createWidgetInstance<{ input: string }>('numeric', {}, { locale: 'de', seed: 1 }, { value: 7 });
    expect(w.isSolved()).toBe(false);
    w.applyAction({ type: 'input', value: '7' });
    expect(w.isSolved()).toBe(true);
    expect(w.describe()).toMatch(/7/);
    expect(w.solve()).toEqual({ input: '7' });
    expect(getWidget('balance')?.title.de).toBe('Waage');
  });

  it('variants: derives values and interpolates prompts and answers', () => {
    const s = step({
      widget: 'numeric',
      prompt: 'Löse: x + {{a}} = {{c}}',
      answer: { value: '{{c - a}}' },
      variants: { params: { a: 'int[1,9]', b: 'int[1,9]' }, derive: { c: 'a + b' }, defaults: { a: 5, b: 7 } },
    });
    const lesson = resolveProblem(s, 0);
    expect(lesson.prompt).toBe('Löse: x + 5 = 12');
    expect(isCorrect(lesson, { input: '7' })).toBe(true);
    const review = resolveProblem(s, 4242);
    const a = review.vars.a as number;
    const c = review.vars.c as number;
    expect(isCorrect(review, { input: String(c - a) })).toBe(true);
  });
});
