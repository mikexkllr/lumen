import { z } from 'zod';
import { formatFraction, resolveNumber, toFraction } from '../math.ts';
import { formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  min: z.number().default(0),
  max: z.number().default(1),
  /** Subdivisions per unit (4 → quarters). */
  ticks: z.number().int().min(1).max(20).default(4),
  /** How tick labels are written. */
  labels: z.enum(['integers', 'fractions', 'decimals', 'none']).default('integers'),
  initial: z.number().nullable().default(null),
  markers: z.array(z.object({ value: z.union([z.number(), z.string()]), label: z.string() })).default([]),
});

const Answer = z.object({
  value: z.union([z.number(), z.string()]),
  tolerance: z.number().min(0).default(0),
});

export type NumberLineParams = z.infer<typeof Params>;
export type NumberLineAnswer = z.input<typeof Answer>;
export interface NumberLineState {
  value: number | null;
}
export type NumberLineAction = { type: 'set'; value: number };

export function tickValues(p: NumberLineParams): number[] {
  const out: number[] = [];
  const n = Math.round((p.max - p.min) * p.ticks);
  for (let i = 0; i <= n; i++) out.push(Math.round((p.min + i / p.ticks) * 1e9) / 1e9);
  return out;
}

export function snapToTick(p: NumberLineParams, v: number): number {
  const i = Math.round((v - p.min) * p.ticks);
  const clamped = Math.max(0, Math.min(Math.round((p.max - p.min) * p.ticks), i));
  return Math.round((p.min + clamped / p.ticks) * 1e9) / 1e9;
}

export function formatTick(v: number, p: NumberLineParams, locale: string): string {
  if (p.labels === 'fractions') {
    const f = toFraction(v);
    return formatFraction(f.num, f.den);
  }
  return formatNumber(v, locale);
}

export const numberLineWidget: WidgetDefinition<NumberLineParams, NumberLineState, NumberLineAction, NumberLineAnswer> = {
  kind: 'numberline',
  title: { de: 'Zahlenstrahl', en: 'Number line' },
  params: Params,
  answer: Answer as unknown as z.ZodType<NumberLineAnswer>,
  interactive: true,
  init: (p) => ({ value: p.initial === null ? null : snapToTick(p, p.initial) }),
  applyAction: (s, a, p) => (a.type === 'set' && Number.isFinite(a.value) ? { value: snapToTick(p, a.value) } : s),
  actions: (_s, p) => tickValues(p).map((value) => ({ type: 'set' as const, value })),
  isAnswered: (s) => s.value !== null,
  checkAnswer(s, a) {
    if (s.value === null) return false;
    return Math.abs(s.value - resolveNumber(a.value)) <= Math.max(a.tolerance ?? 0, 1e-9);
  },
  diagnose(s, a, p, locale) {
    if (!a || s.value === null) return null;
    const goal = resolveNumber(a.value);
    const f = toFraction(s.value);
    const where = p.labels === 'decimals' ? formatNumber(s.value, locale) : formatFraction(f.num, f.den);
    return goal > s.value
      ? t(locale, `Deine Markierung steht bei ${where} – das ist zu klein.`, `Your marker is at ${where} – too small.`)
      : t(locale, `Deine Markierung steht bei ${where} – das ist zu groß.`, `Your marker is at ${where} – too large.`);
  },
  solve: (p, a) => (a ? { value: snapToTick(p, resolveNumber(a.value)) } : null),
  countSolutions: () => 1,
  describe(s, p, locale) {
    const unit = p.ticks === 1 ? '' : t(locale, `, jede Einheit in ${p.ticks} Teile geteilt`, `, each unit split into ${p.ticks}`);
    const marker = s.value === null ? t(locale, 'Noch keine Markierung.', 'No marker yet.') : t(locale, `Markierung bei ${formatTick(s.value, { ...p, labels: p.labels === 'decimals' ? 'decimals' : 'fractions' }, locale)}.`, `Marker at ${formatTick(s.value, { ...p, labels: p.labels === 'decimals' ? 'decimals' : 'fractions' }, locale)}.`);
    const fixed = p.markers.length ? ' ' + p.markers.map((m) => `${m.label}: ${m.value}`).join(', ') + '.' : '';
    return t(locale, `Zahlenstrahl von ${p.min} bis ${p.max}${unit}. ${marker}${fixed}`, `Number line from ${p.min} to ${p.max}${unit}. ${marker}${fixed}`);
  },
  validateState(s, p) {
    if (s.value === null) return [];
    return s.value < p.min - 1e-9 || s.value > p.max + 1e-9 ? ['marker out of range'] : [];
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (p.min >= p.max) issues.push({ level: 'error', code: 'numberline.range', message: 'min ≥ max.' });
    if ((p.max - p.min) * p.ticks > 40) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Mehr als 40 Teilstriche sind auf dem Handy kaum treffbar.', 'More than 40 ticks are hard to hit on mobile.') });
    if (a) {
      const v = resolveNumber(a.value);
      if (Math.abs(snapToTick(p, v) - v) > 1e-9) issues.push({ level: 'error', code: 'numberline.off-tick', message: t(locale, `Die Lösung ${a.value} liegt auf keinem Teilstrich.`, `Answer ${a.value} is not on a tick.`) });
      if (p.initial !== null && Math.abs(snapToTick(p, p.initial) - v) < 1e-9) issues.push({ level: 'error', code: 'numberline.trivial', message: 'Startmarkierung ist schon die Lösung.' });
    }
    return issues;
  },
  secret: (_p, a) => (a ? [String(a.value)] : []),
};
