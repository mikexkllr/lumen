import { z } from 'zod';
import { mulberry32, shuffle } from '../rng.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  /** Items in the CORRECT order. The widget shuffles them for the learner. */
  items: z.array(z.object({ id: z.string().optional(), label: z.string().min(1) })).min(2).max(8),
  direction: z.enum(['vertical', 'horizontal']).default('vertical'),
  startLabel: z.string().optional(),
  endLabel: z.string().optional(),
});

const Answer = z.object({
  /** Additional accepted orders (by id). The authored order is always accepted. */
  anyOf: z.array(z.array(z.string())).optional(),
});

export type OrderParams = z.infer<typeof Params>;
export type OrderAnswer = z.input<typeof Answer>;
export interface OrderState {
  order: string[];
}
export type OrderAction = { type: 'move'; from: number; to: number };

export function orderIds(p: OrderParams): string[] {
  return p.items.map((it, i) => it.id ?? `i${i + 1}`);
}

function accepted(p: OrderParams, a?: OrderAnswer): string[][] {
  return [orderIds(p), ...(a?.anyOf ?? [])];
}

function label(p: OrderParams, id: string): string {
  return p.items[orderIds(p).indexOf(id)]?.label ?? id;
}

export const orderWidget: WidgetDefinition<OrderParams, OrderState, OrderAction, OrderAnswer> = {
  kind: 'order',
  title: { de: 'Sortieren', en: 'Ordering' },
  params: Params,
  answer: Answer as unknown as z.ZodType<OrderAnswer>,
  interactive: true,
  init(p, ctx) {
    const ids = orderIds(p);
    let order = shuffle(ids, mulberry32(ctx.seed ^ 0x9e3779b9));
    // Never start in a solved arrangement.
    if (accepted(p).some((acc) => acc.join('|') === order.join('|'))) order = [...order.slice(1), order[0]];
    return { order };
  },
  applyAction(s, a) {
    if (a.type !== 'move') return s;
    const { from, to } = a;
    if (from < 0 || from >= s.order.length || to < 0 || to >= s.order.length || from === to) return s;
    const order = [...s.order];
    const [it] = order.splice(from, 1);
    order.splice(to, 0, it);
    return { order };
  },
  actions(s) {
    const out: OrderAction[] = [];
    for (let i = 0; i + 1 < s.order.length; i++) out.push({ type: 'move', from: i, to: i + 1 });
    return out;
  },
  isAnswered: () => true,
  checkAnswer(s, a, p) {
    return accepted(p, a).some((acc) => acc.join('|') === s.order.join('|'));
  },
  isSolved(s, p) {
    return accepted(p).some((acc) => acc.join('|') === s.order.join('|'));
  },
  diagnose(s, a, p, locale) {
    const target = accepted(p, a)[0];
    const right = s.order.filter((id, i) => target[i] === id).length;
    return t(locale, `${right} von ${s.order.length} stehen schon an der richtigen Stelle.`, `${right} of ${s.order.length} are already in the right place.`);
  },
  solve: (p) => ({ order: orderIds(p) }),
  countSolutions: (p, a) => accepted(p, a).length,
  describe(s, p, locale) {
    const list = s.order.map((id, i) => `${i + 1}. ${label(p, id)}`).join(', ');
    return t(locale, `Reihenfolge: ${list}.`, `Order: ${list}.`);
  },
  validateState(s, p) {
    const ids = orderIds(p);
    return s.order.length === ids.length && [...s.order].sort().join('|') === [...ids].sort().join('|') ? [] : ['order is not a permutation of the items'];
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    const ids = orderIds(p);
    if (new Set(ids).size !== ids.length) issues.push({ level: 'error', code: 'order.duplicate-id', message: 'Doppelte Item-ID.' });
    for (const alt of a?.anyOf ?? []) {
      if ([...alt].sort().join('|') !== [...ids].sort().join('|')) issues.push({ level: 'error', code: 'order.bad-alternative', message: t(locale, 'Eine alternative Reihenfolge enthält nicht genau alle Items.', 'An alternative order does not contain exactly all items.') });
    }
    return issues;
  },
  secret: (p) => [p.items.map((i) => i.label).join(', ')],
};
