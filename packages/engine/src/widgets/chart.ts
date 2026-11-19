import { z } from 'zod';
import { formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Bar / dot chart for data literacy. Bars can be draggable (step-snapped),
 * mean/median lines can be shown. Predicates get mean(), median() etc.
 */
const Params = z.object({
  labels: z.array(z.string()).min(1).max(12),
  values: z.array(z.number()).min(1).max(12),
  editable: z.array(z.number().int()).default([]),
  min: z.number().default(0),
  max: z.number().default(10),
  step: z.number().positive().default(1),
  unit: z.string().optional(),
  show: z.array(z.enum(['mean', 'median'])).default([]),
  title: z.string().optional(),
});

const Answer = z.object({ values: z.array(z.number()) });

export type ChartParams = z.infer<typeof Params>;
export interface ChartState {
  values: number[];
}
export type ChartAction = { type: 'set'; index: number; value: number };

export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const snap = (p: ChartParams, v: number) => Math.round(Math.min(p.max, Math.max(p.min, Math.round((v - p.min) / p.step) * p.step + p.min)) * 1e9) / 1e9;

export const chartWidget: WidgetDefinition<ChartParams, ChartState, ChartAction, z.input<typeof Answer>> = {
  kind: 'chart',
  title: { de: 'Diagramm', en: 'Chart' },
  params: Params,
  answer: Answer as unknown as z.ZodType<z.input<typeof Answer>>,
  interactive: true,
  init: (p) => ({ values: [...p.values] }),
  applyAction(s, a, p) {
    if (a.type !== 'set' || !p.editable.includes(a.index)) return s;
    const values = [...s.values];
    values[a.index] = snap(p, a.value);
    return { values };
  },
  actions(_s, p) {
    const out: ChartAction[] = [];
    for (const i of p.editable) for (let v = p.min; v <= p.max + 1e-9; v += p.step) out.push({ type: 'set', index: i, value: snap(p, v) });
    return out;
  },
  isAnswered: () => true,
  checkAnswer: (s, a) => a.values.length === s.values.length && a.values.every((v, i) => Math.abs(v - s.values[i]) < 1e-9),
  solve: (_p, a) => (a ? { values: [...a.values] } : null),
  scope: (s) => ({ values: s.values, avg: mean(s.values), med: median(s.values) }),
  describe(s, p, locale) {
    const unit = p.unit ? ` ${p.unit}` : '';
    const list = p.labels.map((l, i) => `${l}: ${formatNumber(s.values[i], locale)}${unit}`).join(', ');
    const extra = [
      p.show.includes('mean') ? t(locale, `Mittelwert ${formatNumber(Math.round(mean(s.values) * 100) / 100, locale)}`, `mean ${Math.round(mean(s.values) * 100) / 100}`) : '',
      p.show.includes('median') ? t(locale, `Median ${formatNumber(median(s.values), locale)}`, `median ${median(s.values)}`) : '',
    ].filter(Boolean).join(', ');
    const edit = p.editable.length ? t(locale, ` Verstellbar: ${p.editable.map((i) => p.labels[i]).join(', ')}.`, ` Adjustable: ${p.editable.map((i) => p.labels[i]).join(', ')}.`) : '';
    return t(locale, `Säulendiagramm${p.title ? ` »${p.title}«` : ''}. ${list}.${extra ? ` ${extra}.` : ''}${edit}`, `Bar chart${p.title ? ` "${p.title}"` : ''}. ${list}.${extra ? ` ${extra}.` : ''}${edit}`);
  },
  validateState(s, p) {
    return s.values.length === p.values.length && s.values.every((v) => v >= p.min - 1e-9 && v <= p.max + 1e-9) ? [] : ['value out of range'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    if (p.labels.length !== p.values.length) issues.push({ level: 'error', code: 'chart.length', message: 'labels und values müssen gleich lang sein.' });
    if (p.values.some((v) => v < p.min || v > p.max)) issues.push({ level: 'error', code: 'chart.range', message: 'Ein Wert liegt außerhalb von min/max.' });
    if (p.editable.some((i) => i < 0 || i >= p.values.length)) issues.push({ level: 'error', code: 'chart.editable', message: 'editable verweist auf unbekannte Säule.' });
    if (p.labels.some((l) => l.length > 10)) issues.push({ level: 'warning', code: 'visual.labels', message: t(locale, 'Lange Beschriftungen überlappen auf dem Handy.', 'Long labels overlap on phones.') });
    if ((p.max - p.min) / p.step > 40) issues.push({ level: 'warning', code: 'visual.dense', message: 'Zu feine Schritte zum Ziehen.' });
    return issues;
  },
};
