import { describe, expect, it } from 'vitest';
import { compileContent } from '../src/compile.ts';
import { runEvals } from '../src/evals.ts';
import { checkProblem, initialState, isCorrect, resolveProblem } from '../src/runtime.ts';
import { referenceSolve } from '../src/solver.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { clozeBank, clozeParts } from '../src/widgets/cloze.ts';
import { estimateSnap, estimateToPos, estimateToValue } from '../src/widgets/estimate.ts';
import { SIM_SCENES, simCompute, simControls } from '../src/widgets/sim.ts';
import { teachHits, teachNeeded } from '../src/widgets/teach.ts';
import { getWidget } from '../src/widgets/registry.ts';
import { buildExplainContext, ruleReply } from '../src/tutor.ts';

const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', prompt: 'Test', ...s }), id: 't/s1' }) as ProblemStep;

function solveAndCheck(s: ProblemStep) {
  const rp = resolveProblem(s);
  expect(isCorrect(rp, initialState(rp))).toBe(false);
  const sol = referenceSolve(rp);
  expect(sol).not.toBeNull();
  expect(isCorrect(rp, sol!.state)).toBe(true);
  return { rp, sol: sol! };
}

const lintCodes = (kind: string, params: unknown, answer?: unknown) => {
  const w = getWidget(kind)!;
  return (w.lint?.(w.params.parse(params), answer, 'de') ?? []).map((i) => i.code);
};

describe('estimate', () => {
  it('accepts guesses inside the tolerance band and steers the rest', () => {
    const { rp } = solveAndCheck(step({ widget: 'estimate', params: { min: 0, max: 200, unit: 'm' }, answer: { value: 39, tolerance: 8 } }));
    expect(isCorrect(rp, { value: 46 })).toBe(true);
    expect(isCorrect(rp, { value: 48 })).toBe(false);
    expect(checkProblem(rp, { value: 10 }).feedback?.text).toMatch(/höher/);
    expect(checkProblem(rp, { value: 150 }).feedback?.text).toMatch(/niedriger/);
  });

  it('defaults to 20 percent of the true value', () => {
    const rp = resolveProblem(step({ widget: 'estimate', params: { min: 0, max: 1000 }, answer: { value: 500 } }));
    expect(isCorrect(rp, { value: 600 })).toBe(true);
    expect(isCorrect(rp, { value: 610 })).toBe(false);
  });

  it('log scale spans orders of magnitude and never leaves the range', () => {
    const p = { min: 10, max: 1e9, scale: 'log' as const };
    expect(estimateToValue(0, p)).toBe(10);
    expect(estimateToValue(1, p)).toBe(1e9);
    expect(estimateToValue(0.5, p)).toBeCloseTo(1e5, -3);
    expect(estimateToPos(1e5, p)).toBeCloseTo(0.5, 5);
    for (let k = 0; k <= 50; k++) {
      const v = estimateToValue(k / 50, p);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(1e9);
    }
    const rp = resolveProblem(step({ widget: 'estimate', params: p, answer: { value: 1e6, within: 50 } }));
    expect(checkProblem(rp, { value: 100 }).feedback?.text).toMatch(/Größenordnungen/);
  });

  it('linear snap stays inside the scale', () => {
    const p = { min: 1, max: 10, step: 4, scale: 'linear' as const };
    expect(estimateSnap(10, p)).toBeLessThanOrEqual(10);
    expect(estimateSnap(-5, p)).toBe(1);
  });

  it('lints unreachable and trivial answers', () => {
    expect(lintCodes('estimate', { min: 0, max: 100 }, { value: 150 })).toContain('estimate.outside');
    expect(lintCodes('estimate', { min: 0, max: 100, step: 10 }, { value: 44, tolerance: 1 })).toContain('estimate.unreachable');
    expect(lintCodes('estimate', { min: 0, max: 100 }, { value: 50, tolerance: 30 })).toContain('estimate.easy');
    expect(lintCodes('estimate', { min: 0, max: 100, scale: 'log' }, { value: 50 })).toContain('estimate.log');
  });
});

describe('swipe', () => {
  const s = step({ widget: 'swipe', params: { cards: [{ text: 'Die 2 ist prim.', right: true }, { text: 'Die 9 ist prim.', right: false, why: '3 · 3' }, { text: 'Die 7 ist prim.', right: true }] } });

  it('is solved only when every card is on the right side', () => {
    const { rp } = solveAndCheck(s);
    const w = rp.widget;
    let st = initialState(rp);
    st = w.applyAction(st, { type: 'pick', index: 0, right: true }, rp.params);
    expect(w.isAnswered!(st, rp.params)).toBe(false);
    st = w.applyAction(st, { type: 'pick', index: 1, right: true }, rp.params);
    st = w.applyAction(st, { type: 'pick', index: 2, right: true }, rp.params);
    expect(w.isAnswered!(st, rp.params)).toBe(true);
    expect(isCorrect(rp, st)).toBe(false);
    expect(checkProblem(rp, st).feedback?.text).toMatch(/2 von 3/);
    st = w.applyAction(st, { type: 'pick', index: 1, right: false }, rp.params);
    expect(isCorrect(rp, st)).toBe(true);
  });

  it('undo removes the last pick and ignores bad indices', () => {
    const rp = resolveProblem(s);
    const w = rp.widget;
    let st = w.applyAction(initialState(rp), { type: 'pick', index: 0, right: true }, rp.params);
    st = w.applyAction(st, { type: 'pick', index: 9, right: true }, rp.params);
    expect(st.picks).toEqual([true, null, null]);
    expect(w.applyAction(st, { type: 'undo' }, rp.params).picks).toEqual([null, null, null]);
  });

  it('warns about one-sided decks', () => {
    expect(lintCodes('swipe', { cards: [{ text: 'a', right: true }, { text: 'b', right: true }] })).toContain('swipe.one-sided');
  });
});

describe('cloze', () => {
  const params = { text: 'Energie geht nie [[verloren]]. Sie wechselt nur ihre [[Form]].', distractors: ['kaputt', 'Farbe'] };

  it('parses gaps and offers a stable shuffled bank', () => {
    const p = getWidget('cloze')!.params.parse(params);
    expect(clozeParts(p).answers).toEqual(['verloren', 'Form']);
    expect(clozeParts(p).segments).toHaveLength(3);
    expect([...clozeBank(p)].sort()).toEqual(['Farbe', 'Form', 'kaputt', 'verloren']);
    expect(clozeBank(p)).toEqual(clozeBank(p));
  });

  it('checks the words in their gaps and never uses a word twice', () => {
    const { rp, sol } = solveAndCheck(step({ widget: 'cloze', params }));
    const w = rp.widget;
    const bank = clozeBank(rp.params);
    const swapped = { fills: [...(sol.state as { fills: number[] }).fills].reverse() };
    expect(isCorrect(rp, swapped)).toBe(false);
    expect(checkProblem(rp, swapped).feedback?.text).toMatch(/0 von 2/);
    let st = w.applyAction(initialState(rp), { type: 'put', word: bank.indexOf('verloren') }, rp.params);
    st = w.applyAction(st, { type: 'put', word: bank.indexOf('verloren') }, rp.params);
    expect(st.fills[1]).toBeNull();
    st = w.applyAction(st, { type: 'put', word: bank.indexOf('Form') }, rp.params);
    expect(isCorrect(rp, st)).toBe(true);
    expect(w.describe(st, rp.params, 'de')).toMatch(/\[verloren\]/);
  });

  it('lints missing gaps and distractors that are answers', () => {
    expect(lintCodes('cloze', { text: 'Kein Loch.' })).toContain('cloze.no-gap');
    expect(lintCodes('cloze', { text: 'Ein [[Wort]].' })).toContain('cloze.trivial');
    expect(lintCodes('cloze', { text: 'Ein [[Wort]].', distractors: ['Wort'] })).toContain('cloze.distractor');
  });
});

describe('teach', () => {
  const params = {
    keywords: [['fehler', 'error'], ['rückwärts', 'backward'], ['gewicht', 'weight']],
    sample: 'Der Fehler wandert rückwärts, und jedes Gewicht wird angepasst.',
  };

  it('counts key ideas regardless of case and umlaut spelling', () => {
    const p = getWidget('teach')!.params.parse(params);
    expect(teachNeeded(p)).toBe(2);
    expect(teachHits('Der FEHLER geht rueckwaerts durchs Netz', p)).toEqual([true, true, false]);
    expect(teachHits('The error flows backward to each weight', p)).toEqual([true, true, true]);
  });

  it('needs a few words and enough key ideas', () => {
    const { rp } = solveAndCheck(step({ widget: 'teach', params }));
    const w = rp.widget;
    expect(w.isAnswered!({ input: 'Fehler' }, rp.params)).toBe(false);
    expect(isCorrect(rp, { input: 'Das Netz lernt irgendwie aus Daten.' })).toBe(false);
    expect(checkProblem(rp, { input: 'Das Netz hat einen Fehler gemacht.' }).feedback?.text).toMatch(/1 von 3/);
    expect(isCorrect(rp, { input: 'Der Fehler ändert jedes Gewicht.' })).toBe(true);
    expect(w.applyAction({ input: '' }, { type: 'input', value: 'x'.repeat(2000) }, rp.params).input).toHaveLength(600);
  });

  it('lints a sample that misses its own keywords', () => {
    expect(lintCodes('teach', { ...params, sample: 'Es lernt.' })).toContain('teach.sample');
    expect(lintCodes('teach', { ...params, sample: 'Der Fehler ändert das Gewicht.' })).toContain('teach.sample-partial');
  });
});

describe('sim', () => {
  it('every scene computes finite outputs for its start values and is solvable', () => {
    for (const [name, scene] of Object.entries(SIM_SCENES)) {
      const w = getWidget('sim')!;
      const p = w.params.parse({ scene: name });
      const st = w.init(p, { locale: 'de', seed: 1 });
      const out = simCompute(p, st.values);
      for (const o of scene.outputs) expect(Number.isFinite(out[o.id]), `${name}.${o.id}`).toBe(true);
      expect(w.validateState!(st, p)).toEqual([]);
      expect(w.lint!(p, undefined, 'de').filter((i) => i.level === 'error')).toEqual([]);
      expect(w.describe(st, p, 'en')).toContain(scene.title.en);
    }
  });

  it('physics is right: pendulum, circuit, projectile, decay', () => {
    const run = (scene: string, values: Record<string, number>) => simCompute(getWidget('sim')!.params.parse({ scene }), values);
    expect(run('pendulum', { length: 1, mass: 1, g: 9.81 }).period).toBeCloseTo(2.0, 1);
    expect(run('circuit', { voltage: 12, resistance: 6 })).toMatchObject({ current: 2, power: 24 });
    expect(run('projectile', { angle: 45, speed: 20, g: 9.81 }).range).toBeCloseTo(40.8, 0);
    expect(run('decay', { halflife: 2, time: 6 })).toMatchObject({ left: 12.5, halvings: 3 });
  });

  it('checks targets on controls and outputs, with ranges', () => {
    const { rp } = solveAndCheck(step({ widget: 'sim', params: { scene: 'circuit' }, answer: { voltage: 12, current: [1.9, 2.1] } }));
    const w = rp.widget;
    let st = w.applyAction(initialState(rp), { type: 'set', id: 'voltage', value: 12 }, rp.params);
    expect(st.touched).toBe(true);
    expect(isCorrect(rp, st)).toBe(false);
    expect(checkProblem(rp, st).feedback?.text).toMatch(/Strom/);
    st = w.applyAction(st, { type: 'set', id: 'resistance', value: 6 }, rp.params);
    expect(isCorrect(rp, st)).toBe(true);
  });

  it('fixed controls cannot be moved and values snap into range', () => {
    const rp = resolveProblem(step({ widget: 'sim', params: { scene: 'pendulum' }, answer: { period: [1.9, 2.1] } }));
    const w = rp.widget;
    const g = simControls(rp.params).find((c) => c.id === 'g')!;
    expect(g.fixed).toBe(true);
    const before = initialState(rp);
    expect(w.applyAction(before, { type: 'set', id: 'g', value: 1.6 }, rp.params)).toBe(before);
    const len = simControls(rp.params).find((c) => c.id === 'length')!;
    expect(w.applyAction(before, { type: 'set', id: 'length', value: 999 }, rp.params).values.length).toBe(len.max);
  });

  it('lints unknown scenes, controls, outputs and frozen labs', () => {
    expect(lintCodes('sim', { scene: 'nope' })).toEqual(['sim.scene']);
    expect(lintCodes('sim', { scene: 'circuit', controls: { speed: { value: 1 } } })).toContain('sim.control');
    expect(lintCodes('sim', { scene: 'circuit' }, { range: 3 })).toContain('sim.answer');
    expect(lintCodes('sim', { scene: 'circuit', show: ['period'] })).toContain('sim.show');
    expect(lintCodes('sim', { scene: 'circuit', controls: { voltage: { fixed: true }, resistance: { fixed: true } } })).toContain('sim.frozen');
    expect(lintCodes('sim', { scene: 'tangent', expr: 'x^^2' })).toContain('sim.expr');
  });
});

describe('depth stages', () => {
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
  const problem = (depth?: number) => `  - kind: problem
    widget: numeric
    prompt: Wie viel ist 2 + 2?
    answer: { value: 4 }
    hints: [Zähle.]${depth ? `\n    depth: ${depth}` : ''}`;
  const codes = (yaml: string) => {
    const { course, issues } = compileContent([{ path: 'c.yaml', text: yaml }]);
    return [...issues, ...runEvals(course, { variantSamples: 2, fuzzRuns: 2 }).issues].filter((i) => i.level === 'error').map((i) => i.code);
  };

  it('accepts lessons that only go deeper', () => {
    expect(codes(concept([problem(), problem(2), problem(2), problem(3)].join('\n')))).toEqual([]);
  });

  it('rejects stepping back up and starting deep', () => {
    expect(codes(concept([problem(), problem(3), problem(2)].join('\n')))).toContain('depth.order');
    expect(codes(concept([problem(2), problem(3)].join('\n')))).toContain('depth.start');
  });

  it('auto-hint widgets need no authored hints, others still do', () => {
    expect(codes(concept(`  - kind: problem
    widget: swipe
    prompt: Stimmt das?
    params: { cards: [{ text: Zwei ist gerade., right: true }, { text: Drei ist gerade., right: false }] }`))).toEqual([]);
  });
});

describe('Lux on explain screens', () => {
  const ctx = buildExplainContext('Ein Bruch ist ein Teil eines Ganzen. Der Nenner sagt, in wie viele Teile geteilt wird.', { locale: 'de' });

  it('answers every explain intent without a model', () => {
    for (const intent of ['simpler', 'example', 'deeper', 'quiz'] as const) {
      const reply = ruleReply(ctx, intent, 0);
      expect(reply.length, intent).toBeGreaterThan(20);
    }
    expect(ruleReply(ctx, 'simpler', 0)).toContain('Ein Bruch ist ein Teil eines Ganzen.');
    expect(ruleReply({ ...ctx, locale: 'en' }, 'quiz', 0)).toMatch(/key idea/);
  });
});

describe('explanations derived by the widget', () => {
  const step = (s: Record<string, unknown>) => ProblemStepSchema.parse({ kind: 'problem', id: 'xy', prompt: 'Test', ...s }) as ProblemStep;
  it('teach shows the sample answer', () => {
    const rp = resolveProblem(step({ widget: 'teach', params: { keywords: [['Wurzel']], sample: 'Teiler kommen in Paaren bis zur Wurzel.' } }), 0, 'de');
    expect(rp.explanation).toContain('Teiler kommen in Paaren bis zur Wurzel.');
  });
  it('cloze shows the completed text with the gap words in bold', () => {
    const rp = resolveProblem(step({ widget: 'cloze', params: { text: 'Die [[Sonne]] ist ein [[Stern]].' } }), 0, 'en');
    expect(rp.explanation).toBe('**Complete:** Die **Sonne** ist ein **Stern**.');
  });
  it('swipe lists every card with its side and reason', () => {
    const rp = resolveProblem(step({ widget: 'swipe', params: { cards: [{ text: 'A', right: true, why: 'Weil.' }, { text: 'B', right: false }] } }), 0, 'de');
    expect(rp.explanation).toBe('- A → **stimmt**. Weil.\n- B → **stimmt nicht**');
  });
  it('an authored explanation wins', () => {
    const rp = resolveProblem(step({ widget: 'cloze', params: { text: 'Die [[Sonne]].' }, explanation: 'Eigene.' }), 0, 'de');
    expect(rp.explanation).toBe('Eigene.');
  });
});
