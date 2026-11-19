import { z } from 'zod';
import { hashString, mulberry32, shuffle } from '../rng.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Connect matching pairs ("Paare finden"). Authors list pairs in the right
 * combination; the right column is shuffled. Tap left, then right.
 */
const Params = z.object({
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) }).strict()).min(2).max(6),
  leftTitle: z.string().optional(),
  rightTitle: z.string().optional(),
});

export type MatchParams = z.infer<typeof Params>;
export interface MatchState {
  /** Display order of the right column (pair indices). */
  right: number[];
  /** For every left item: index of the linked right pair, or -1. */
  links: number[];
}
export type MatchAction = { type: 'link'; left: number; right: number } | { type: 'unlink'; left: number } | { type: 'clear' };

function rightOrder(p: MatchParams): number[] {
  const idx = p.pairs.map((_, i) => i);
  let order = shuffle(idx, mulberry32(hashString(p.pairs.map((x) => x.right).join('|'))));
  if (order.every((v, i) => v === i)) order = [...order.slice(1), order[0]];
  return order;
}

const correctCount = (s: MatchState) => s.links.filter((r, i) => r === i).length;

export const matchWidget: WidgetDefinition<MatchParams, MatchState, MatchAction> = {
  kind: 'match',
  title: { de: 'Paare verbinden', en: 'Match pairs' },
  params: Params,
  interactive: true,
  init: (p) => ({ right: rightOrder(p), links: p.pairs.map(() => -1) }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return { ...s, links: p.pairs.map(() => -1) };
    if (a.left < 0 || a.left >= p.pairs.length) return s;
    if (a.type === 'unlink') {
      const links = [...s.links];
      links[a.left] = -1;
      return { ...s, links };
    }
    if (a.right < 0 || a.right >= p.pairs.length) return s;
    // A right item can only be linked once: steal it from any other left item.
    const links = s.links.map((r) => (r === a.right ? -1 : r));
    links[a.left] = a.right;
    return { ...s, links };
  },
  actions(s, p) {
    const out: MatchAction[] = [];
    p.pairs.forEach((_, l) => {
      if (s.links[l] >= 0) out.push({ type: 'unlink', left: l });
      else p.pairs.forEach((__, r) => out.push({ type: 'link', left: l, right: r }));
    });
    return out;
  },
  isAnswered: (s) => s.links.every((r) => r >= 0),
  isSolved: (s, p) => correctCount(s) === p.pairs.length,
  diagnose: (s, _a, p, locale) => t(locale, `${correctCount(s)} von ${p.pairs.length} Paaren stimmen.`, `${correctCount(s)} of ${p.pairs.length} pairs are right.`),
  solve: (p) => ({ right: rightOrder(p), links: p.pairs.map((_, i) => i) }),
  countSolutions: () => 1,
  scope: (s) => ({ links: s.links, correct: correctCount(s) }),
  describe(s, p, locale) {
    const list = p.pairs.map((pair, i) => `${pair.left} → ${s.links[i] >= 0 ? p.pairs[s.links[i]].right : t(locale, 'offen', 'open')}`).join('; ');
    return t(locale, `Paare: ${list}.`, `Pairs: ${list}.`);
  },
  validateState(s, p) {
    const used = s.links.filter((r) => r >= 0);
    if (new Set(used).size !== used.length) return ['right item linked twice'];
    return s.links.length === p.pairs.length ? [] : ['links length'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const rights = p.pairs.map((x) => x.right);
    const lefts = p.pairs.map((x) => x.left);
    if (new Set(rights).size !== rights.length || new Set(lefts).size !== lefts.length) issues.push({ level: 'error', code: 'match.duplicate', message: t(locale, 'Doppelte Einträge machen die Zuordnung mehrdeutig.', 'Duplicate entries make matching ambiguous.') });
    if ([...lefts, ...rights].some((x) => x.length > 36)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, 'Lange Texte passen auf dem Handy nicht in zwei Spalten.', 'Long texts do not fit two columns on phones.') });
    return issues;
  },
};
