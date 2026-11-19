import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/** Towers of Hanoi: move the tower to the target peg, never a bigger disk on a smaller one. */
const Params = z.object({
  disks: z.number().int().min(2).max(6).default(3),
  target: z.number().int().min(1).max(2).default(2),
  /** Require at most this many moves (e.g. the minimum 2^n − 1). */
  maxMoves: z.number().int().min(1).optional(),
});

export type HanoiParams = z.infer<typeof Params>;
export interface HanoiState {
  /** bottom → top, disk sizes 1 (smallest) .. n */
  pegs: number[][];
  moves: number;
}
export type HanoiAction = { type: 'move'; from: number; to: number } | { type: 'reset' };

const start = (p: HanoiParams): HanoiState => ({ pegs: [Array.from({ length: p.disks }, (_, i) => p.disks - i), [], []], moves: 0 });
export const minMoves = (n: number) => 2 ** n - 1;

export function canMove(s: HanoiState, from: number, to: number): boolean {
  if (from === to || from < 0 || to < 0 || from > 2 || to > 2) return false;
  const a = s.pegs[from];
  const b = s.pegs[to];
  return a.length > 0 && (b.length === 0 || b[b.length - 1] > a[a.length - 1]);
}

export const hanoiWidget: WidgetDefinition<HanoiParams, HanoiState, HanoiAction> = {
  kind: 'hanoi',
  title: { de: 'Türme von Hanoi', en: 'Tower of Hanoi' },
  params: Params,
  interactive: true,
  init: (p) => start(p),
  applyAction(s, a, p) {
    if (a.type === 'reset') return start(p);
    if (!canMove(s, a.from, a.to)) return s;
    const pegs = s.pegs.map((x) => [...x]);
    pegs[a.to].push(pegs[a.from].pop()!);
    return { pegs, moves: s.moves + 1 };
  },
  actions(s) {
    const out: HanoiAction[] = [];
    for (let f = 0; f < 3; f++) for (let to = 0; to < 3; to++) if (canMove(s, f, to)) out.push({ type: 'move', from: f, to });
    return out;
  },
  isAnswered: (s, p) => s.pegs[p.target].length === p.disks,
  isSolved: (s, p) => s.pegs[p.target].length === p.disks && (p.maxMoves === undefined || s.moves <= p.maxMoves),
  diagnose(s, _a, p, locale) {
    if (p.maxMoves !== undefined && s.pegs[p.target].length === p.disks && s.moves > p.maxMoves) return t(locale, `Geschafft – aber mit ${s.moves} Zügen. Es geht in ${p.maxMoves}.`, `Done – but in ${s.moves} moves. It works in ${p.maxMoves}.`);
    return null;
  },
  solve(p) {
    const pegs: number[][] = [[], [], []];
    pegs[p.target] = Array.from({ length: p.disks }, (_, i) => p.disks - i);
    return { pegs, moves: minMoves(p.disks) };
  },
  scope: (s, p) => ({ moves: s.moves, minimum: minMoves(p.disks), done: s.pegs[p.target].length === p.disks }),
  describe(s, p, locale) {
    const names = ['A', 'B', 'C'];
    const pegs = s.pegs.map((x, i) => `${names[i]}: ${x.length ? x.join(', ') : t(locale, 'leer', 'empty')}`).join('; ');
    return t(locale, `Türme von Hanoi mit ${p.disks} Scheiben, Ziel ${names[p.target]}. Stäbe (unten nach oben) – ${pegs}. Züge: ${s.moves}.`, `Tower of Hanoi with ${p.disks} disks, target ${names[p.target]}. Pegs (bottom to top) – ${pegs}. Moves: ${s.moves}.`);
  },
  validateState(s, p) {
    const all = s.pegs.flat().sort((a, b) => a - b);
    if (all.length !== p.disks || all.some((d, i) => d !== i + 1)) return ['disks lost'];
    for (const peg of s.pegs) for (let i = 1; i < peg.length; i++) if (peg[i] > peg[i - 1]) return ['bigger disk on smaller'];
    return [];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    if (p.maxMoves !== undefined && p.maxMoves < minMoves(p.disks)) issues.push({ level: 'error', code: 'hanoi.max', message: t(locale, `Unter ${minMoves(p.disks)} Zügen ist es unmöglich.`, `Fewer than ${minMoves(p.disks)} moves is impossible.`) });
    return issues;
  },
};
