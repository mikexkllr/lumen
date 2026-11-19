import { z } from 'zod';
import { formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * "Schätz mal" – a gut-feeling guess on a slider before the lesson explains
 * the number. Close counts: the answer has a tolerance band. A log scale lets
 * the same slider span from tens to billions.
 */
const Params = z.object({
  min: z.number(),
  max: z.number(),
  /** Step of the linear scale (default: 1/100 of the range). */
  step: z.number().positive().optional(),
  scale: z.enum(['linear', 'log']).default('linear'),
  unit: z.string().optional(),
}).strict();

const Answer = z.object({
  value: z.number(),
  /** Absolute tolerance. */
  tolerance: z.number().min(0).optional(),
  /** Tolerance in percent of the true value (default 20; log scale: factor 1 ± within/100). */
  within: z.number().min(0).max(100).optional(),
}).strict();

export type EstimateParams = z.infer<typeof Params>;
export type EstimateAnswer = z.input<typeof Answer>;
export interface EstimateState {
  value: number | null;
}
export type EstimateAction = { type: 'set'; value: number };

const sig = (v: number, digits = 2) => {
  if (v === 0) return 0;
  const m = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(v))));
  return Math.round(v * m) / m;
};

export function estimateStep(p: EstimateParams): number {
  return p.step ?? sig((p.max - p.min) / 100, 1);
}

/** Snaps a raw value to the scale. */
export function estimateSnap(v: number, p: EstimateParams): number {
  const c = Math.min(p.max, Math.max(p.min, v));
  if (p.scale === 'log') return Math.min(p.max, Math.max(p.min, sig(c, 2)));
  const s = estimateStep(p);
  return Math.min(p.max, Math.round((p.min + Math.round((c - p.min) / s) * s) * 1e9) / 1e9);
}

/** Slider position 0…1 ↔ value. */
export function estimateToValue(pos: number, p: EstimateParams): number {
  const x = Math.min(1, Math.max(0, pos));
  return estimateSnap(p.scale === 'log' ? p.min * (p.max / p.min) ** x : p.min + (p.max - p.min) * x, p);
}
export function estimateToPos(v: number, p: EstimateParams): number {
  return p.scale === 'log' ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);
}

export function estimateTolerance(a: EstimateAnswer): number {
  return a.tolerance ?? (Math.abs(a.value) * (a.within ?? 20)) / 100;
}

const close = (v: number, a: EstimateAnswer) => Math.abs(v - a.value) <= estimateTolerance(a) + 1e-9;

export const estimateWidget: WidgetDefinition<EstimateParams, EstimateState, EstimateAction, EstimateAnswer> = {
  kind: 'estimate',
  title: { de: 'Schätzen', en: 'Estimate' },
  params: Params,
  answer: Answer as unknown as z.ZodType<EstimateAnswer>,
  interactive: true,
  autoHints: true,
  init: () => ({ value: null }),
  applyAction(s, a, p) {
    if (a.type !== 'set' || !Number.isFinite(a.value)) return s;
    return { value: estimateSnap(a.value, p) };
  },
  actions(_s, p) {
    const out: EstimateAction[] = [];
    for (let k = 0; k <= 20; k++) out.push({ type: 'set', value: estimateToValue(k / 20, p) });
    return out;
  },
  isAnswered: (s) => s.value !== null,
  checkAnswer: (s, a) => s.value !== null && close(s.value, a),
  diagnose(s, a, p, locale) {
    if (!a || s.value === null) return null;
    const low = s.value < a.value;
    const off = p.scale === 'log' ? Math.max(s.value, a.value) / Math.max(1e-12, Math.min(s.value, a.value)) : 0;
    if (p.scale === 'log' && off >= 10) return low ? t(locale, 'Viel zu niedrig – denk um Größenordnungen größer.', 'Far too low – think orders of magnitude bigger.') : t(locale, 'Viel zu hoch – denk um Größenordnungen kleiner.', 'Far too high – think orders of magnitude smaller.');
    return low ? t(locale, 'Zu niedrig. Schätz höher!', 'Too low. Guess higher!') : t(locale, 'Zu hoch. Schätz niedriger!', 'Too high. Guess lower!');
  },
  solve: (p, a) => (a ? { value: estimateSnap(a.value, p) } : null),
  scope: (s) => ({ value: s.value ?? 0 }),
  describe(s, p, locale) {
    const u = p.unit ? ` ${p.unit}` : '';
    const range = `${formatNumber(p.min, locale)}–${formatNumber(p.max, locale)}${u}`;
    return s.value === null
      ? t(locale, `Schätzregler von ${range}, noch nicht eingestellt.`, `Estimate slider from ${range}, not set yet.`)
      : t(locale, `Schätzregler von ${range}, Schätzung: ${formatNumber(s.value, locale)}${u}.`, `Estimate slider from ${range}, guess: ${formatNumber(s.value, locale)}${u}.`);
  },
  validateState: (s, p) => (s.value === null || (s.value >= p.min - 1e-9 && s.value <= p.max + 1e-9) ? [] : ['estimate out of range']),
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (p.min >= p.max) issues.push({ level: 'error', code: 'estimate.range', message: 'min ≥ max.' });
    if (p.scale === 'log' && p.min <= 0) issues.push({ level: 'error', code: 'estimate.log', message: 'Log-Skala braucht min > 0.' });
    if (!a) {
      issues.push({ level: 'error', code: 'estimate.no-answer', message: t(locale, 'Schätzaufgabe ohne answer.value.', 'Estimate without answer.value.') });
      return issues;
    }
    if (a.value < p.min || a.value > p.max) issues.push({ level: 'error', code: 'estimate.outside', message: 'answer.value liegt außerhalb der Skala.' });
    else if (!close(estimateSnap(a.value, p), a)) issues.push({ level: 'error', code: 'estimate.unreachable', message: 'Die Skala trifft den Toleranzbereich nicht.' });
    if (p.scale === 'linear' && (2 * estimateTolerance(a)) / (p.max - p.min) > 0.5) issues.push({ level: 'warning', code: 'estimate.easy', message: t(locale, 'Der Toleranzbereich deckt mehr als die halbe Skala ab.', 'The tolerance band covers more than half the scale.') });
    return issues;
  },
  secret: (_p, a) => (a ? [formatNumber(a.value, 'de'), formatNumber(a.value, 'en')] : []),
};
