import { z } from 'zod';
import { evalMath, parseMath } from '../math.ts';
import { formatNumber, exprFunction } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Point = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  draggable: z.boolean().default(true),
  label: z.string().optional(),
});

const Params = z.object({
  x: z.tuple([z.number(), z.number()]).default([-5, 5]),
  y: z.tuple([z.number(), z.number()]).default([-5, 5]),
  /** Snap step for draggable points. */
  grid: z.number().positive().default(1),
  points: z.array(Point).default([]),
  /** Draw a line through two points (by id). */
  lines: z.array(z.tuple([z.string(), z.string()])).default([]),
  segments: z.array(z.tuple([z.string(), z.string()])).default([]),
  /** Static function graphs, e.g. "2x + 1". */
  functions: z.array(z.object({ expr: z.string(), label: z.string().optional() })).default([]),
  showCoordinates: z.boolean().default(true),
});

const Answer = z.object({
  /** Exact target positions for some points. */
  points: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
});

export type GraphParams = z.infer<typeof Params>;
export type GraphAnswer = z.input<typeof Answer>;
export interface GraphState {
  points: Record<string, { x: number; y: number }>;
}
export type GraphAction = { type: 'move'; id: string; x: number; y: number };

const round = (v: number, step: number) => Math.round(Math.round(v / step) * step * 1e9) / 1e9;

export function formatPoint(x: number, y: number, locale: string): string {
  return locale.startsWith('de') ? `(${formatNumber(x, locale)} | ${formatNumber(y, locale)})` : `(${x}, ${y})`;
}

function gridValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(round(v, step));
  return out;
}

export function slopeOf(a: { x: number; y: number }, b: { x: number; y: number }): number | null {
  return a.x === b.x ? null : (b.y - a.y) / (b.x - a.x);
}

export const graphWidget: WidgetDefinition<GraphParams, GraphState, GraphAction, GraphAnswer> = {
  kind: 'graph',
  title: { de: 'Koordinatensystem', en: 'Coordinate plane' },
  params: Params,
  answer: Answer as unknown as z.ZodType<GraphAnswer>,
  interactive: true,
  init(p) {
    const points: GraphState['points'] = {};
    for (const pt of p.points) points[pt.id] = { x: pt.x, y: pt.y };
    return { points };
  },
  applyAction(s, a, p) {
    if (a.type !== 'move') return s;
    const def = p.points.find((pt) => pt.id === a.id);
    if (!def || !def.draggable) return s;
    const x = Math.min(p.x[1], Math.max(p.x[0], round(a.x, p.grid)));
    const y = Math.min(p.y[1], Math.max(p.y[0], round(a.y, p.grid)));
    return { points: { ...s.points, [a.id]: { x, y } } };
  },
  actions(_s, p) {
    const xs = gridValues(p.x[0], p.x[1], p.grid);
    const ys = gridValues(p.y[0], p.y[1], p.grid);
    const out: GraphAction[] = [];
    for (const pt of p.points.filter((q) => q.draggable)) for (const x of xs) for (const y of ys) out.push({ type: 'move', id: pt.id, x, y });
    return out;
  },
  isAnswered: () => true,
  checkAnswer(s, a) {
    return Object.entries(a.points).every(([id, q]) => s.points[id] && Math.abs(s.points[id].x - q.x) < 1e-9 && Math.abs(s.points[id].y - q.y) < 1e-9);
  },
  solve(p, a) {
    if (!a) return null;
    const s = graphWidget.init(p, { locale: 'de', seed: 0 });
    return { points: { ...s.points, ...Object.fromEntries(Object.entries(a.points).map(([k, v]) => [k, { x: v.x, y: v.y }])) } };
  },
  scope(s) {
    return {
      slope: exprFunction((a: string, b: string) => {
        const pa = s.points[a];
        const pb = s.points[b];
        return pa && pb ? slopeOf(pa, pb) : null;
      }),
      dist: exprFunction((a: string, b: string) => {
        const pa = s.points[a];
        const pb = s.points[b];
        return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : null;
      }),
    };
  },
  describe(s, p, locale) {
    const parts = p.points.map((pt) => {
      const q = s.points[pt.id];
      return `${t(locale, 'Punkt', 'Point')} ${pt.label ?? pt.id} ${t(locale, 'bei', 'at')} ${formatPoint(q.x, q.y, locale)}${pt.draggable ? '' : t(locale, ' (fest)', ' (fixed)')}`;
    });
    for (const [a, b] of p.lines) {
      const m = slopeOf(s.points[a], s.points[b]);
      parts.push(
        m === null
          ? t(locale, `Gerade durch ${a} und ${b} ist senkrecht`, `Line through ${a} and ${b} is vertical`)
          : t(locale, `Gerade durch ${a} und ${b} mit Steigung ${formatNumber(m, locale)}`, `Line through ${a} and ${b} with slope ${m}`),
      );
    }
    for (const f of p.functions) parts.push(t(locale, `Graph von y = ${f.expr}`, `Graph of y = ${f.expr}`));
    const range = t(locale, `Koordinatensystem, x von ${p.x[0]} bis ${p.x[1]}, y von ${p.y[0]} bis ${p.y[1]}`, `Coordinate plane, x from ${p.x[0]} to ${p.x[1]}, y from ${p.y[0]} to ${p.y[1]}`);
    return `${range}. ${parts.join('. ')}.`;
  },
  validateState(s, p) {
    const errs: string[] = [];
    for (const pt of p.points) {
      const q = s.points[pt.id];
      if (!q) { errs.push(`point ${pt.id} missing`); continue; }
      if (q.x < p.x[0] || q.x > p.x[1] || q.y < p.y[0] || q.y > p.y[1]) errs.push(`point ${pt.id} out of bounds`);
    }
    return errs;
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (p.x[0] >= p.x[1] || p.y[0] >= p.y[1]) issues.push({ level: 'error', code: 'graph.range', message: 'Ungültiger Achsenbereich.' });
    const ids = new Set<string>();
    const seen = new Map<string, string>();
    for (const pt of p.points) {
      if (ids.has(pt.id)) issues.push({ level: 'error', code: 'graph.duplicate-id', message: `Punkt-ID ${pt.id} doppelt.` });
      ids.add(pt.id);
      if (pt.x < p.x[0] || pt.x > p.x[1] || pt.y < p.y[0] || pt.y > p.y[1]) issues.push({ level: 'error', code: 'graph.out-of-range', message: `Punkt ${pt.id} liegt außerhalb des sichtbaren Bereichs.` });
      const key = `${pt.x}|${pt.y}`;
      if (seen.has(key)) issues.push({ level: 'warning', code: 'visual.overlap', message: t(locale, `Punkte ${seen.get(key)} und ${pt.id} liegen anfangs übereinander.`, `Points ${seen.get(key)} and ${pt.id} overlap initially.`) });
      seen.set(key, pt.id);
    }
    for (const [a, b] of [...p.lines, ...p.segments]) {
      if (!ids.has(a) || !ids.has(b)) issues.push({ level: 'error', code: 'graph.unknown-point', message: `Linie verweist auf unbekannten Punkt (${a}, ${b}).` });
    }
    for (const f of p.functions) {
      try {
        evalMath(parseMath(f.expr, ['x']), { x: 0.5 });
      } catch (e) {
        issues.push({ level: 'error', code: 'graph.bad-function', message: `Funktion »${f.expr}« nicht lesbar: ${(e as Error).message}` });
      }
    }
    const span = Math.max((p.x[1] - p.x[0]) / p.grid, (p.y[1] - p.y[0]) / p.grid);
    if (span > 40) issues.push({ level: 'warning', code: 'visual.dense-grid', message: 'Raster mit mehr als 40 Schritten ist auf dem Handy kaum treffbar.' });
    for (const [id, q] of Object.entries(a?.points ?? {})) {
      if (!ids.has(id)) issues.push({ level: 'error', code: 'graph.answer-unknown', message: `answer.points enthält unbekannten Punkt ${id}.` });
      if (Math.abs(round(q.x, p.grid) - q.x) > 1e-9 || Math.abs(round(q.y, p.grid) - q.y) > 1e-9) issues.push({ level: 'error', code: 'graph.answer-off-grid', message: `Zielpunkt ${id} liegt nicht auf dem Raster.` });
    }
    return issues;
  },
  secret: (_p, a) => Object.values(a?.points ?? {}).flatMap((q) => [formatPoint(q.x, q.y, 'de'), formatPoint(q.x, q.y, 'en')]),
};
