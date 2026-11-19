import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * A pan balance for linear equations a·x + b = c·x + d with positive integers.
 * Boxes hold the unknown x, weights are units. One-sided moves are allowed on
 * purpose: the scale tips and makes the "only one side" misconception visible.
 */
const Side = z.object({ x: z.number().int().min(0).max(6), units: z.number().int().min(0).max(20) });

const ACTIONS = ['remove_unit', 'add_unit', 'remove_x', 'divide'] as const;

const Params = z.object({
  left: Side,
  right: Side,
  /** Value of x. Derived from the sides if omitted. */
  solution: z.number().int().positive().optional(),
  allow: z.array(z.enum(ACTIONS)).default(['remove_unit', 'remove_x', 'divide']),
  /** Allow changing only one side (shows tipping). */
  oneSided: z.boolean().default(true),
  /** Reveal the true value of x (e.g. on explain screens). */
  reveal: z.boolean().default(false),
});

export type BalanceParams = z.infer<typeof Params>;
export interface Pan {
  x: number;
  units: number;
}
export interface BalanceState {
  left: Pan;
  right: Pan;
  /** Derived: whether both pans weigh the same. */
  balanced: boolean;
  /** Derived: -1 left heavier, 0 level, 1 right heavier. */
  tilt: -1 | 0 | 1;
  moves: number;
}
export type Side = 'left' | 'right' | 'both';
export type BalanceAction =
  | { type: 'remove_unit'; side: Side }
  | { type: 'add_unit'; side: Side }
  | { type: 'remove_x'; side: Side }
  | { type: 'divide'; by: number };

const MAX_UNITS = 30;

export function balanceSolution(p: BalanceParams): number | null {
  if (p.solution !== undefined) return p.solution;
  const dx = p.left.x - p.right.x;
  if (dx === 0) return null;
  const v = (p.right.units - p.left.units) / dx;
  return v;
}

function weigh(pan: Pan, xv: number) {
  return pan.x * xv + pan.units;
}

function withDerived(left: Pan, right: Pan, p: BalanceParams, moves: number): BalanceState {
  const xv = balanceSolution(p) ?? 1;
  const l = weigh(left, xv);
  const r = weigh(right, xv);
  const tilt = l === r ? 0 : l > r ? -1 : 1;
  return { left, right, balanced: tilt === 0, tilt, moves };
}

function apply(pan: Pan, f: (p: Pan) => Pan | null): Pan | null {
  return f(pan);
}

export const balanceWidget: WidgetDefinition<BalanceParams, BalanceState, BalanceAction> = {
  kind: 'balance',
  title: { de: 'Waage', en: 'Balance' },
  params: Params,
  interactive: true,
  init: (p) => withDerived({ ...p.left }, { ...p.right }, p, 0),
  applyAction(s, a, p) {
    if (!p.allow.includes(a.type)) return s;
    if (a.type === 'divide') {
      const by = a.by;
      if (!Number.isInteger(by) || by < 2) return s;
      const ok = [s.left.x, s.left.units, s.right.x, s.right.units].every((n) => n % by === 0);
      if (!ok) return s;
      const div = (q: Pan): Pan => ({ x: q.x / by, units: q.units / by });
      return withDerived(div(s.left), div(s.right), p, s.moves + 1);
    }
    const side = a.side;
    if (side !== 'both' && !p.oneSided) return s;
    const op = (q: Pan): Pan | null => {
      switch (a.type) {
        case 'remove_unit': return q.units > 0 ? { ...q, units: q.units - 1 } : null;
        case 'add_unit': return q.units < MAX_UNITS ? { ...q, units: q.units + 1 } : null;
        case 'remove_x': return q.x > 0 ? { ...q, x: q.x - 1 } : null;
      }
      return null;
    };
    const nl = side === 'left' || side === 'both' ? apply(s.left, op) : s.left;
    const nr = side === 'right' || side === 'both' ? apply(s.right, op) : s.right;
    if (!nl || !nr) return s;
    return withDerived(nl, nr, p, s.moves + 1);
  },
  actions(_s, p) {
    const out: BalanceAction[] = [];
    const sides: Side[] = p.oneSided ? ['both', 'left', 'right'] : ['both'];
    for (const type of p.allow) {
      if (type === 'divide') for (const by of [2, 3, 4, 5, 6]) out.push({ type, by });
      else for (const side of sides) out.push({ type, side });
    }
    return out;
  },
  isAnswered: () => true,
  isSolved(s, p) {
    const xv = balanceSolution(p);
    if (xv === null || !s.balanced) return false;
    const isolated = (a: Pan, b: Pan) => a.x === 1 && a.units === 0 && b.x === 0 && b.units === xv;
    return isolated(s.left, s.right) || isolated(s.right, s.left);
  },
  diagnose(s, _a, _p, locale) {
    if (!s.balanced) return t(locale, 'Die Waage ist gekippt: Du hast nur eine Seite verändert. Was du links tust, musst du auch rechts tun.', 'The scale tipped: you changed only one side. Whatever you do on the left, do on the right.');
    if (s.left.x > 1 || s.right.x > 1) return t(locale, 'Fast! Es liegen noch mehrere x-Kisten auf einer Seite. Kannst du beide Seiten gerecht aufteilen?', 'Almost! There are still several x boxes on one side. Can you split both sides evenly?');
    if (s.left.x > 0 && s.right.x > 0) return t(locale, 'Auf beiden Seiten liegen noch x-Kisten. Nimm auf beiden Seiten gleich viele weg.', 'There are x boxes on both sides. Remove the same number from each side.');
    return t(locale, 'Die Waage ist im Gleichgewicht, aber x steht noch nicht allein.', 'The scale is balanced, but x is not alone yet.');
  },
  solve: () => null, // generic breadth-first search over actions finds the shortest solution
  countSolutions: () => 1,
  scope: (s) => ({ balanced: s.balanced }),
  describe(s, p, locale) {
    const pan = (q: Pan) => {
      const xs = q.x ? t(locale, `${q.x} ${q.x === 1 ? 'Kiste' : 'Kisten'} x`, `${q.x} box${q.x === 1 ? '' : 'es'} x`) : '';
      const us = q.units || !q.x ? t(locale, `${q.units} ${q.units === 1 ? 'Gewicht' : 'Gewichte'}`, `${q.units} weight${q.units === 1 ? '' : 's'}`) : '';
      return [xs, us].filter(Boolean).join(t(locale, ' und ', ' and '));
    };
    const eq = `${term(s.left)} = ${term(s.right)}`;
    const tilt =
      s.tilt === 0
        ? t(locale, 'Die Waage ist im Gleichgewicht.', 'The scale is balanced.')
        : s.tilt < 0
          ? t(locale, 'Die Waage neigt sich nach links.', 'The scale tips to the left.')
          : t(locale, 'Die Waage neigt sich nach rechts.', 'The scale tips to the right.');
    const reveal = p.reveal ? t(locale, ` Jede Kiste x wiegt ${balanceSolution(p)}.`, ` Each box x weighs ${balanceSolution(p)}.`) : '';
    return t(locale, `Waage. Links: ${pan(s.left)}. Rechts: ${pan(s.right)}. Gleichung: ${eq}. ${tilt}${reveal}`, `Balance. Left: ${pan(s.left)}. Right: ${pan(s.right)}. Equation: ${eq}. ${tilt}${reveal}`);
  },
  validateState(s) {
    const errs: string[] = [];
    for (const q of [s.left, s.right]) {
      if (!Number.isInteger(q.x) || !Number.isInteger(q.units) || q.x < 0 || q.units < 0) errs.push('negative or fractional amount on a pan');
      if (q.units > MAX_UNITS) errs.push('too many weights');
    }
    return errs;
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const xv = balanceSolution(p);
    if (xv === null) issues.push({ level: 'error', code: 'balance.no-solution', message: t(locale, 'Gleich viele x auf beiden Seiten: Die Gleichung hat keine eindeutige Lösung.', 'Same number of x on both sides: no unique solution.') });
    else if (!Number.isInteger(xv) || xv <= 0) issues.push({ level: 'error', code: 'balance.bad-solution', message: t(locale, `x = ${xv} lässt sich mit Gewichten nicht darstellen (positive ganze Zahl nötig).`, `x = ${xv} cannot be shown with weights.`) });
    else if (p.solution !== undefined && (p.left.x - p.right.x) * p.solution !== p.right.units - p.left.units) {
      issues.push({ level: 'error', code: 'balance.inconsistent', message: 'params.solution passt nicht zu den Waagschalen.' });
    }
    const total = p.left.x + p.left.units + p.right.x + p.right.units;
    if (total > 24) issues.push({ level: 'warning', code: 'visual.crowded', message: t(locale, 'Mehr als 24 Objekte auf der Waage werden unübersichtlich.', 'More than 24 objects get crowded.') });
    return issues;
  },
  secret: (p) => {
    const xv = balanceSolution(p);
    return xv === null ? [] : [`x = ${xv}`, `x=${xv}`];
  },
};

export function term(q: Pan): string {
  const xs = q.x === 0 ? '' : q.x === 1 ? 'x' : `${q.x}x`;
  if (!xs) return String(q.units);
  return q.units ? `${xs} + ${q.units}` : xs;
}
