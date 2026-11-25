/** Shared SVG coordinate plane used by graph and slider widgets. */
import { useId, useRef, type ReactNode } from 'react';
import { formatNumber } from '@lumen/engine';

export interface PlaneProps {
  x: [number, number];
  y: [number, number];
  children?: (map: PlaneMap) => ReactNode;
  onPointer?: (pt: { x: number; y: number }, phase: 'down' | 'move' | 'up', target: Element | null) => void;
  label: string;
  locale: string;
}

export interface PlaneMap {
  sx(x: number): number;
  sy(y: number): number;
  W: number;
  H: number;
  x: [number, number];
  y: [number, number];
}

const W = 340;
/** Height between these multiples of the width: one unit is as long on both axes unless that would make the plane too flat or too tall. */
const MIN_RATIO = 0.55;
const MAX_RATIO = 1.35;

/** A round grid step (1, 2 or 5 times a power of ten) for roughly `lines` lines; whole units for everyday ranges. */
export function gridStep(range: number, lines = 10): number {
  if (range >= 4 && range <= 24) return 1;
  const raw = range / lines;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Grid values of one axis (multiples of the step inside the range) and every how many lines gets a label. */
function axisTicks(lo: number, hi: number): { values: number[]; labelEvery: number } {
  const step = gridStep(hi - lo);
  const values: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9 && values.length < 200; k++) values.push(Math.round(k * step * 1e9) / 1e9);
  return { values, labelEvery: Math.max(1, Math.ceil(values.length / 10)) };
}

export function Plane({ x, y, children, onPointer, label, locale }: PlaneProps) {
  const H = Math.round(W * Math.min(MAX_RATIO, Math.max(MIN_RATIO, (y[1] - y[0]) / (x[1] - x[0]))));
  const pad = 8;
  const sx = (v: number) => pad + ((v - x[0]) / (x[1] - x[0])) * (W - 2 * pad);
  const sy = (v: number) => pad + ((y[1] - v) / (y[1] - y[0])) * (H - 2 * pad);
  const ref = useRef<SVGSVGElement>(null);
  const clip = useId().replace(/:/g, '');
  const map: PlaneMap = { sx, sy, W, H, x, y };

  const toWorld = (ev: React.PointerEvent) => {
    const svg = ref.current!;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const py = ((ev.clientY - r.top) / r.height) * H;
    return { x: x[0] + ((px - pad) / (W - 2 * pad)) * (x[1] - x[0]), y: y[1] - ((py - pad) / (H - 2 * pad)) * (y[1] - y[0]) };
  };

  const tx = axisTicks(x[0], x[1]);
  const ty = axisTicks(y[0], y[1]);
  const gridX = tx.values;
  const gridY = ty.values;
  // y labels sit left of the y axis – or right of it when there is no room for the longest label
  const longest = Math.max(1, ...gridY.map((v) => formatNumber(v, locale).length));
  const yLabelsInside = sx(0) - 6 < longest * 6 + 4;
  // labels on every k-th line, counted from zero so 0, 5, 10 … rather than 1, 6, 11 …
  const labelled = (values: number[], every: number) => {
    const step = values.length > 1 ? values[1] - values[0] : 1;
    return values.filter((v) => v !== 0 && Math.round(v / step) % every === 0);
  };

  return (
    <div className="svg-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onPointerDown={onPointer ? (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); onPointer(toWorld(e), 'down', e.target as Element); } : undefined}
        onPointerMove={onPointer ? (e) => e.buttons && onPointer(toWorld(e), 'move', null) : undefined}
        onPointerUp={onPointer ? (e) => onPointer(toWorld(e), 'up', null) : undefined}
      >
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="0" width={W} height={H} rx="12" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width={W} height={H} rx="12" fill="var(--surface)" />
        {gridX.map((v) => (
          <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={sy(y[0])} y2={sy(y[1])} stroke="var(--grid)" strokeWidth={v === 0 ? 0 : 1} />
        ))}
        {gridY.map((v) => (
          <line key={`gy${v}`} y1={sy(v)} y2={sy(v)} x1={sx(x[0])} x2={sx(x[1])} stroke="var(--grid)" strokeWidth={v === 0 ? 0 : 1} />
        ))}
        {y[0] <= 0 && y[1] >= 0 && <line x1={sx(x[0])} x2={sx(x[1])} y1={sy(0)} y2={sy(0)} stroke="var(--axis)" strokeWidth="1.6" />}
        {x[0] <= 0 && x[1] >= 0 && <line y1={sy(y[0])} y2={sy(y[1])} x1={sx(0)} x2={sx(0)} stroke="var(--axis)" strokeWidth="1.6" />}
        {labelled(gridX, tx.labelEvery).map((v) => (
          <text key={`lx${v}`} x={sx(v)} y={Math.min(H - 4, Math.max(12, sy(0) + 14))} fontSize="10" textAnchor="middle" fill="var(--ink-3)" aria-hidden="true">
            {formatNumber(v, locale)}
          </text>
        ))}
        {labelled(gridY, ty.labelEvery).map((v) => (
          <text key={`ly${v}`} x={yLabelsInside ? Math.max(4, sx(0) + 5) : Math.min(W - 6, sx(0) - 6)} y={sy(v) + 3.5} fontSize="10" textAnchor={yLabelsInside ? 'start' : 'end'} fill="var(--ink-3)" aria-hidden="true">
            {formatNumber(v, locale)}
          </text>
        ))}
        <text x={sx(x[1]) - 4} y={sy(0) - 6} fontSize="11" textAnchor="end" fill="var(--ink-2)" fontStyle="italic" aria-hidden="true">x</text>
        <text x={sx(0) + 6} y={sy(y[1]) + 12} fontSize="11" fill="var(--ink-2)" fontStyle="italic" aria-hidden="true">y</text>
        <g clipPath={`url(#${clip})`}>{children?.(map)}</g>
      </svg>
    </div>
  );
}

/** Polyline points for y = f(x) clipped to the visible range. */
export function plotPath(f: (x: number) => number, map: PlaneMap): string {
  const segs: string[] = [];
  let pen = false;
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const xv = map.x[0] + ((map.x[1] - map.x[0]) * i) / n;
    const yv = f(xv);
    if (!Number.isFinite(yv) || yv < map.y[0] - 50 || yv > map.y[1] + 50) {
      pen = false;
      continue;
    }
    segs.push(`${pen ? 'L' : 'M'}${map.sx(xv).toFixed(2)},${map.sy(yv).toFixed(2)}`);
    pen = true;
  }
  return segs.join(' ');
}
