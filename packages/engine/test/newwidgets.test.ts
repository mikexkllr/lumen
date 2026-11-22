import { describe, expect, it } from 'vitest';
import { initialState, isCorrect, resolveProblem, checkProblem } from '../src/runtime.ts';
import { referenceSolve } from '../src/solver.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { runRobot, compress, robotWidget, type Instr } from '../src/widgets/robot.ts';
import { probabilities } from '../src/widgets/distribution.ts';
import { evaluate } from '../src/expr.ts';

const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', prompt: 'T', ...s }), id: 't/s1' }) as ProblemStep;

describe('robot', () => {
  const grid = ['S...G'];
  it('runs programs, detects crashes and loop errors', () => {
    const p = robotWidget.params.parse({ grid, blocks: ['forward', 'left', 'right', 'repeat', 'end'] });
    expect(runRobot(p, [{ op: 'repeat', n: 4 }, { op: 'forward' }, { op: 'end' }]).success).toBe(true);
    expect(runRobot(p, [{ op: 'left' }, { op: 'forward' }]).crashed).toBe(true);
    expect(runRobot(p, [{ op: 'repeat', n: 2 }, { op: 'forward' }]).error).toMatch(/Ende/);
  });

  it('compresses repeated moves into loops', () => {
    const prog: Instr[] = Array(6).fill({ op: 'forward' });
    expect(compress(prog, [2, 3, 6])).toEqual([{ op: 'repeat', n: 6 }, { op: 'forward' }, { op: 'end' }]);
  });

  it('plans a solution around walls and respects maxBlocks', () => {
    const s = step({ widget: 'robot', params: { grid: ['S.#', '..#', '.G.'], maxBlocks: 8 } });
    const rp = resolveProblem(s);
    const sol = referenceSolve(rp)!;
    expect(isCorrect(rp, sol.state)).toBe(true);
    expect(isCorrect(rp, initialState(rp))).toBe(false);
  });

  it('collect mode needs all gems', () => {
    const s = step({ widget: 'robot', params: { grid: ['S*.*'], goal: 'collect' } });
    const rp = resolveProblem(s);
    expect(isCorrect(rp, { program: [{ op: 'forward' }] })).toBe(false);
    expect(checkProblem(rp, { program: [{ op: 'forward' }] }).feedback?.text).toMatch(/Kristalle/);
    expect(isCorrect(rp, { program: [{ op: 'forward' }, { op: 'forward' }, { op: 'forward' }] })).toBe(true);
  });
});

describe('chart', () => {
  it('lets predicates use mean/median', () => {
    const s = step({ widget: 'chart', params: { labels: ['A', 'B', 'C'], values: [2, 4, 3], editable: [2] }, check: { predicate: 'mean(state.values) == 4' } });
    const rp = resolveProblem(s);
    const sol = referenceSolve(rp)!;
    expect((sol.state as { values: number[] }).values).toEqual([2, 4, 6]);
    expect(evaluate('median([5, 1, 3, 2])')).toBe(2.5);
  });
});

describe('distribution', () => {
  it('softmax with temperature sharpens or flattens', () => {
    const p = { mode: 'tokens' as const, items: [{ label: 'blau', logit: 3 }, { label: 'grau', logit: 1 }], sample: [1], showCounts: true };
    expect(probabilities(p, 0.2)[0]).toBeGreaterThan(0.99);
    expect(probabilities(p, 5)[0]).toBeLessThan(0.62);
  });

  it('samples reproducibly and solves temperature predicates by search', () => {
    const s = step({
      widget: 'distribution',
      params: { mode: 'tokens', context: 'Der Himmel ist', items: [{ label: 'blau', logit: 3 }, { label: 'grau', logit: 2 }, { label: 'grün', logit: 0 }], temperature: { min: 0.2, max: 2, step: 0.2, initial: 1 } },
      check: { predicate: "prob('blau') > 0.9" },
    });
    const rp = resolveProblem(s);
    expect(referenceSolve(rp)).not.toBeNull();
    const a = rp.widget.applyAction(initialState(rp), { type: 'sample', n: 100 }, rp.params);
    const b = rp.widget.applyAction(initialState(rp), { type: 'sample', n: 100 }, rp.params);
    expect(a).toEqual(b);
    expect((a as { draws: number }).draws).toBe(100);
  });

  it('finds items by index as well as by label', () => {
    const s = step({ widget: 'distribution', params: { mode: 'chance', items: [{ label: 'Tee', weight: 3 }, { label: 'Kaffee', weight: 1 }] }, check: { predicate: "prob(0) == prob('Tee') && topIndex == 0 && prob(5) == 0" } });
    const rp = resolveProblem(s);
    expect(isCorrect(rp, initialState(rp))).toBe(true);
  });
});
