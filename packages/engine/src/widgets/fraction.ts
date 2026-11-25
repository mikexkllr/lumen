import { z } from 'zod';
import { gcd } from '../math.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  /** Number of equal parts (up to 24; a square grid up to 100, e.g. 10 × 10 for percent). */
  parts: z.number().int().min(1).max(100),
  /** bar · circle (pizza) · square (grid) · triangle · hexagon. Every part has the same area. */
  shape: z.enum(['bar', 'circle', 'square', 'triangle', 'hexagon']).default('bar'),
  shaded: z.array(z.number().int().min(0)).default([]),
  /** If set, the learner may re-split the whole into one of these part counts. */
  partOptions: z.array(z.number().int().min(1).max(100)).optional(),
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

const SHAPE_NAMES: Record<FractionParams['shape'], [string, string]> = {
  bar: ['Streifen', 'bar'],
  circle: ['Kreis', 'circle'],
  square: ['Quadrat', 'square'],
  triangle: ['Dreieck', 'triangle'],
  hexagon: ['Sechseck', 'hexagon'],
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
    const shape = SHAPE_NAMES[p.shape][locale.startsWith('de') ? 0 : 1];
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
    if (p.shape !== 'square' && maxParts > 24) issues.push({ level: 'error', code: 'visual.dense', message: t(locale, 'Mehr als 24 Teile gehen nur als Quadrat-Raster (shape: square).', 'More than 24 parts only work as a square grid (shape: square).') });
    if (p.shape === 'bar' && maxParts > 16) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Streifen mit mehr als 16 Teilen sind auf dem Handy zu schmal.', 'Bars with more than 16 parts are too thin on phones.') });
    const roundTriangle = (n: number) => Number.isInteger(Math.sqrt(n));
    if (p.shape === 'triangle' && [p.parts, ...(p.partOptions ?? [])].some((n) => n > 16 || (n > 12 && !roundTriangle(n)))) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Dreiecke mit so vielen Teilen werden zu schmal (höchstens 12, oder 16 als Quadratzahl).', 'Triangles with that many parts get too thin (at most 12, or 16 as a square number).') });
    if (p.shape === 'hexagon' && maxParts > 12) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Sechsecke mit mehr als 12 Teilen sind schwer lesbar.', 'Hexagons with >12 parts are hard to read.') });
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

// ---------------- Geometry of the shapes ----------------

type Pt = [number, number];

/** Area of a polygon (shoelace formula). */
export function polygonArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

/** The outline of a shape in a 0…100 box, clockwise, starting at the top. */
export function shapeOutline(shape: 'square' | 'triangle' | 'hexagon'): Pt[] {
  if (shape === 'square') return [[4, 4], [96, 4], [96, 96], [4, 96]];
  if (shape === 'triangle') {
    const h = (92 * Math.sqrt(3)) / 2;
    const top = (100 - h) / 2 + 6;
    return [[50, top], [96, top + h], [4, top + h]];
  }
  return Array.from({ length: 6 }, (_v, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [50 + 47 * Math.cos(a), 50 + 47 * Math.sin(a)] as Pt;
  });
}

/**
 * Cuts a regular polygon into n pieces of equal area: from the centre to n equally spaced points on the
 * outline. This works for every n because a regular polygon has an inscribed circle, so the area of a
 * piece is proportional to the length of outline it covers.
 */
function fan(outline: readonly Pt[], n: number): Pt[][] {
  const c: Pt = [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length];
  const len = outline.map((p, i) => Math.hypot(outline[(i + 1) % outline.length][0] - p[0], outline[(i + 1) % outline.length][1] - p[1]));
  const total = len.reduce((s, l) => s + l, 0);
  const at = (d: number): { p: Pt; edge: number } => {
    let rest = ((d % total) + total) % total;
    for (let i = 0; i < outline.length; i++) {
      if (rest <= len[i] + 1e-9) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const f = len[i] ? rest / len[i] : 0;
        return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], edge: i };
      }
      rest -= len[i];
    }
    return { p: outline[0], edge: 0 };
  };
  if (n === 1) return [[...outline]];
  return Array.from({ length: n }, (_v, k) => {
    const d0 = (total * k) / n;
    const d1 = (total * (k + 1)) / n;
    const s = at(d0);
    const e = at(d1 - 1e-7);
    const pts: Pt[] = [c, s.p];
    // corners strictly between the two cut points
    let edge = s.edge;
    let guard = 0;
    while (edge !== e.edge && guard++ < outline.length) {
      edge = (edge + 1) % outline.length;
      pts.push(outline[edge]);
    }
    pts.push(at(d1).p);
    return pts;
  });
}

/** A square as a grid of rows × columns that is as square as possible (primes become strips). */
export function gridShape(n: number): { rows: number; cols: number } {
  let rows = Math.floor(Math.sqrt(n));
  while (rows > 1 && n % rows !== 0) rows--;
  return { rows, cols: n / rows };
}

/**
 * The n pieces of a fraction shape as polygons in a 0…100 box (all of the same area). Triangles with a
 * square number of parts become a triangle grid, squares a rectangle grid, everything else a fan from the centre.
 */
export function fractionPieces(shape: 'square' | 'triangle' | 'hexagon', n: number): Pt[][] {
  const outline = shapeOutline(shape);
  if (shape === 'square') {
    const { rows, cols } = gridShape(n);
    const [x0, y0] = outline[0];
    const w = (outline[1][0] - x0) / cols;
    const h = (outline[2][1] - y0) / rows;
    return Array.from({ length: n }, (_v, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      return [[x0 + c * w, y0 + r * h], [x0 + (c + 1) * w, y0 + r * h], [x0 + (c + 1) * w, y0 + (r + 1) * h], [x0 + c * w, y0 + (r + 1) * h]];
    });
  }
  const k = Math.round(Math.sqrt(n));
  if (shape === 'triangle' && k * k === n && n > 1) {
    const [A, BR, BL] = outline;
    const P = (i: number, j: number): Pt => [A[0] + ((BL[0] - A[0]) * i) / k + ((BR[0] - BL[0]) * j) / k, A[1] + ((BL[1] - A[1]) * i) / k + ((BR[1] - BL[1]) * j) / k];
    const out: Pt[][] = [];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j <= i; j++) {
        out.push([P(i, j), P(i + 1, j + 1), P(i + 1, j)]);
        if (j < i) out.push([P(i, j), P(i, j + 1), P(i + 1, j + 1)]);
      }
    }
    return out;
  }
  return fan(outline, n);
}
