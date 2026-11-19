import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Sort bars by swapping two of them (optionally only neighbours, like bubble
 * sort). With maxSwaps the learner has to be efficient.
 */
const Params = z.object({
  values: z.array(z.number()).min(3).max(8),
  adjacent: z.boolean().default(true),
  maxSwaps: z.number().int().min(1).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  labels: z.array(z.string()).optional(),
});

export type SwapParams = z.infer<typeof Params>;
export interface SwapState {
  /** indices into params.values, in display order */
  order: number[];
  swaps: number;
}
export type SwapAction = { type: 'swap'; i: number; j: number } | { type: 'reset' };

const vals = (p: SwapParams, s: SwapState) => s.order.map((k) => p.values[k]);
const sortedOk = (p: SwapParams, v: number[]) => v.every((x, i) => i === 0 || (p.order === 'asc' ? v[i - 1] <= x : v[i - 1] >= x));

export function inversions(p: SwapParams, v: number[]): number {
  let n = 0;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (p.order === 'asc' ? v[i] > v[j] : v[i] < v[j]) n++;
  return n;
}

/** Minimum swaps: inversions for neighbour swaps, n − cycles otherwise. */
export function minSwaps(p: SwapParams): number {
  const v = [...p.values];
  if (p.adjacent) return inversions(p, v);
  const idx = v.map((x, i) => ({ x, i })).sort((a, b) => (p.order === 'asc' ? a.x - b.x : b.x - a.x) || a.i - b.i);
  const seen = new Array(v.length).fill(false);
  let swaps = 0;
  for (let i = 0; i < v.length; i++) {
    if (seen[i] || idx[i].i === i) continue;
    let len = 0;
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      j = idx[j].i;
      len++;
    }
    swaps += len - 1;
  }
  return swaps;
}

export const swapWidget: WidgetDefinition<SwapParams, SwapState, SwapAction> = {
  kind: 'swap',
  title: { de: 'Sortieren durch Tauschen', en: 'Sort by swapping' },
  params: Params,
  interactive: true,
  init: (p) => ({ order: p.values.map((_, i) => i), swaps: 0 }),
  applyAction(s, a, p) {
    if (a.type === 'reset') return swapWidget.init(p, { locale: 'de', seed: 0 });
    const { i, j } = a;
    if (i === j || i < 0 || j < 0 || i >= s.order.length || j >= s.order.length) return s;
    if (p.adjacent && Math.abs(i - j) !== 1) return s;
    const order = [...s.order];
    [order[i], order[j]] = [order[j], order[i]];
    return { order, swaps: s.swaps + 1 };
  },
  actions(s, p) {
    const out: SwapAction[] = [];
    for (let i = 0; i < s.order.length; i++) for (let j = i + 1; j < s.order.length; j++) if (!p.adjacent || j === i + 1) out.push({ type: 'swap', i, j });
    return out;
  },
  isAnswered: (s, p) => sortedOk(p, vals(p, s)),
  isSolved: (s, p) => sortedOk(p, vals(p, s)) && (p.maxSwaps === undefined || s.swaps <= p.maxSwaps),
  diagnose: (s, _a, p, locale) => (p.maxSwaps !== undefined && sortedOk(p, vals(p, s)) && s.swaps > p.maxSwaps ? t(locale, `Sortiert – aber mit ${s.swaps} Tauschs. Es geht mit ${p.maxSwaps}.`, `Sorted – but with ${s.swaps} swaps. ${p.maxSwaps} are enough.`) : null),
  solve(p) {
    const idx = p.values.map((x, i) => ({ x, i })).sort((a, b) => (p.order === 'asc' ? a.x - b.x : b.x - a.x) || a.i - b.i);
    return { order: idx.map((o) => o.i), swaps: minSwaps(p) };
  },
  scope: (s, p) => ({ swaps: s.swaps, sorted: sortedOk(p, vals(p, s)), minimum: minSwaps(p), values: vals(p, s) }),
  describe(s, p, locale) {
    const v = vals(p, s).join(', ');
    return t(locale, `Balken: ${v}. ${s.swaps} Tausch${s.swaps === 1 ? '' : 'e'} bisher.${p.adjacent ? ' Nur Nachbarn tauschen.' : ''}`, `Bars: ${v}. ${s.swaps} swap${s.swaps === 1 ? '' : 's'} so far.${p.adjacent ? ' Only neighbours can swap.' : ''}`);
  },
  validateState: (s, p) => ([...s.order].sort((a, b) => a - b).every((k, i) => k === i) && s.order.length === p.values.length ? [] : ['order corrupted']),
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    if (sortedOk(p, p.values)) issues.push({ level: 'error', code: 'swap.sorted', message: t(locale, 'Die Werte sind schon sortiert.', 'Values are already sorted.') });
    if (p.maxSwaps !== undefined && p.maxSwaps < minSwaps(p)) issues.push({ level: 'error', code: 'swap.max', message: t(locale, `Mindestens ${minSwaps(p)} Tausche sind nötig.`, `At least ${minSwaps(p)} swaps are needed.`) });
    if (p.labels && p.labels.length !== p.values.length) issues.push({ level: 'error', code: 'swap.labels', message: 'labels und values müssen gleich lang sein.' });
    return issues;
  },
};
