import { z } from 'zod';
import { exprFunction } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Venn diagram with 2 or 3 sets. Learners shade regions. Regions are named by
 * the sets they belong to: 'A', 'B', 'AB', 'ABC' … and 'O' for outside.
 * Answer `{ regions: [...] }` or predicates with `has('AB')`, `shaded`.
 */
const Params = z.object({
  sets: z.array(z.string().min(1)).min(2).max(3),
  /** Include the area outside all sets as a shadable region. */
  outside: z.boolean().default(false),
  /** Numbers or short labels written into regions. */
  counts: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  /** Regions shaded at the start. */
  shaded: z.array(z.string()).default([]),
  /** Universe label (box caption). */
  universe: z.string().optional(),
});
const Answer = z.object({ regions: z.array(z.string()) });

export type VennParams = z.infer<typeof Params>;
export type VennAnswer = z.input<typeof Answer>;
export interface VennState {
  shaded: string[];
}
export type VennAction = { type: 'toggle'; region: string } | { type: 'clear' };

const LETTERS = ['A', 'B', 'C'];

/** All region keys for the given number of sets, canonical order. */
export function vennRegions(p: VennParams): string[] {
  const n = p.sets.length;
  const out: string[] = [];
  for (let mask = 1; mask < 2 ** n; mask++) out.push(LETTERS.slice(0, n).filter((_, i) => mask & (1 << i)).join(''));
  out.sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (p.outside) out.push('O');
  return out;
}

export const normRegion = (r: string) => (r.toUpperCase() === 'O' ? 'O' : [...new Set(r.toUpperCase().split(''))].sort().join(''));

export function regionName(p: VennParams, region: string, locale: string): string {
  if (region === 'O') return t(locale, 'außerhalb aller Mengen', 'outside all sets');
  const inside = region.split('').map((l) => p.sets[LETTERS.indexOf(l)]);
  const outside = LETTERS.slice(0, p.sets.length).filter((l) => !region.includes(l)).map((l) => p.sets[LETTERS.indexOf(l)]);
  return t(locale, `${inside.join(' und ')}${outside.length ? `, nicht ${outside.join(', nicht ')}` : ''}`, `${inside.join(' and ')}${outside.length ? `, not ${outside.join(', not ')}` : ''}`);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const vennWidget: WidgetDefinition<VennParams, VennState, VennAction, VennAnswer> = {
  kind: 'venn',
  title: { de: 'Venn-Diagramm', en: 'Venn diagram' },
  params: Params,
  answer: Answer as unknown as z.ZodType<VennAnswer>,
  interactive: true,
  init: (p) => ({ shaded: p.shaded.map(normRegion).filter((r) => vennRegions(p).includes(r)) }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return { shaded: [] };
    const r = normRegion(a.region);
    if (!vennRegions(p).includes(r)) return s;
    const shaded = s.shaded.includes(r) ? s.shaded.filter((x) => x !== r) : [...s.shaded, r].sort();
    return { shaded };
  },
  actions: (_s, p) => vennRegions(p).map((region) => ({ type: 'toggle' as const, region })),
  isAnswered: (s) => s.shaded.length > 0,
  checkAnswer: (s, a) => sameSet(s.shaded, a.regions.map(normRegion)),
  diagnose(s, a, p, locale) {
    if (!a) return null;
    const target = a.regions.map(normRegion);
    const extra = s.shaded.filter((r) => !target.includes(r));
    const missing = target.filter((r) => !s.shaded.includes(r));
    if (extra.length) return t(locale, `Zu viel gefärbt: ${regionName(p, extra[0], locale)}.`, `Shaded too much: ${regionName(p, extra[0], locale)}.`);
    if (missing.length) return t(locale, `Es fehlt noch ein Bereich.`, `One region is still missing.`);
    return null;
  },
  solve: (_p, a) => (a ? { shaded: a.regions.map(normRegion).sort() } : null),
  countSolutions: () => 1,
  scope: (s) => ({ shaded: s.shaded, has: exprFunction((r: string) => s.shaded.includes(normRegion(r))) }),
  describe(s, p, locale) {
    const sets = p.sets.map((name, i) => `${LETTERS[i]} = ${name}`).join(', ');
    const counts = Object.entries(p.counts).map(([r, v]) => `${regionName(p, normRegion(r), locale)}: ${v}`).join('; ');
    const shaded = s.shaded.map((r) => regionName(p, r, locale)).join('; ');
    return t(
      locale,
      `Venn-Diagramm mit ${sets}.${counts ? ` Zahlen: ${counts}.` : ''} Gefärbt: ${shaded || 'nichts'}.`,
      `Venn diagram with ${sets}.${counts ? ` Numbers: ${counts}.` : ''} Shaded: ${shaded || 'nothing'}.`,
    );
  },
  validateState: (s, p) => (s.shaded.every((r) => vennRegions(p).includes(r)) ? [] : ['unknown region']),
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    const all = vennRegions(p);
    for (const r of [...Object.keys(p.counts), ...(a?.regions ?? [])]) {
      if (!all.includes(normRegion(r))) issues.push({ level: 'error', code: 'venn.region', message: `Unbekannter Bereich »${r}« (erlaubt: ${all.join(', ')}).` });
    }
    if (p.sets.some((s) => s.length > 16)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, 'Lange Mengennamen überlappen.', 'Long set names overlap.') });
    return issues;
  },
};
