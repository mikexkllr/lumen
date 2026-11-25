import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * "Entdecken" – cards with a big symbol that flip over when tapped. Made for lesson intros and explain
 * screens: the learner uncovers the ideas of a topic one by one instead of reading a wall of text.
 *  - grid:  any card in any order
 *  - flow:  a chain of stages (cause → effect, a process); each card opens after the one before it
 *  - cycle: like flow, and the last stage leads back to the first (water cycle, cell cycle …)
 * Display widget: it shapes curiosity, it does not grade (use it as an interactive `visual`).
 */
const Card = z
  .object({
    /** One emoji or a short symbol (≤ 4 characters), shown big on the front. */
    icon: z.string().min(1).max(16),
    /** Front label: a question or a name (a few words). */
    front: z.string().min(1),
    /** What the card reveals: one short sentence. */
    back: z.string().min(1),
  })
  .strict();

const Params = z
  .object({
    cards: z.array(Card).min(2).max(6),
    layout: z.enum(['grid', 'flow', 'cycle']).default('grid'),
  })
  .strict();

export type FlipParams = z.infer<typeof Params>;
export interface FlipState {
  open: boolean[];
}
export type FlipAction = { type: 'flip'; index: number } | { type: 'reset' };

/** Whether card i may be opened now (flow and cycle open in order). */
export function flipCanOpen(s: FlipState, p: FlipParams, i: number): boolean {
  if (i < 0 || i >= p.cards.length || s.open[i]) return false;
  return p.layout === 'grid' || i === 0 || s.open[i - 1];
}

const MAX_FRONT = 40;
const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].length;
const MAX_BACK = 120;

export const flipWidget: WidgetDefinition<FlipParams, FlipState, FlipAction> = {
  kind: 'flip',
  title: { de: 'Entdecken', en: 'Discover' },
  params: Params,
  interactive: false,
  init: (p) => ({ open: p.cards.map(() => false) }),
  applyAction(s, a, p) {
    if (a.type === 'reset') return { open: p.cards.map(() => false) };
    if (!Number.isInteger(a.index) || !flipCanOpen(s, p, a.index)) return s;
    return { open: s.open.map((v, i) => v || i === a.index) };
  },
  actions(s, p) {
    const out: FlipAction[] = p.cards.flatMap((_c, index) => (flipCanOpen(s, p, index) ? [{ type: 'flip', index } as FlipAction] : []));
    if (s.open.some(Boolean)) out.push({ type: 'reset' });
    return out;
  },
  isAnswered: (s) => s.open.every(Boolean),
  isSolved: (s) => s.open.every(Boolean),
  solve: (p) => ({ open: p.cards.map(() => true) }),
  describe(s, p, locale) {
    const kind = p.layout === 'grid' ? t(locale, 'Karten zum Aufdecken', 'Cards to uncover') : p.layout === 'flow' ? t(locale, 'Ablauf in Stationen', 'A process in stages') : t(locale, 'Kreislauf in Stationen', 'A cycle in stages');
    const rows = p.cards.map((c, i) => (s.open[i] ? `${c.front}: ${c.back}` : `${c.front} (${t(locale, 'verdeckt', 'hidden')})`));
    return `${kind}: ${rows.join('; ')}${p.layout === 'cycle' ? t(locale, '; danach beginnt es von vorn.', '; then it starts over.') : '.'}`;
  },
  validateState: (s, p) => {
    if (s.open.length !== p.cards.length) return ['open count'];
    if (p.layout !== 'grid' && s.open.some((v, i) => v && i > 0 && !s.open[i - 1])) return ['opened out of order'];
    return [];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    if (p.cards.some((c) => c.front.length > MAX_FRONT)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, `Kartentitel über ${MAX_FRONT} Zeichen passen nicht auf die Karte.`, `Card titles over ${MAX_FRONT} characters do not fit on the card.`) });
    if (p.cards.some((c) => c.back.length > MAX_BACK)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, `Rückseiten über ${MAX_BACK} Zeichen sind auf dem Handy zu lang.`, `Card backs over ${MAX_BACK} characters are too long on phones.`) });
    if (p.cards.some((c) => graphemes(c.icon) > 4)) issues.push({ level: 'warning', code: 'flip.icon', message: t(locale, 'Das Symbol ist ein Emoji oder höchstens vier Zeichen.', 'The icon is one emoji or at most four characters.') });
    return issues;
  },
};
