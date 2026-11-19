import { z } from 'zod';
import { gcd } from '../math.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  parts: z.number().int().min(1).max(24),
  shape: z.enum(['bar', 'circle']).default('bar'),
  shaded: z.array(z.number().int().min(0)).default([]),
  /** If set, the learner may re-split the whole into one of these part counts. */
  partOptions: z.array(z.number().int().min(1).max(24)).optional(),
  /** Reference fractions drawn above for comparison, e.g. ["1/2"]. */
  reference: z.array(z.string().regex(/^\d+\/\d+$/)).default([]),
});

const Answer = z.object({
  fraction: z.string().regex(/^\d+\/\d+$/, 'Format a/b'),
  /** Accept equivalent fractions (2/4 for 1/2). Default true. */
  equivalent: z.boolean().default(true),
  /** Require a specific number of parts (denominator). */
  parts: z.number().int().optional(),
});

export type FractionParams = z.infer<typeof Params>;
export type FractionAnswer = z.input<typeof Answer>;
export interface FractionState {
  parts: number;
  shaded: boolean[];
}
export type FractionAction = { type: 'toggle'; index: number } | { type: 'split'; parts: number };

const parse = (f: string) => {
  const [n, d] = f.split('/').map(Number);
  return { n, d };
};

export function shadedCount(s: FractionState): number {
  return s.shaded.filter(Boolean).length;
}

export const fractionWidget: WidgetDefinition<FractionParams, FractionState, FractionAction, FractionAnswer> = {
  kind: 'fraction',
  title: { de: 'Bruchmodell', en: 'Fraction model' },
  params: Params,
  answer: Answer as unknown as z.ZodType<FractionAnswer>,
  interactive: true,
  init(p) {
    return { parts: p.parts, shaded: Array.from({ length: p.parts }, (_, i) => p.shaded.includes(i)) };
  },
  applyAction(s, a, p) {
    if (a.type === 'toggle') {
      if (a.index < 0 || a.index >= s.parts) return s;
      const shaded = [...s.shaded];
      shaded[a.index] = !shaded[a.index];
      return { ...s, shaded };
    }
    if (a.type === 'split') {
      if (!p.partOptions?.includes(a.parts)) return s;
      return { parts: a.parts, shaded: Array(a.parts).fill(false) };
    }
    return s;
  },
  actions(s, p) {
    const out: FractionAction[] = [];
    for (let i = 0; i < s.parts; i++) out.push({ type: 'toggle', index: i });
    for (const n of p.partOptions ?? []) out.push({ type: 'split', parts: n });
    return out;
  },
  isAnswered: () => true,
  checkAnswer(s, a) {
    const { n, d } = parse(a.fraction);
    const k = shadedCount(s);
    if (a.parts !== undefined && s.parts !== a.parts) return false;
    if (a.equivalent === false) return s.parts === d && k === n;
    return k * d === n * s.parts;
  },
  diagnose(s, a, _p, locale) {
    if (!a) return null;
    const { n, d } = parse(a.fraction);
    const k = shadedCount(s);
    if (a.equivalent === false && k * d === n * s.parts) {
      return t(locale, `Gleich viel – aber gesucht ist die Darstellung mit ${d} Teilen.`, `Same amount – but use ${d} parts.`);
    }
    if (k === 0) return t(locale, 'Du hast noch keinen Teil gefärbt.', "You haven't shaded any part yet.");
    if (k === n && s.parts !== d) {
      return t(locale, `Du hast ${k} Teile gefärbt – aber das Ganze ist in ${s.parts} Teile geteilt, nicht in ${d}. Die Größe der Teile zählt!`, `You shaded ${k} parts – but the whole has ${s.parts} parts, not ${d}. Part size matters!`);
    }
    return t(locale, `Gefärbt sind ${k} von ${s.parts} Teilen, also ${k}/${s.parts}.`, `${k} of ${s.parts} parts are shaded: ${k}/${s.parts}.`);
  },
  solve(p, a) {
    if (!a) return null;
    const { n, d } = parse(a.fraction);
    const candidates = [p.parts, ...(p.partOptions ?? [])].filter((parts) =>
      a.parts !== undefined ? parts === a.parts : a.equivalent === false ? parts === d : (n * parts) % d === 0,
    );
    const parts = candidates[0];
    if (parts === undefined) return null;
    const k = (n * parts) / d;
    return { parts, shaded: Array.from({ length: parts }, (_, i) => i < k) };
  },
  countSolutions: () => 1,
  scope: (s) => ({ shadedCount: shadedCount(s), value: shadedCount(s) / s.parts }),
  describe(s, p, locale) {
    const k = shadedCount(s);
    const shape = p.shape === 'circle' ? t(locale, 'Kreis', 'circle') : t(locale, 'Streifen', 'bar');
    const ref = p.reference.length ? t(locale, ` Vergleich darüber: ${p.reference.join(', ')}.`, ` Reference above: ${p.reference.join(', ')}.`) : '';
    return t(locale, `${shape} mit ${s.parts} gleich großen Teilen, ${k} davon gefärbt (${k}/${s.parts}).${ref}`, `${shape} with ${s.parts} equal parts, ${k} shaded (${k}/${s.parts}).${ref}`);
  },
  validateState(s) {
    return s.shaded.length === s.parts ? [] : ['shaded array length differs from parts'];
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (p.shaded.some((i) => i >= p.parts)) issues.push({ level: 'error', code: 'fraction.bad-shaded', message: 'shaded enthält Index ≥ parts.' });
    const maxParts = Math.max(p.parts, ...(p.partOptions ?? []));
    if (p.shape === 'circle' && maxParts > 16) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Kreise mit mehr als 16 Teilen sind schwer lesbar.', 'Circles with >16 parts are hard to read.') });
    if (a) {
      const { n, d } = parse(a.fraction);
      if (d === 0) issues.push({ level: 'error', code: 'fraction.zero-den', message: 'Nenner 0.' });
      else if (n > d) issues.push({ level: 'error', code: 'fraction.improper', message: 'Unechte Brüche (> 1) passen nicht in ein Ganzes.' });
      else if (gcd(n, d) !== 1 && a.equivalent !== false && p.partOptions?.length) {
        issues.push({ level: 'info', code: 'fraction.unreduced-answer', message: `Musterlösung ${a.fraction} ist nicht gekürzt – gemeint ist jeder gleichwertige Bruch.` });
      }
    }
    return issues;
  },
  secret: (_p, a) => (a ? [a.fraction] : []),
};
