import { z } from 'zod';
import { formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Rotate a ray around a vertex to set an angle (0–360°). Optional unit-circle
 * mode shows the point (cos | sin) with its projections.
 */
const Params = z.object({
  initial: z.number().min(0).max(360).default(30),
  snap: z.number().positive().max(90).default(5),
  max: z.number().min(10).max(360).default(360),
  /** Show the degree value while turning (off for estimation tasks). */
  showValue: z.boolean().default(true),
  /** Unit circle with sine/cosine projections. */
  trig: z.boolean().default(false),
  /** A fixed reference ray at this angle (e.g. to measure an angle between two rays). */
  reference: z.number().min(0).max(360).optional(),
  label: z.string().optional(),
});
const Answer = z.object({ value: z.union([z.number(), z.string()]), tolerance: z.number().min(0).default(0) });

export type AngleParams = z.infer<typeof Params>;
export type AngleAnswer = z.input<typeof Answer>;
export interface AngleState {
  deg: number;
}
export type AngleAction = { type: 'set'; deg: number };

export const snapAngle = (p: AngleParams, d: number) => Math.max(0, Math.min(p.max, Math.round(d / p.snap) * p.snap));
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const angleWidget: WidgetDefinition<AngleParams, AngleState, AngleAction, AngleAnswer> = {
  kind: 'angle',
  title: { de: 'Winkel', en: 'Angle' },
  params: Params,
  answer: Answer as unknown as z.ZodType<AngleAnswer>,
  interactive: true,
  init: (p) => ({ deg: snapAngle(p, p.initial) }),
  applyAction: (s, a, p) => (a.type === 'set' ? { deg: snapAngle(p, a.deg) } : s),
  actions(_s, p) {
    const out: AngleAction[] = [];
    for (let d = 0; d <= p.max + 1e-9; d += p.snap) out.push({ type: 'set', deg: d });
    return out;
  },
  isAnswered: () => true,
  checkAnswer: (s, a) => Math.abs(s.deg - Number(a.value)) <= (a.tolerance ?? 0) + 1e-9,
  diagnose(s, a, _p, locale) {
    if (!a) return null;
    const d = s.deg - Number(a.value);
    return d > 0 ? t(locale, `Etwas zu weit gedreht.`, `A bit too far.`) : t(locale, `Noch etwas weiter drehen.`, `Turn a bit further.`);
  },
  solve: (p, a) => (a ? { deg: snapAngle(p, Number(a.value)) } : null),
  scope: (s) => ({ deg: s.deg, sin: r3(Math.sin(rad(s.deg))), cos: r3(Math.cos(rad(s.deg))), tan: Math.abs(Math.cos(rad(s.deg))) < 1e-9 ? null : r3(Math.tan(rad(s.deg))) }),
  describe(s, p, locale) {
    const trig = p.trig ? t(locale, ` Punkt auf dem Einheitskreis: cos = ${formatNumber(r3(Math.cos(rad(s.deg))), locale)}, sin = ${formatNumber(r3(Math.sin(rad(s.deg))), locale)}.`, ` Point on the unit circle: cos = ${r3(Math.cos(rad(s.deg)))}, sin = ${r3(Math.sin(rad(s.deg)))}.`) : '';
    const ref = p.reference !== undefined ? t(locale, ` Fester Schenkel bei ${p.reference}°.`, ` Fixed ray at ${p.reference}°.`) : '';
    return t(locale, `Winkel ${p.showValue ? `${formatNumber(s.deg, locale)}°` : '(Wert verborgen)'}.${ref}${trig}`, `Angle ${p.showValue ? `${s.deg}°` : '(value hidden)'}.${ref}${trig}`);
  },
  validateState: (s, p) => (s.deg >= 0 && s.deg <= p.max + 1e-9 ? [] : ['angle out of range']),
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (a && Number(a.value) % p.snap !== 0 && (a.tolerance ?? 0) < p.snap / 2) issues.push({ level: 'error', code: 'angle.snap', message: t(locale, 'Der Zielwert liegt nicht auf dem Raster (snap).', 'Target is not on the snap grid.') });
    return issues;
  },
};
