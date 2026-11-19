import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * "Blitzrunde" – a deck of statements swiped to one of two sides
 * (true/false by default). Fast, low-stakes retrieval practice.
 */
const Params = z.object({
  cards: z.array(z.object({ text: z.string().min(1), right: z.boolean(), why: z.string().optional() }).strict()).min(2).max(8),
  /** Labels of the two sides (default: false / true). */
  left: z.string().optional(),
  right: z.string().optional(),
}).strict();

export type SwipeParams = z.infer<typeof Params>;
export interface SwipeState {
  /** One pick per card: true = right side, false = left side, null = open. */
  picks: (boolean | null)[];
}
export type SwipeAction = { type: 'pick'; index: number; right: boolean } | { type: 'undo' } | { type: 'clear' };

const hits = (s: SwipeState, p: SwipeParams) => p.cards.filter((c, i) => s.picks[i] === c.right).length;

export const swipeWidget: WidgetDefinition<SwipeParams, SwipeState, SwipeAction> = {
  kind: 'swipe',
  title: { de: 'Blitzrunde', en: 'Lightning round' },
  params: Params,
  interactive: true,
  autoHints: true,
  init: (p) => ({ picks: p.cards.map(() => null) }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return { picks: p.cards.map(() => null) };
    if (a.type === 'undo') {
      const last = s.picks.reduce((acc: number, v, i) => (v !== null ? i : acc), -1);
      return last < 0 ? s : { picks: s.picks.map((v, i) => (i === last ? null : v)) };
    }
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= p.cards.length) return s;
    return { picks: s.picks.map((v, i) => (i === a.index ? !!a.right : v)) };
  },
  actions(s, p) {
    const out: SwipeAction[] = [];
    const next = s.picks.findIndex((v) => v === null);
    if (next >= 0) out.push({ type: 'pick', index: next, right: true }, { type: 'pick', index: next, right: false });
    else p.cards.forEach((_c, index) => out.push({ type: 'pick', index, right: !s.picks[index] }));
    if (s.picks.some((v) => v !== null)) out.push({ type: 'undo' });
    return out;
  },
  isAnswered: (s) => s.picks.every((v) => v !== null),
  isSolved: (s, p) => s.picks.every((v) => v !== null) && hits(s, p) === p.cards.length,
  diagnose(s, _a, p, locale) {
    const n = hits(s, p);
    return t(locale, `${n} von ${p.cards.length} Karten stimmen. Tippe eine Karte an, um sie umzudrehen.`, `${n} of ${p.cards.length} cards are right. Tap a card to flip your pick.`);
  },
  solve: (p) => ({ picks: p.cards.map((c) => c.right) }),
  countSolutions: () => 1,
  scope: (s, p) => ({ correct: hits(s, p), picks: s.picks }),
  describe(s, p, locale) {
    const L = p.left ?? t(locale, 'Stimmt nicht', 'False');
    const R = p.right ?? t(locale, 'Stimmt', 'True');
    const rows = p.cards.map((c, i) => `»${c.text}« → ${s.picks[i] === null ? t(locale, 'offen', 'open') : s.picks[i] ? R : L}`);
    return t(locale, `Karten einsortieren (${L} / ${R}): ${rows.join('; ')}.`, `Sort the cards (${L} / ${R}): ${rows.join('; ')}.`);
  },
  validateState: (s, p) => (s.picks.length === p.cards.length ? [] : ['pick count']),
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const rights = p.cards.filter((c) => c.right).length;
    if (rights === 0 || rights === p.cards.length) issues.push({ level: 'warning', code: 'swipe.one-sided', message: t(locale, 'Alle Karten gehören auf dieselbe Seite.', 'All cards belong to the same side.') });
    if (p.cards.some((c) => c.text.length > 110)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, 'Lange Kartentexte sind auf dem Handy schwer lesbar.', 'Long card texts are hard to read on phones.') });
    return issues;
  },
};
