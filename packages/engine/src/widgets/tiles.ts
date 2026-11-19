import { z } from 'zod';
import { evaluateMathString, mathEquivalent, parseMath } from '../math.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  /** Tile labels (may repeat). Each tile can be used once. */
  tiles: z.array(z.string().min(1)).min(2).max(14),
  /** Maximum number of tiles in the answer row. */
  slots: z.number().int().positive().optional(),
  variables: z.array(z.string()).default(['x']),
});

const Answer = z.object({
  sequence: z.array(z.string()).optional(),
  anyOf: z.array(z.array(z.string())).optional(),
  /** The built row (read as a term) must evaluate to this number. */
  evaluatesTo: z.number().optional(),
  /** The built row must be an expression equivalent to this one. */
  equivalentTo: z.string().optional(),
  /** Minimal number of tiles that must be used (for evaluatesTo/equivalentTo). */
  minTiles: z.number().int().optional(),
});

export type TilesParams = z.infer<typeof Params>;
export type TilesAnswer = z.input<typeof Answer>;
export interface TilesState {
  placed: number[];
}
export type TilesAction = { type: 'place'; index: number } | { type: 'remove'; position: number } | { type: 'clear' };

const slotsOf = (p: TilesParams) => p.slots ?? p.tiles.length;
const labels = (s: TilesState, p: TilesParams) => s.placed.map((i) => p.tiles[i]);

function rowMatches(row: string[], a: TilesAnswer, p: TilesParams): boolean {
  if (a.minTiles && row.length < a.minTiles) return false;
  const seqs = [...(a.sequence ? [a.sequence] : []), ...(a.anyOf ?? [])];
  if (seqs.length) return seqs.some((seq) => seq.length === row.length && seq.every((x, i) => x === row[i]));
  const text = row.join(' ');
  if (!row.length) return false;
  try {
    if (a.evaluatesTo !== undefined) {
      const v = evaluateMathString(text);
      return Math.abs(v - a.evaluatesTo) < 1e-9;
    }
    if (a.equivalentTo !== undefined) return mathEquivalent(parseMath(text, p.variables), a.equivalentTo, p.variables);
  } catch {
    return false;
  }
  return false;
}

/** Depth-first search over tile arrangements (bounded). */
function search(p: TilesParams, a: TilesAnswer, limit: number, maxNodes = 60000): number[][] {
  const found: number[][] = [];
  const seen = new Set<string>();
  let nodes = 0;
  const max = slotsOf(p);
  const rec = (placed: number[]) => {
    if (found.length >= limit || nodes++ > maxNodes) return;
    const row = placed.map((i) => p.tiles[i]);
    const key = row.join('\u0000');
    if (placed.length && !seen.has(key)) {
      seen.add(key);
      if (rowMatches(row, a, p)) found.push([...placed]);
    }
    if (placed.length >= max) return;
    for (let i = 0; i < p.tiles.length; i++) if (!placed.includes(i)) rec([...placed, i]);
  };
  rec([]);
  return found;
}

export const tilesWidget: WidgetDefinition<TilesParams, TilesState, TilesAction, TilesAnswer> = {
  kind: 'tiles',
  title: { de: 'Kacheln legen', en: 'Tiles' },
  params: Params,
  answer: Answer as unknown as z.ZodType<TilesAnswer>,
  interactive: true,
  init: () => ({ placed: [] }),
  applyAction(s, a, p) {
    switch (a.type) {
      case 'place':
        if (a.index < 0 || a.index >= p.tiles.length || s.placed.includes(a.index) || s.placed.length >= slotsOf(p)) return s;
        return { placed: [...s.placed, a.index] };
      case 'remove':
        if (a.position < 0 || a.position >= s.placed.length) return s;
        return { placed: s.placed.filter((_, i) => i !== a.position) };
      case 'clear':
        return { placed: [] };
    }
    return s;
  },
  actions(s, p) {
    const out: TilesAction[] = [];
    if (s.placed.length < slotsOf(p)) for (let i = 0; i < p.tiles.length; i++) if (!s.placed.includes(i)) out.push({ type: 'place', index: i });
    for (let k = 0; k < s.placed.length; k++) out.push({ type: 'remove', position: k });
    return out;
  },
  isAnswered: (s) => s.placed.length > 0,
  checkAnswer: (s, a, p) => rowMatches(labels(s, p), a, p),
  solve(p, a) {
    if (!a) return null;
    const seq = a.sequence ?? a.anyOf?.[0];
    if (seq) {
      const used = new Set<number>();
      const placed: number[] = [];
      for (const l of seq) {
        const idx = p.tiles.findIndex((x, i) => x === l && !used.has(i));
        if (idx < 0) return null;
        used.add(idx);
        placed.push(idx);
      }
      return { placed };
    }
    const hit = search(p, a, 1)[0];
    return hit ? { placed: hit } : null;
  },
  countSolutions(p, a) {
    if (!a) return 0;
    if (a.sequence || a.anyOf) return (a.sequence ? 1 : 0) + (a.anyOf?.length ?? 0);
    return search(p, a, 50).length;
  },
  describe(s, p, locale) {
    const row = labels(s, p).join(' ') || t(locale, 'leer', 'empty');
    const free = p.tiles.filter((_, i) => !s.placed.includes(i)).join(', ') || t(locale, 'keine', 'none');
    return t(locale, `Gelegte Kacheln: ${row}. Noch verfügbar: ${free}.`, `Placed tiles: ${row}. Available: ${free}.`);
  },
  validateState(s, p) {
    const errs: string[] = [];
    if (new Set(s.placed).size !== s.placed.length) errs.push('tile used twice');
    if (s.placed.some((i) => i < 0 || i >= p.tiles.length)) errs.push('unknown tile');
    if (s.placed.length > slotsOf(p)) errs.push('too many tiles');
    return errs;
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (!a) return [{ level: 'error', code: 'tiles.no-answer', message: t(locale, 'Kacheln ohne answer.', 'Tiles without answer.') }];
    const kinds = [a.sequence || a.anyOf, a.evaluatesTo !== undefined, a.equivalentTo !== undefined].filter(Boolean).length;
    if (kinds !== 1) issues.push({ level: 'error', code: 'tiles.answer-kind', message: 'Genau eine Antwortart angeben: sequence/anyOf, evaluatesTo oder equivalentTo.' });
    for (const seq of [...(a.sequence ? [a.sequence] : []), ...(a.anyOf ?? [])]) {
      const pool = [...p.tiles];
      for (const l of seq) {
        const k = pool.indexOf(l);
        if (k < 0) issues.push({ level: 'error', code: 'tiles.missing-tile', message: `Kachel »${l}« fehlt für die Musterlösung.` });
        else pool.splice(k, 1);
      }
    }
    if (p.tiles.some((x) => x.length > 12)) issues.push({ level: 'warning', code: 'tiles.long-label', message: 'Sehr lange Kachel-Texte brechen auf schmalen Displays um.' });
    return issues;
  },
  secret: (_p, a) => (a?.sequence ? [a.sequence.join(' ')] : a?.equivalentTo ? [a.equivalentTo] : []),
};
