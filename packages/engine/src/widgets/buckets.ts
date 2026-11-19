import { z } from 'zod';
import { hashString, mulberry32, shuffle } from '../rng.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Sort cards into 2–4 categories ("Zuordnen"). Each item names its correct
 * bucket by id or label. Tap a card, then a bucket – or drag.
 */
const Params = z.object({
  buckets: z.array(z.object({ id: z.string().optional(), label: z.string().min(1) }).strict()).min(2).max(4),
  items: z.array(z.object({ id: z.string().optional(), label: z.string().min(1), bucket: z.string() }).strict()).min(2).max(12),
});

export type BucketsParams = z.infer<typeof Params>;
export interface BucketsState {
  /** Display order of item ids. */
  order: string[];
  /** item id → bucket id (missing = still in the pool) */
  placed: Record<string, string>;
}
export type BucketsAction = { type: 'place'; item: string; bucket: string } | { type: 'unplace'; item: string } | { type: 'clear' };

export const bucketIds = (p: BucketsParams) => p.buckets.map((b, i) => b.id ?? `b${i + 1}`);
export const itemIds = (p: BucketsParams) => p.items.map((it, i) => it.id ?? `i${i + 1}`);
/** Stable shuffled card order (same for init and reveal). */
const initialOrder = (p: BucketsParams) => shuffle(itemIds(p), mulberry32(hashString(p.items.map((it) => it.label).join('|'))));

/** Correct bucket id of every item (resolves labels). */
export function bucketTargets(p: BucketsParams): Record<string, string | undefined> {
  const bids = bucketIds(p);
  const ids = itemIds(p);
  const out: Record<string, string | undefined> = {};
  p.items.forEach((it, i) => {
    const byId = bids.indexOf(it.bucket);
    const byLabel = p.buckets.findIndex((b) => b.label === it.bucket);
    out[ids[i]] = byId >= 0 ? bids[byId] : byLabel >= 0 ? bids[byLabel] : undefined;
  });
  return out;
}

const correctCount = (s: BucketsState, p: BucketsParams) => {
  const target = bucketTargets(p);
  return Object.entries(s.placed).filter(([item, b]) => target[item] === b).length;
};

export const bucketsWidget: WidgetDefinition<BucketsParams, BucketsState, BucketsAction> = {
  kind: 'buckets',
  title: { de: 'Zuordnen', en: 'Sort into groups' },
  params: Params,
  interactive: true,
  init: (p) => ({ order: initialOrder(p), placed: {} }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return { ...s, placed: {} };
    if (!itemIds(p).includes(a.item)) return s;
    if (a.type === 'unplace') {
      const placed = { ...s.placed };
      delete placed[a.item];
      return { ...s, placed };
    }
    if (!bucketIds(p).includes(a.bucket)) return s;
    return { ...s, placed: { ...s.placed, [a.item]: a.bucket } };
  },
  actions(s, p) {
    const out: BucketsAction[] = [];
    for (const item of itemIds(p)) {
      if (s.placed[item]) out.push({ type: 'unplace', item });
      else for (const bucket of bucketIds(p)) out.push({ type: 'place', item, bucket });
    }
    return out;
  },
  isAnswered: (s, p) => itemIds(p).every((id) => s.placed[id]),
  isSolved: (s, p) => itemIds(p).every((id) => s.placed[id]) && correctCount(s, p) === p.items.length,
  diagnose(s, _a, p, locale) {
    const n = correctCount(s, p);
    return t(locale, `${n} von ${p.items.length} sind richtig zugeordnet.`, `${n} of ${p.items.length} are sorted correctly.`);
  },
  solve(p) {
    const target = bucketTargets(p);
    const placed: Record<string, string> = {};
    for (const id of itemIds(p)) if (target[id]) placed[id] = target[id]!;
    return { order: initialOrder(p), placed };
  },
  countSolutions: () => 1,
  scope: (s, p) => ({ placed: s.placed, correct: correctCount(s, p) }),
  describe(s, p, locale) {
    const ids = itemIds(p);
    const label = (id: string) => p.items[ids.indexOf(id)]?.label ?? id;
    const groups = bucketIds(p).map((b, i) => {
      const inside = s.order.filter((id) => s.placed[id] === b).map(label);
      return `${p.buckets[i].label}: ${inside.length ? inside.join(', ') : t(locale, 'leer', 'empty')}`;
    });
    const pool = s.order.filter((id) => !s.placed[id]).map(label);
    return t(locale, `Gruppen – ${groups.join('; ')}. Noch nicht zugeordnet: ${pool.length ? pool.join(', ') : 'nichts'}.`, `Groups – ${groups.join('; ')}. Not sorted yet: ${pool.length ? pool.join(', ') : 'nothing'}.`);
  },
  validateState(s, p) {
    const bids = new Set(bucketIds(p));
    return Object.values(s.placed).every((b) => bids.has(b)) ? [] : ['unknown bucket'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const target = bucketTargets(p);
    for (const [id, b] of Object.entries(target)) if (!b) issues.push({ level: 'error', code: 'buckets.target', message: `Karte ${id}: Gruppe nicht gefunden.` });
    const used = new Set(Object.values(target));
    if (used.size < 2) issues.push({ level: 'warning', code: 'buckets.trivial', message: t(locale, 'Alle Karten gehören in dieselbe Gruppe.', 'All cards belong to one group.') });
    if (p.items.some((it) => it.label.length > 40)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, 'Lange Kartentexte sind auf dem Handy schwer lesbar.', 'Long card texts are hard to read on phones.') });
    return issues;
  },
};
