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

export function Plane({ x, y, children, onPointer, label, locale }: PlaneProps) {
  const H = Math.round((W * (y[1] - y[0])) / (x[1] - x[0]));
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

  const gridX: number[] = [];
  for (let v = Math.ceil(x[0]); v <= x[1]; v++) gridX.push(v);
  const gridY: number[] = [];
  for (let v = Math.ceil(y[0]); v <= y[1]; v++) gridY.push(v);
  const labelEvery = Math.max(1, Math.ceil((x[1] - x[0]) / 10));

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
        {gridX.filter((v) => v !== 0 && v % labelEvery === 0).map((v) => (
          <text key={`lx${v}`} x={sx(v)} y={Math.min(H - 4, Math.max(12, sy(0) + 14))} fontSize="10" textAnchor="middle" fill="var(--ink-3)" aria-hidden="true">
            {formatNumber(v, locale)}
          </text>
        ))}
        {gridY.filter((v) => v !== 0 && v % labelEvery === 0).map((v) => (
          <text key={`ly${v}`} x={Math.min(W - 6, Math.max(10, sx(0) - 6))} y={sy(v) + 3.5} fontSize="10" textAnchor="end" fill="var(--ink-3)" aria-hidden="true">
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
