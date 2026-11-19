import { z } from 'zod';
import { exprFunction } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * A grid of cells that can be switched on/off (or cycled through up to four
 * shades). Used for pixel images, symmetry, area counting, the sieve of
 * Eratosthenes and image filters.
 *
 * Patterns are strings per row: '.' off, '#' on, digits for shades,
 * 'x' marks a locked cell that keeps its initial value.
 */
const Pattern = z.array(z.string().min(1)).min(1).max(14);
const Params = z.object({
  rows: z.number().int().min(1).max(14).optional(),
  cols: z.number().int().min(1).max(14).optional(),
  /** Initial pattern (defaults to all off). */
  cells: Pattern.optional(),
  /** Cells that cannot be changed: '#' or 'x' = locked. */
  locked: Pattern.optional(),
  /** Number of shades incl. off (2 = on/off). */
  shades: z.number().int().min(2).max(4).default(2),
  /** Show numbers in the cells: 'index' = start, start+1, … row by row. */
  numbers: z.object({ start: z.number().int().default(1) }).optional(),
  /** Explicit labels per row (overrides numbers). */
  labels: z.array(z.array(z.union([z.string(), z.number()]))).optional(),
  /** Draw a mirror axis. */
  mirror: z.enum(['vertical', 'horizontal', 'both']).optional(),
  /** Show a counter of switched-on cells. */
  counter: z.boolean().default(false),
  /** Colour of the "on" state: accent (default) or a hex value. */
  color: z.string().optional(),
  /** toggle: a tap flips one cell · lightsout: a tap flips the cell and its four neighbours */
  rule: z.enum(['toggle', 'lightsout']).default('toggle'),
});

const Answer = z.object({ pattern: Pattern });

export type PixelsParams = z.infer<typeof Params>;
export type PixelsAnswer = z.input<typeof Answer>;
export interface PixelsState {
  grid: number[][];
}
export type PixelsAction = { type: 'toggle'; r: number; c: number } | { type: 'set'; r: number; c: number; v: number } | { type: 'clear' };

const charValue = (ch: string) => (ch === '#' ? 1 : /[0-9]/.test(ch) ? Number(ch) : 0);

export function pixelSize(p: PixelsParams): { rows: number; cols: number } {
  const rows = p.cells?.length ?? p.labels?.length ?? p.rows ?? 5;
  const cols = p.cells?.[0]?.length ?? p.labels?.[0]?.length ?? p.cols ?? 5;
  return { rows, cols };
}

export function parsePattern(pattern: string[], rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => charValue(pattern[r]?.[c] ?? '.')));
}

export const isLocked = (p: PixelsParams, r: number, c: number) => {
  const ch = p.locked?.[r]?.[c];
  return ch === '#' || ch === 'x';
};

export function cellLabel(p: PixelsParams, r: number, c: number): string | null {
  if (p.labels) return p.labels[r]?.[c] !== undefined ? String(p.labels[r][c]) : null;
  if (p.numbers) return String(p.numbers.start + r * pixelSize(p).cols + c);
  return null;
}

const countOn = (g: number[][]) => g.reduce((s, row) => s + row.filter((v) => v > 0).length, 0);

function symmetric(g: number[][], axis: string): boolean {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if ((axis === 'v' || axis === 'vertical' || axis === 'both') && g[r][c] !== g[r][cols - 1 - c]) return false;
      if ((axis === 'h' || axis === 'horizontal' || axis === 'both') && g[r][c] !== g[rows - 1 - r][c]) return false;
    }
  return true;
}

export const pixelsWidget: WidgetDefinition<PixelsParams, PixelsState, PixelsAction, PixelsAnswer> = {
  kind: 'pixels',
  title: { de: 'Raster', en: 'Grid' },
  params: Params,
  answer: Answer as unknown as z.ZodType<PixelsAnswer>,
  interactive: true,
  init(p) {
    const { rows, cols } = pixelSize(p);
    return { grid: parsePattern(p.cells ?? [], rows, cols) };
  },
  applyAction(s, a, p) {
    if (a.type === 'clear') {
      const init = pixelsWidget.init(p, { locale: 'de', seed: 0 });
      return { grid: s.grid.map((row, r) => row.map((v, c) => (isLocked(p, r, c) ? init.grid[r][c] : 0))) };
    }
    const { r, c } = a;
    if (r < 0 || c < 0 || r >= s.grid.length || c >= s.grid[0].length || isLocked(p, r, c)) return s;
    if (p.rule === 'lightsout') {
      if (a.type !== 'toggle') return s;
      const grid = s.grid.map((row) => [...row]);
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < grid.length && cc < grid[0].length) grid[rr][cc] = 1 - Math.min(1, grid[rr][cc]);
      }
      return { grid };
    }
    const v = a.type === 'toggle' ? (s.grid[r][c] + 1) % p.shades : Math.max(0, Math.min(p.shades - 1, a.v));
    if (v === s.grid[r][c]) return s;
    const grid = s.grid.map((row) => [...row]);
    grid[r][c] = v;
    return { grid };
  },
  actions(s, p) {
    const out: PixelsAction[] = [];
    s.grid.forEach((row, r) => row.forEach((_, c) => !isLocked(p, r, c) && out.push({ type: 'toggle', r, c })));
    return out;
  },
  isAnswered: () => true,
  checkAnswer(s, a) {
    const target = parsePattern(a.pattern, s.grid.length, s.grid[0].length);
    return s.grid.every((row, r) => row.every((v, c) => v === target[r][c]));
  },
  diagnose(s, a, _p, locale) {
    if (!a) return null;
    const target = parsePattern(a.pattern, s.grid.length, s.grid[0].length);
    let wrong = 0;
    s.grid.forEach((row, r) => row.forEach((v, c) => v !== target[r][c] && wrong++));
    return t(locale, `${wrong} ${wrong === 1 ? 'Feld stimmt' : 'Felder stimmen'} noch nicht.`, `${wrong} cell${wrong === 1 ? '' : 's'} still differ.`);
  },
  solve(p, a) {
    if (!a) return null;
    const { rows, cols } = pixelSize(p);
    const target = parsePattern(a.pattern, rows, cols);
    if (p.rule === 'lightsout') {
      const start = parsePattern(p.cells ?? [], rows, cols);
      return lightsOutSolve(start, target) ? { grid: target } : null;
    }
    return { grid: target };
  },
  scope(s, p) {
    const onLabels: (string | number)[] = [];
    s.grid.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v > 0) {
          const l = cellLabel(p, r, c);
          if (l !== null) onLabels.push(/^-?\d+$/.test(l) ? Number(l) : l);
        }
      }),
    );
    return {
      grid: s.grid,
      on: countOn(s.grid),
      onLabels,
      cell: exprFunction((r: number, c: number) => s.grid[r]?.[c] ?? 0),
      row: exprFunction((r: number) => s.grid[r] ?? []),
      col: exprFunction((c: number) => s.grid.map((row) => row[c] ?? 0)),
      symmetric: exprFunction((axis: string) => symmetric(s.grid, axis)),
      pattern: s.grid.map((row) => row.map((v) => (v === 0 ? '.' : v === 1 ? '#' : String(v))).join('')),
    };
  },
  describe(s, p, locale) {
    const { rows, cols } = pixelSize(p);
    const on: string[] = [];
    s.grid.forEach((row, r) => row.forEach((v, c) => v > 0 && on.push(cellLabel(p, r, c) ?? `${r + 1}/${c + 1}`)));
    const list = on.length > 24 ? `${on.slice(0, 24).join(', ')} …` : on.join(', ');
    return t(
      locale,
      `Raster ${rows}×${cols}, ${on.length} Felder gefärbt${on.length ? ` (Zeile/Spalte bzw. Zahl: ${list})` : ''}.${p.mirror ? ' Mit Spiegelachse.' : ''}`,
      `Grid ${rows}×${cols}, ${on.length} cells filled${on.length ? ` (row/column or number: ${list})` : ''}.${p.mirror ? ' With mirror axis.' : ''}`,
    );
  },
  validateState(s, p) {
    const { rows, cols } = pixelSize(p);
    if (s.grid.length !== rows || s.grid.some((row) => row.length !== cols)) return ['grid size'];
    return s.grid.every((row) => row.every((v) => v >= 0 && v < p.shades)) ? [] : ['shade out of range'];
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    const { rows, cols } = pixelSize(p);
    const lens = [...(p.cells ?? []), ...(p.locked ?? []), ...(a?.pattern ?? [])].map((r) => r.length);
    if (lens.some((l) => l !== cols)) issues.push({ level: 'error', code: 'pixels.shape', message: 'Alle Muster-Zeilen müssen gleich lang sein.' });
    if ((p.cells && p.cells.length !== rows) || (a?.pattern && a.pattern.length !== rows)) issues.push({ level: 'error', code: 'pixels.shape', message: 'Muster haben unterschiedlich viele Zeilen.' });
    if (cols > 10 && (p.numbers || p.labels)) issues.push({ level: 'info', code: 'visual.dense', message: t(locale, 'Viele beschriftete Spalten werden auf dem Handy klein.', 'Many labelled columns get small on phones.') });
    return issues;
  },
};

/** Is the target reachable in lights-out from start? (Gaussian elimination over GF(2)) */
export function lightsOutSolve(start: number[][], target: number[][]): number[] | null {
  const rows = start.length;
  const cols = start[0]?.length ?? 0;
  const n = rows * cols;
  const m: number[][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const row = new Array(n + 1).fill(0);
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) row[rr * cols + cc] = 1;
      }
      row[n] = (start[r][c] ? 1 : 0) ^ (target[r][c] ? 1 : 0);
      m.push(row);
    }
  // equation i: sum_j press_j * A[j][i] = rhs_i ; A is symmetric, so rows work as columns
  let rank = 0;
  const where = new Array(n).fill(-1);
  for (let col = 0; col < n && rank < n; col++) {
    let sel = -1;
    for (let i = rank; i < n; i++) if (m[i][col]) { sel = i; break; }
    if (sel < 0) continue;
    [m[sel], m[rank]] = [m[rank], m[sel]];
    where[col] = rank;
    for (let i = 0; i < n; i++) if (i !== rank && m[i][col]) for (let j = col; j <= n; j++) m[i][j] ^= m[rank][j];
    rank++;
  }
  for (let i = rank; i < n; i++) if (m[i][n]) return null;
  return where.map((w) => (w >= 0 ? m[w][n] : 0));
}
