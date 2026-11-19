import { z } from 'zod';
import { evalMath, parseMath } from '../math.ts';
import { formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Slider = z.object({
  id: z.string().regex(/^[a-z]$/, 'Regler-IDs sind einzelne Kleinbuchstaben (z. B. m, b)'),
  label: z.string().optional(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  initial: z.number(),
});

const Params = z.object({
  /** Function of x and the slider ids, e.g. "m*x + b". */
  expr: z.string().min(1),
  sliders: z.array(Slider).min(1).max(3),
  x: z.tuple([z.number(), z.number()]).default([-5, 5]),
  y: z.tuple([z.number(), z.number()]).default([-5, 5]),
  /** Fixed points to aim for. */
  markers: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional(), group: z.enum(['a', 'b']).optional() })).default([]),
  /** Write coordinates next to markers. */
  showCoordinates: z.boolean().default(true),
  /** Optional target curve shown dashed. */
  target: z.object({ expr: z.string(), label: z.string().optional() }).optional(),
});

const Answer = z.object({
  values: z.record(z.string(), z.number()).optional(),
  /** Correct when the learner's curve coincides with params.target. */
  matchTarget: z.boolean().optional(),
});

export type SliderParams = z.infer<typeof Params>;
export type SliderAnswer = z.input<typeof Answer>;
export interface SliderState {
  values: Record<string, number>;
}
export type SliderAction = { type: 'set'; id: string; value: number };

const snap = (v: number, s: { min: number; max: number; step: number }) =>
  Math.round(Math.min(s.max, Math.max(s.min, s.min + Math.round((v - s.min) / s.step) * s.step)) * 1e9) / 1e9;

export function sliderCurve(p: SliderParams, values: Record<string, number>): (x: number) => number {
  const vars = ['x', ...p.sliders.map((s) => s.id)];
  const node = parseMath(p.expr, vars);
  return (x) => evalMath(node, { ...values, x });
}

function curveMatchesTarget(p: SliderParams, values: Record<string, number>): boolean {
  if (!p.target) return false;
  const f = sliderCurve(p, values);
  const g = parseMath(p.target.expr, ['x']);
  for (let k = 0; k <= 8; k++) {
    const x = p.x[0] + ((p.x[1] - p.x[0]) * k) / 8 + 0.013;
    const a = f(x);
    const b = evalMath(g, { x });
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(b))) return false;
  }
  return true;
}

export const sliderWidget: WidgetDefinition<SliderParams, SliderState, SliderAction, SliderAnswer> = {
  kind: 'slider',
  title: { de: 'Regler & Graph', en: 'Sliders & graph' },
  params: Params,
  answer: Answer as unknown as z.ZodType<SliderAnswer>,
  interactive: true,
  init: (p) => ({ values: Object.fromEntries(p.sliders.map((s) => [s.id, snap(s.initial, s)])) }),
  applyAction(s, a, p) {
    const def = p.sliders.find((x) => x.id === a.id);
    if (a.type !== 'set' || !def) return s;
    return { values: { ...s.values, [a.id]: snap(a.value, def) } };
  },
  actions(_s, p) {
    const out: SliderAction[] = [];
    for (const sl of p.sliders) for (let v = sl.min; v <= sl.max + 1e-9; v += sl.step) out.push({ type: 'set', id: sl.id, value: snap(v, sl) });
    return out;
  },
  isAnswered: () => true,
  checkAnswer(s, a, p) {
    if (a.values && !Object.entries(a.values).every(([k, v]) => Math.abs((s.values[k] ?? NaN) - v) < 1e-9)) return false;
    if (a.matchTarget && !curveMatchesTarget(p, s.values)) return false;
    return Boolean(a.values || a.matchTarget);
  },
  solve(p, a) {
    if (!a?.values) return null;
    return { values: { ...sliderWidget.init(p, { locale: 'de', seed: 0 }).values, ...a.values } };
  },
  scope: (s) => ({ ...s.values }),
  describe(s, p, locale) {
    const vals = p.sliders.map((sl) => `${sl.label ?? sl.id} = ${formatNumber(s.values[sl.id], locale)}`).join(', ');
    let shown = p.expr;
    for (const sl of p.sliders) shown = shown.replace(new RegExp(`\\b${sl.id}\\b`, 'g'), `(${formatNumber(s.values[sl.id], locale)})`);
    const target = p.target ? t(locale, ` Zielgraph (gestrichelt): y = ${p.target.expr}.`, ` Target graph (dashed): y = ${p.target.expr}.`) : '';
    const marks = p.markers.length ? ' ' + p.markers.map((m) => `${t(locale, 'Punkt', 'Point')} ${m.label ?? (m.group === 'a' ? t(locale, 'blau', 'blue') : m.group === 'b' ? t(locale, 'orange', 'orange') : '')} (${formatNumber(m.x, locale)} | ${formatNumber(m.y, locale)})`).join(', ') + '.' : '';
    return t(locale, `Regler: ${vals}. Aktueller Graph: y = ${shown}.${target}${marks}`, `Sliders: ${vals}. Current graph: y = ${shown}.${target}${marks}`);
  },
  validateState(s, p) {
    return p.sliders.flatMap((sl) => {
      const v = s.values[sl.id];
      return v === undefined || v < sl.min - 1e-9 || v > sl.max + 1e-9 ? [`slider ${sl.id} out of range`] : [];
    });
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    const vars = ['x', ...p.sliders.map((s) => s.id)];
    try {
      parseMath(p.expr, vars);
    } catch (e) {
      issues.push({ level: 'error', code: 'slider.bad-expr', message: `expr nicht lesbar: ${(e as Error).message}` });
    }
    if (p.target) {
      try {
        parseMath(p.target.expr, ['x']);
      } catch (e) {
        issues.push({ level: 'error', code: 'slider.bad-target', message: `target.expr nicht lesbar: ${(e as Error).message}` });
      }
    }
    for (const sl of p.sliders) {
      if (sl.min >= sl.max) issues.push({ level: 'error', code: 'slider.range', message: `Regler ${sl.id}: min ≥ max.` });
      if ((sl.max - sl.min) / sl.step > 60) issues.push({ level: 'warning', code: 'slider.fine', message: t(locale, `Regler ${sl.id} hat sehr viele Stufen – schwer zu treffen.`, `Slider ${sl.id} has many steps.`) });
    }
    if (a?.matchTarget && !p.target) issues.push({ level: 'error', code: 'slider.no-target', message: 'matchTarget ohne params.target.' });
    if (a?.matchTarget && p.target && !issues.some((i) => i.code.startsWith('slider.bad'))) {
      // Initial state must not already match.
      const init = sliderWidget.init(p, { locale, seed: 0 });
      if (curveMatchesTarget(p, init.values)) issues.push({ level: 'error', code: 'slider.trivial', message: 'Der Startzustand trifft den Zielgraphen bereits.' });
    }
    return issues;
  },
  secret: (p, a) => (a?.values ? Object.entries(a.values).map(([k, v]) => `${k} = ${v}`) : p.target ? [p.target.expr] : []),
};
