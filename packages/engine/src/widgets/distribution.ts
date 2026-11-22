import { z } from 'zod';
import { formatNumber } from '../expr.ts';
import { exprFunction } from '../expr.ts';
import { mulberry32 } from '../rng.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Probability distribution with sampling. Two flavours:
 *  - weights (dice, coins, urns): probabilities = weight / total
 *  - logits + temperature (language models): probabilities = softmax(logit / T)
 * Sampling is seeded and stored in the state, so everything is reproducible.
 */
const Params = z.object({
  mode: z.enum(['chance', 'tokens']).default('chance'),
  /** Sentence prefix for token mode, e.g. "Heute scheint die". */
  context: z.string().optional(),
  items: z.array(z.object({ label: z.string().min(1), weight: z.number().min(0).optional(), logit: z.number().optional() })).min(2).max(10),
  temperature: z.object({ min: z.number().positive(), max: z.number().positive(), step: z.number().positive(), initial: z.number().positive() }).optional(),
  sample: z.array(z.number().int().min(1).max(1000)).default([1, 10, 100]),
  /** Show relative frequencies next to the probabilities. */
  showCounts: z.boolean().default(true),
});

export type DistributionParams = z.infer<typeof Params>;
export interface DistributionState {
  temperature: number | null;
  counts: number[];
  draws: number;
  last: number[];
  rng: number;
}
export type DistributionAction = { type: 'temp'; value: number } | { type: 'sample'; n: number } | { type: 'reset' };

export function probabilities(p: DistributionParams, temperature: number | null): number[] {
  if (p.items.every((i) => i.logit !== undefined) && temperature) {
    const z = p.items.map((i) => i.logit! / temperature);
    const m = Math.max(...z);
    const e = z.map((v) => Math.exp(v - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  }
  const w = p.items.map((i) => i.weight ?? 1);
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((v) => v / s);
}

const snapT = (p: DistributionParams, v: number) => {
  const tt = p.temperature!;
  return Math.round(Math.min(tt.max, Math.max(tt.min, tt.min + Math.round((v - tt.min) / tt.step) * tt.step)) * 1e6) / 1e6;
};

export const distributionWidget: WidgetDefinition<DistributionParams, DistributionState, DistributionAction> = {
  kind: 'distribution',
  title: { de: 'Zufall & Wahrscheinlichkeit', en: 'Chance & probability' },
  params: Params,
  interactive: true,
  init: (p, ctx) => ({ temperature: p.temperature ? snapT(p, p.temperature.initial) : null, counts: p.items.map(() => 0), draws: 0, last: [], rng: (ctx.seed * 2654435761) >>> 0 }),
  applyAction(s, a, p) {
    if (a.type === 'reset') return { ...s, counts: p.items.map(() => 0), draws: 0, last: [] };
    if (a.type === 'temp') return p.temperature ? { ...s, temperature: snapT(p, a.value) } : s;
    if (a.type === 'sample') {
      const n = Math.max(1, Math.min(1000, Math.floor(a.n)));
      if (!p.sample.includes(n)) return s;
      const probs = probabilities(p, s.temperature);
      const rnd = mulberry32(s.rng);
      const counts = [...s.counts];
      const last = [...s.last];
      for (let k = 0; k < n; k++) {
        let r = rnd();
        let idx = 0;
        while (idx < probs.length - 1 && r >= probs[idx]) r -= probs[idx++];
        counts[idx]++;
        last.push(idx);
      }
      return { ...s, counts, draws: s.draws + n, last: last.slice(-12), rng: Math.floor(rnd() * 4294967296) };
    }
    return s;
  },
  actions(_s, p) {
    const out: DistributionAction[] = p.sample.map((n) => ({ type: 'sample' as const, n }));
    if (p.temperature) for (let v = p.temperature.min; v <= p.temperature.max + 1e-9; v += p.temperature.step) out.push({ type: 'temp', value: snapT(p, v) });
    return out;
  },
  isAnswered: () => true,
  scope(s, p) {
    const probs = probabilities(p, s.temperature);
    // an item by label or by 0-based index – the index keeps predicates identical across translations
    const idx = (l: string | number) => (typeof l === 'number' ? (Number.isInteger(l) && l >= 0 && l < p.items.length ? l : -1) : p.items.findIndex((i) => i.label === l));
    return {
      prob: exprFunction((l: string | number) => (idx(l) >= 0 ? probs[idx(l)] : 0)),
      freq: exprFunction((l: string | number) => (idx(l) >= 0 && s.draws ? s.counts[idx(l)] / s.draws : 0)),
      count: exprFunction((l: string | number) => (idx(l) >= 0 ? s.counts[idx(l)] : 0)),
      draws: s.draws,
      temperature: s.temperature,
      top: p.items[probs.indexOf(Math.max(...probs))].label,
      topIndex: probs.indexOf(Math.max(...probs)),
    };
  },
  describe(s, p, locale) {
    const probs = probabilities(p, s.temperature);
    const list = p.items.map((it, i) => `${it.label} ${formatNumber(Math.round(probs[i] * 1000) / 10, locale)} %${s.draws ? ` (${s.counts[i]}×)` : ''}`).join(', ');
    const temp = s.temperature !== null ? t(locale, ` Temperatur ${formatNumber(s.temperature, locale)}.`, ` Temperature ${s.temperature}.`) : '';
    const ctx = p.context ? t(locale, `Satzanfang »${p.context} …«. `, `Prompt "${p.context} …". `) : '';
    return t(locale, `${ctx}Wahrscheinlichkeiten: ${list}.${temp} Bisher ${s.draws} Ziehungen.`, `${ctx}Probabilities: ${list}.${temp} ${s.draws} draws so far.`);
  },
  validateState(s, p) {
    const errs: string[] = [];
    if (s.counts.length !== p.items.length) errs.push('counts length');
    if (s.counts.reduce((a, b) => a + b, 0) !== s.draws) errs.push('counts do not add up');
    if (p.temperature && s.temperature !== null && (s.temperature < p.temperature.min - 1e-9 || s.temperature > p.temperature.max + 1e-9)) errs.push('temperature out of range');
    return errs;
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const hasLogits = p.items.some((i) => i.logit !== undefined);
    if (hasLogits && !p.items.every((i) => i.logit !== undefined)) issues.push({ level: 'error', code: 'dist.logits', message: 'Entweder alle Items mit logit oder keins.' });
    if (p.temperature && !hasLogits) issues.push({ level: 'error', code: 'dist.temperature', message: 'temperature braucht logits.' });
    if (!hasLogits && p.items.every((i) => (i.weight ?? 1) === 0)) issues.push({ level: 'error', code: 'dist.zero', message: 'Alle Gewichte sind 0.' });
    if (p.items.some((i) => i.label.length > 14)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, 'Lange Beschriftungen passen schlecht neben die Balken.', 'Long labels do not fit.') });
    return issues;
  },
};
