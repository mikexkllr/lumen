import { describe, expect, it } from 'vitest';
import { initialState, isCorrect, resolveProblem } from '../src/runtime.ts';
import { evalProblem } from '../src/evals.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { computerMove, nimWidget } from '../src/widgets/nim.ts';
import { minMoves } from '../src/widgets/hanoi.ts';
import { minSwaps, swapWidget } from '../src/widgets/swap.ts';
import { lightsOutSolve } from '../src/widgets/pixels.ts';

const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', prompt: 'Spiel.', hints: ['Tipp'], ...s }), id: 't/s1' }) as ProblemStep;
const errors = (s: ProblemStep) => evalProblem(s, { concept: 't', locale: 'de' }).filter((i) => i.level === 'error');

describe('nim', () => {
  it('computer plays perfectly and the game is winnable', () => {
    const p = nimWidget.params.parse({ piles: [5], maxTake: 3 });
    expect(computerMove(p, [7])).toEqual({ pile: 0, take: 3 });
    expect(errors(step({ widget: 'nim', params: { piles: [5], maxTake: 3 } }))).toEqual([]);
    expect(errors(step({ widget: 'nim', params: { piles: [3, 4, 5] } }))).toEqual([]);
    expect(errors(step({ widget: 'nim', params: { piles: [4], maxTake: 3 } })).map((e) => e.code)).toContain('nim.unwinnable');
  });
  it('large games are solved by the strategy, not by search', () => {
    expect(errors(step({ widget: 'nim', params: { piles: [15, 13, 11, 7] } }))).toEqual([]);
    expect(errors(step({ widget: 'nim', params: { piles: [15, 14, 12], maxTake: 5 } }))).toEqual([]);
    const p = nimWidget.params.parse({ piles: [15, 13, 11, 7] });
    expect(nimWidget.solve!(p, undefined, { locale: 'de', seed: 1 })?.winner).toBe('player');
    expect(nimWidget.solve!(nimWidget.params.parse({ piles: [6, 6] }), undefined, { locale: 'de', seed: 1 })).toBeNull();
  });
  it('player loses after a bad move', () => {
    const rp = resolveProblem(step({ widget: 'nim', params: { piles: [5], maxTake: 3 } }));
    const s = nimWidget.applyAction(initialState(rp) as never, { type: 'take', pile: 0, n: 2 }, rp.params as never);
    expect(s.piles).toEqual([0]);
    expect(s.winner).toBe('computer');
    expect(isCorrect(rp, s)).toBe(false);
  });
});

describe('hanoi, swap, angle, rect, lights out', () => {
  it('hanoi solves in the minimum', () => {
    expect(minMoves(3)).toBe(7);
    expect(errors(step({ widget: 'hanoi', params: { disks: 3, maxMoves: 7 } }))).toEqual([]);
  });
  it('swap counts minimum swaps', () => {
    const p = swapWidget.params.parse({ values: [3, 1, 2] });
    expect(minSwaps(p)).toBe(2);
    expect(minSwaps(swapWidget.params.parse({ values: [3, 1, 2], adjacent: false }))).toBe(2);
    expect(errors(step({ widget: 'swap', params: { values: [4, 2, 3, 1], maxSwaps: 5 } }))).toEqual([]);
  });
  it('angle and rect pass evals', () => {
    expect(errors(step({ widget: 'angle', params: { initial: 10 }, answer: { value: 120 } }))).toEqual([]);
    expect(errors(step({ widget: 'rect', params: { perimeter: 16, w: 2 }, check: { predicate: 'area == 16' } }))).toEqual([]);
  });
  it('lights out is solvable by elimination', () => {
    expect(lightsOutSolve([[1, 1, 0], [1, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0]])).not.toBeNull();
    expect(errors(step({ widget: 'pixels', params: { cells: ['##.', '#..', '...'], rule: 'lightsout' }, answer: { pattern: ['...', '...', '...'] } }))).toEqual([]);
  });
});
