import { describe, expect, it } from 'vitest';
import { initialState, isCorrect, resolveProblem } from '../src/runtime.ts';
import { referenceSolve } from '../src/solver.ts';
import { evalProblem } from '../src/evals.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { evaluateCircuit, gatesWidget, truthTable } from '../src/widgets/gates.ts';
import { minimumSpanningTree, networkWidget, shortestPath } from '../src/widgets/network.ts';
import { vennRegions, vennWidget } from '../src/widgets/venn.ts';
import { bitsValue, toBits } from '../src/widgets/bits.ts';
import { pixelsWidget } from '../src/widgets/pixels.ts';
import { bucketsWidget } from '../src/widgets/buckets.ts';
import { matchWidget } from '../src/widgets/match.ts';

const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', prompt: 'Wähle aus.', hints: ['Tipp'], ...s }), id: 't/s1' }) as ProblemStep;
const errors = (s: ProblemStep) => evalProblem(s, { concept: 't', locale: 'de' }).filter((i) => i.level === 'error');

describe('buckets & match', () => {
  const b = step({ widget: 'buckets', params: { buckets: [{ label: 'Prim' }, { label: 'Nicht prim' }], items: [{ label: '7', bucket: 'Prim' }, { label: '9', bucket: 'Nicht prim' }, { label: '11', bucket: 'Prim' }] } });
  it('solves and passes evals', () => {
    expect(errors(b)).toEqual([]);
    const rp = resolveProblem(b);
    const s = bucketsWidget.applyAction(initialState(rp) as never, { type: 'place', item: 'i1', bucket: 'b2' }, rp.params as never);
    expect(bucketsWidget.isAnswered!(s, rp.params as never)).toBe(false);
  });
  it('match links each right item once', () => {
    const m = step({ widget: 'match', params: { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] } });
    expect(errors(m)).toEqual([]);
    const rp = resolveProblem(m);
    let s = initialState(rp) as ReturnType<typeof matchWidget.init>;
    s = matchWidget.applyAction(s, { type: 'link', left: 0, right: 1 }, rp.params as never);
    s = matchWidget.applyAction(s, { type: 'link', left: 2, right: 1 }, rp.params as never);
    expect(s.links).toEqual([-1, -1, 1]);
  });
});

describe('pixels & bits', () => {
  it('checks patterns and symmetry predicates', () => {
    const s = step({ widget: 'pixels', params: { cells: ['#..', '...'], locked: ['x..', '...'], mirror: 'vertical' }, check: { predicate: 'symmetric("v") && on == 2' }, solution: { state: { grid: [[1, 0, 1], [0, 0, 0]] } } });
    expect(errors(s)).toEqual([]);
    const rp = resolveProblem(s);
    const st = pixelsWidget.applyAction(initialState(rp) as never, { type: 'toggle', r: 0, c: 0 }, rp.params as never);
    expect(st).toEqual(initialState(rp)); // locked
  });
  it('bits value', () => {
    expect(bitsValue([1, 0, 1, 1])).toBe(11);
    expect(toBits(6, 4)).toEqual([0, 1, 1, 0]);
    expect(errors(step({ widget: 'bits', params: { bits: 4, showValue: false }, answer: { value: 13 } }))).toEqual([]);
  });
});

describe('gates', () => {
  const params = gatesWidget.params.parse({
    inputs: [{ id: 'A' }, { id: 'B' }],
    gates: [{ id: 'g', type: '?', in: ['A', 'B'], options: ['AND', 'OR', 'XOR'] }],
    outputs: [{ id: 'Q', from: 'g' }],
  });
  it('evaluates circuits and truth tables', () => {
    expect(evaluateCircuit(params, { A: 1, B: 1 }, { g: 'XOR' }).Q).toBe(0);
    expect(truthTable(params, { inputs: { A: 0, B: 0 }, types: { g: 'XOR' } }, 'Q')).toEqual([0, 1, 1, 0]);
  });
  it('finds gate type by search', () => {
    const s = step({ widget: 'gates', params, check: { predicate: "table('Q') == [0, 1, 1, 1]" } });
    expect(errors(s)).toEqual([]);
    const rp = resolveProblem(s);
    expect((referenceSolve(rp)!.state as { types: Record<string, string> }).types.g).toBe('OR');
  });
  it('goal mode with switches', () => {
    const s = step({ widget: 'gates', params: { inputs: [{ id: 'A' }, { id: 'B' }], gates: [{ id: 'n', type: 'NOT', in: ['B'] }, { id: 'g', type: 'AND', in: ['A', 'n'] }], outputs: [{ id: 'Q', from: 'g' }], goal: { Q: 1 } } });
    expect(errors(s)).toEqual([]);
  });
});

describe('venn', () => {
  it('regions and answers', () => {
    const p = vennWidget.params.parse({ sets: ['A', 'B', 'C'], outside: true });
    expect(vennRegions(p)).toEqual(['A', 'B', 'C', 'AB', 'AC', 'BC', 'ABC', 'O']);
    expect(errors(step({ widget: 'venn', params: { sets: ['Hund', 'Katze'] }, answer: { regions: ['ab'] } }))).toEqual([]);
  });
});

describe('network', () => {
  const nodes = [{ id: 'A', x: 5, y: 50 }, { id: 'B', x: 40, y: 10 }, { id: 'C', x: 40, y: 90 }, { id: 'D', x: 90, y: 50 }];
  const edges = [{ a: 'A', b: 'B', w: 4 }, { a: 'A', b: 'C', w: 1 }, { a: 'C', b: 'B', w: 1 }, { a: 'B', b: 'D', w: 2 }, { a: 'C', b: 'D', w: 6 }];
  const params = networkWidget.params.parse({ nodes, edges, start: 'A', end: 'D' });
  it('dijkstra and kruskal', () => {
    expect(shortestPath(params, 'A', 'D')).toEqual({ cost: 4, path: ['A', 'C', 'B', 'D'] });
    expect(minimumSpanningTree(params).weight).toBe(4);
  });
  it('all three modes pass evals', () => {
    expect(errors(step({ widget: 'network', params: { nodes, edges, start: 'A', end: 'D' } }))).toEqual([]);
    expect(errors(step({ widget: 'network', params: { nodes, edges, mode: 'color', colors: 3 } }))).toEqual([]);
    expect(errors(step({ widget: 'network', params: { nodes, edges, mode: 'select' } }))).toEqual([]);
  });
  it('path building only along edges, tapping back undoes', () => {
    const rp = resolveProblem(step({ widget: 'network', params: { nodes, edges, start: 'A', end: 'D' } }));
    let s = initialState(rp) as ReturnType<typeof networkWidget.init>;
    s = networkWidget.applyAction(s, { type: 'visit', id: 'D' }, rp.params as never);
    expect(s.path).toEqual(['A']);
    s = networkWidget.applyAction(s, { type: 'visit', id: 'B' }, rp.params as never);
    s = networkWidget.applyAction(s, { type: 'visit', id: 'D' }, rp.params as never);
    expect(isCorrect(rp, s)).toBe(false); // cost 6 > 4
    s = networkWidget.applyAction(s, { type: 'visit', id: 'B' }, rp.params as never);
    expect(s.path).toEqual(['A', 'B']);
  });
});

describe('gates with feedback (SR latch)', () => {
  const latch = {
    inputs: [{ id: 'S', value: 0 }, { id: 'R', value: 0 }],
    gates: [{ id: 'nq', type: 'NOR', in: ['S', 'q'] }, { id: 'q', type: 'NOR', in: ['R', 'nq'] }],
    outputs: [{ id: 'Q', from: 'q' }],
  };
  it('remembers the last set or reset', () => {
    const p = gatesWidget.params.parse(latch);
    let s = gatesWidget.init(p, { locale: 'de', seed: 1 });
    const q = () => evaluateCircuit(p, s.inputs, s.types, s.mem).Q;
    expect(q()).toBe(0);
    s = gatesWidget.applyAction(s, { type: 'toggle', id: 'S' }, p);
    expect(q()).toBe(1);
    s = gatesWidget.applyAction(s, { type: 'toggle', id: 'S' }, p);
    expect(q()).toBe(1); // S back to 0: the latch keeps Q = 1
    s = gatesWidget.applyAction(s, { type: 'toggle', id: 'R' }, p);
    expect(q()).toBe(0);
    s = gatesWidget.applyAction(s, { type: 'toggle', id: 'R' }, p);
    expect(q()).toBe(0);
  });
  it('a problem "store a 1 with both switches off" is solvable and passes the evals', () => {
    const s = ProblemStepSchema.parse({ kind: 'problem', prompt: 'Speichere eine 1.', hints: ['Tipp'], widget: 'gates', params: latch, check: { predicate: 'Q == 1 && inputs.S == 0 && inputs.R == 0' } }) as ProblemStep;
    const step = { ...s, id: 't/s1' } as ProblemStep;
    expect(evalProblem(step, { concept: 't', locale: 'de' }).filter((i) => i.level !== 'info')).toEqual([]);
    const rp = resolveProblem(step);
    expect(isCorrect(rp, initialState(rp))).toBe(false);
    expect(referenceSolve(rp)).not.toBeNull();
  });
});
