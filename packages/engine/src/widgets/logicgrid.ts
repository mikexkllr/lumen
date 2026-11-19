import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Logic grid puzzles ("Who owns which pet?"). Every clue carries a human text
 * and a formal rule, so a brute-force solver can prove the puzzle has exactly
 * one solution and can tell the learner which clue their grid violates.
 */
const Rule = z.union([
  z.object({ is: z.tuple([z.string(), z.string()]) }),
  z.object({ not: z.tuple([z.string(), z.string()]) }),
  z.object({ either: z.tuple([z.string(), z.string(), z.string()]) }),
  /** a has a smaller value than b in the ordered category */
  z.object({ less: z.tuple([z.string(), z.string()]) }),
  z.object({ adjacent: z.tuple([z.string(), z.string()]) }),
  /** position(b) - position(a) == n in the ordered category */
  z.object({ offset: z.tuple([z.string(), z.string(), z.number().int()]) }),
]);

const Params = z.object({
  categories: z
    .array(z.object({ name: z.string().min(1), items: z.array(z.string().min(1)).min(2).max(5) }))
    .min(2)
    .max(3),
  /** Index of the category whose items have an order (e.g. ages, places). */
  ordered: z.number().int().min(0).optional(),
  clues: z
    .array(
      z
        .object({ text: z.string().min(1), rule: Rule.optional(), rules: z.array(Rule).optional() })
        .refine((c) => !!c.rule !== !!c.rules, 'Jeder Hinweis braucht entweder rule oder rules'),
    )
    .min(1),
});

export type LogicGridParams = z.infer<typeof Params>;
export type LogicRule = z.infer<typeof Rule>;
/** marks[`${row}:${cat}:${item}`] = 0 empty, 1 ✗, 2 ✓ (rows = items of category 0) */
export interface LogicGridState {
  marks: Record<string, 0 | 1 | 2>;
}
export type LogicGridAction = { type: 'cycle'; row: number; cat: number; item: number } | { type: 'set'; row: number; cat: number; item: number; value: 0 | 1 | 2 };

/** assignment[cat][row] = item index in category `cat` for primary row `row` (cat 0 = identity). */
export type Assignment = number[][];

export function clueRules(c: LogicGridParams['clues'][number]): LogicRule[] {
  return c.rules ?? (c.rule ? [c.rule] : []);
}

const clueHolds = (p: LogicGridParams, asg: Assignment, c: LogicGridParams['clues'][number]) => clueRules(c).every((r) => ruleHolds(p, asg, r));

export const cellKey = (row: number, cat: number, item: number) => `${row}:${cat}:${item}`;

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

function locate(p: LogicGridParams, label: string): { cat: number; item: number } | null {
  for (let c = 0; c < p.categories.length; c++) {
    const i = p.categories[c].items.indexOf(label);
    if (i >= 0) return { cat: c, item: i };
  }
  return null;
}

/** Primary row of the entity that `label` belongs to under an assignment. */
function rowOf(p: LogicGridParams, asg: Assignment, label: string): number {
  const loc = locate(p, label)!;
  return asg[loc.cat].indexOf(loc.item);
}

function orderedPos(p: LogicGridParams, asg: Assignment, label: string): number {
  const cat = p.ordered ?? 0;
  return asg[cat][rowOf(p, asg, label)];
}

export function ruleHolds(p: LogicGridParams, asg: Assignment, rule: LogicRule): boolean {
  if ('is' in rule) return rowOf(p, asg, rule.is[0]) === rowOf(p, asg, rule.is[1]);
  if ('not' in rule) return rowOf(p, asg, rule.not[0]) !== rowOf(p, asg, rule.not[1]);
  if ('either' in rule) {
    const r = rowOf(p, asg, rule.either[0]);
    return r === rowOf(p, asg, rule.either[1]) || r === rowOf(p, asg, rule.either[2]);
  }
  if ('less' in rule) return orderedPos(p, asg, rule.less[0]) < orderedPos(p, asg, rule.less[1]);
  if ('adjacent' in rule) return Math.abs(orderedPos(p, asg, rule.adjacent[0]) - orderedPos(p, asg, rule.adjacent[1])) === 1;
  if ('offset' in rule) return orderedPos(p, asg, rule.offset[1]) - orderedPos(p, asg, rule.offset[0]) === rule.offset[2];
  return false;
}

export function solveLogicGrid(p: LogicGridParams, limit = 2): Assignment[] {
  const n = p.categories[0].items.length;
  const perms = permutations(n);
  const identity = [...Array(n).keys()];
  const sols: Assignment[] = [];
  const rec = (asg: Assignment) => {
    if (sols.length >= limit) return;
    if (asg.length === p.categories.length) {
      if (p.clues.every((c) => clueHolds(p, asg, c))) sols.push(asg.map((r) => [...r]));
      return;
    }
    for (const perm of perms) rec([...asg, perm]);
  };
  rec([identity]);
  return sols;
}

/** Reads a complete assignment from ✓ marks, or null if incomplete/ambiguous. */
export function assignmentFromMarks(p: LogicGridParams, s: LogicGridState): Assignment | null {
  const n = p.categories[0].items.length;
  const asg: Assignment = [[...Array(n).keys()]];
  for (let c = 1; c < p.categories.length; c++) {
    const col: number[] = [];
    for (let r = 0; r < n; r++) {
      const ticks = p.categories[c].items.map((_, i) => i).filter((i) => s.marks[cellKey(r, c, i)] === 2);
      if (ticks.length !== 1) return null;
      col.push(ticks[0]);
    }
    if (new Set(col).size !== n) return null;
    asg.push(col);
  }
  return asg;
}

function marksFor(asg: Assignment, p: LogicGridParams): LogicGridState {
  const marks: LogicGridState['marks'] = {};
  const n = p.categories[0].items.length;
  for (let c = 1; c < p.categories.length; c++) for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) marks[cellKey(r, c, i)] = asg[c][r] === i ? 2 : 1;
  return { marks };
}

const sameAssignment = (a: Assignment, b: Assignment) => a.every((col, c) => col.every((v, r) => b[c][r] === v));

export const logicGridWidget: WidgetDefinition<LogicGridParams, LogicGridState, LogicGridAction> = {
  kind: 'logic-grid',
  title: { de: 'Logikgitter', en: 'Logic grid' },
  params: Params,
  interactive: true,
  init: () => ({ marks: {} }),
  applyAction(s, a, p) {
    const n = p.categories[0].items.length;
    if (a.row < 0 || a.row >= n || a.cat < 1 || a.cat >= p.categories.length || a.item < 0 || a.item >= n) return s;
    const k = cellKey(a.row, a.cat, a.item);
    const cur = s.marks[k] ?? 0;
    const value = a.type === 'cycle' ? (((cur + 1) % 3) as 0 | 1 | 2) : a.value;
    const marks = { ...s.marks };
    if (value === 0) delete marks[k];
    else marks[k] = value;
    return { marks };
  },
  actions(_s, p) {
    const n = p.categories[0].items.length;
    const out: LogicGridAction[] = [];
    for (let c = 1; c < p.categories.length; c++) for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) out.push({ type: 'cycle', row: r, cat: c, item: i });
    return out;
  },
  isAnswered: (s) => Object.values(s.marks).some((v) => v === 2),
  isSolved(s, p) {
    const asg = assignmentFromMarks(p, s);
    if (!asg) return false;
    const sol = solveLogicGrid(p, 1)[0];
    return !!sol && sameAssignment(asg, sol);
  },
  diagnose(s, _a, p, locale) {
    const asg = assignmentFromMarks(p, s);
    if (!asg) return t(locale, 'Noch nicht vollständig: Jede Zeile braucht genau ein ✓ pro Kategorie, und jedes ✓ darf pro Spalte nur einmal vorkommen.', 'Not complete yet: every row needs exactly one ✓ per category, each column only once.');
    const idx = p.clues.findIndex((c) => !clueHolds(p, asg, c));
    if (idx >= 0) return t(locale, `Das passt nicht zu Hinweis ${idx + 1}: »${p.clues[idx].text}«`, `That conflicts with clue ${idx + 1}: "${p.clues[idx].text}"`);
    return null;
  },
  solve(p) {
    const sol = solveLogicGrid(p, 1)[0];
    return sol ? marksFor(sol, p) : null;
  },
  countSolutions: (p) => solveLogicGrid(p, 5).length,
  requiresUnique: () => true,
  describe(s, p, locale) {
    const n = p.categories[0].items.length;
    const rows: string[] = [];
    for (let r = 0; r < n; r++) {
      const cells: string[] = [];
      for (let c = 1; c < p.categories.length; c++)
        for (let i = 0; i < n; i++) {
          const v = s.marks[cellKey(r, c, i)] ?? 0;
          if (v) cells.push(`${p.categories[c].items[i]} ${v === 2 ? '✓' : '✗'}`);
        }
      rows.push(`${p.categories[0].items[r]}: ${cells.join(', ') || t(locale, 'keine Markierung', 'no marks')}`);
    }
    const clues = p.clues.map((c, i) => `${i + 1}. ${c.text}`).join(' ');
    return t(locale, `Logikgitter. Hinweise: ${clues} Markierungen: ${rows.join('; ')}.`, `Logic grid. Clues: ${clues} Marks: ${rows.join('; ')}.`);
  },
  validateState(s) {
    return Object.values(s.marks).every((v) => v === 1 || v === 2) ? [] : ['invalid mark value'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const n = p.categories[0].items.length;
    if (p.categories.some((c) => c.items.length !== n)) issues.push({ level: 'error', code: 'logic.sizes', message: t(locale, 'Alle Kategorien brauchen gleich viele Einträge.', 'All categories need the same size.') });
    const all = p.categories.flatMap((c) => c.items);
    if (new Set(all).size !== all.length) issues.push({ level: 'error', code: 'logic.duplicate-label', message: t(locale, 'Einträge müssen über alle Kategorien eindeutig sein.', 'Items must be unique across categories.') });
    if (p.ordered !== undefined && p.ordered >= p.categories.length) issues.push({ level: 'error', code: 'logic.ordered', message: 'ordered verweist auf keine Kategorie.' });
    for (const [i, c] of p.clues.entries()) {
      const rules = clueRules(c);
      const labels = rules.flatMap((r) => (Object.values(r)[0] as unknown[]).filter((x): x is string => typeof x === 'string'));
      for (const l of labels) if (!locate(p, l)) issues.push({ level: 'error', code: 'logic.unknown-item', message: `Hinweis ${i + 1} nennt unbekannten Eintrag »${l}«.` });
      const usesOrder = rules.some((r) => 'less' in r || 'adjacent' in r || 'offset' in r);
      if (usesOrder && p.ordered === undefined) issues.push({ level: 'error', code: 'logic.needs-order', message: `Hinweis ${i + 1} braucht eine geordnete Kategorie (params.ordered).` });
    }
    if (issues.some((x) => x.level === 'error')) return issues;
    // Redundant clues make puzzles feel padded: report clues that can be dropped.
    const base = solveLogicGrid(p, 2).length;
    if (base === 1) {
      for (let i = 0; i < p.clues.length; i++) {
        const without = { ...p, clues: p.clues.filter((_, j) => j !== i) };
        if (solveLogicGrid(without, 2).length === 1) issues.push({ level: 'info', code: 'logic.redundant-clue', message: t(locale, `Hinweis ${i + 1} ist überflüssig (Rätsel bleibt ohne ihn eindeutig).`, `Clue ${i + 1} is redundant.`) });
      }
    }
    return issues;
  },
};
