/** Animated lab scenes for the `sim` widget. Physics lives in the engine; this file only draws. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { evalMath, formatNumber, logisticSeries, NEURON_POINTS, parseMath, predatorSeries, sirSeries, simCompute, simControls, simOutputs, simWidget, type SimParams, type SimState } from '@lumen/engine';
import { tr, type WidgetViewProps } from './types.ts';

const W = 320;
const H = 180;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Seconds since mount, driven by requestAnimationFrame (frozen with reduced motion). */
function useClock(): number {
  const [t, setT] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.documentElement.dataset.motion === 'reduce') return;
    let id = 0;
    const loop = (now: number) => {
      start.current ??= now;
      setT((now - start.current) / 1000);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return t;
}

type SceneProps = { v: Record<string, number>; o: Record<string, number>; p: SimParams; t: number; locale: string };

function plot(f: (x: number) => number, x0: number, x1: number, sx: (x: number) => number, sy: (y: number) => number, n = 80): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    d += `${d ? 'L' : 'M'}${sx(x).toFixed(1)} ${clamp(sy(y), -40, H + 40).toFixed(1)}`;
  }
  return d;
}

function Projectile({ v, o, p, t }: SceneProps) {
  const target = p.target?.range;
  const span = Math.max(o.range, target ?? 0, 30) * 1.15;
  const k = (W - 40) / span;
  const sx = (x: number) => 20 + x * k;
  const sy = (y: number) => 158 - y * k;
  const vx = v.speed * Math.cos(rad(v.angle));
  const vy = v.speed * Math.sin(rad(v.angle));
  const at = (s: number) => ({ x: vx * s, y: vy * s - 0.5 * v.g * s * s });
  const flight = Math.max(0.01, o.time);
  const s = (t * 1.4) % (flight + 0.6);
  const ball = at(Math.min(s, flight));
  let d = '';
  for (let i = 0; i <= 40; i++) {
    const q = at((flight * i) / 40);
    d += `${i ? 'L' : 'M'}${sx(q.x).toFixed(1)} ${sy(q.y).toFixed(1)}`;
  }
  const hit = target !== undefined && Math.abs(o.range - target) <= Math.max(1, target * 0.05);
  return (
    <>
      <line x1="0" y1="158" x2={W} y2="158" stroke="var(--line-2)" strokeWidth="2" />
      {target !== undefined && (
        <g>
          <line x1={sx(target)} y1="158" x2={sx(target)} y2="128" stroke={hit ? 'var(--ok)' : 'var(--amber)'} strokeWidth="2" />
          <path d={`M${sx(target)} 128 l16 6 l-16 6 z`} fill={hit ? 'var(--ok)' : 'var(--amber)'} />
          <text x={sx(target)} y="172" textAnchor="middle" fontSize="9" fill="var(--ink-3)">{target} m</text>
        </g>
      )}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />
      <g transform={`translate(20 158) rotate(${-v.angle})`}>
        <rect x="-4" y="-5" width="26" height="10" rx="3" fill="var(--ink-2)" />
      </g>
      <circle cx={sx(ball.x)} cy={sy(Math.max(0, ball.y))} r="6" fill="var(--accent)" />
    </>
  );
}

function Pendulum({ v, o, t }: SceneProps) {
  const len = 28 + v.length * 30;
  const theta = rad(24) * Math.cos((2 * Math.PI * t) / Math.max(0.2, o.period));
  const x = 160 + len * Math.sin(theta);
  const y = 14 + len * Math.cos(theta);
  return (
    <>
      <rect x="110" y="8" width="100" height="6" rx="3" fill="var(--ink-3)" />
      <path d={`M${160 - len * Math.sin(rad(24))} ${14 + len * Math.cos(rad(24))} A ${len} ${len} 0 0 0 ${160 + len * Math.sin(rad(24))} ${14 + len * Math.cos(rad(24))}`} fill="none" stroke="var(--line-2)" strokeDasharray="3 4" />
      <line x1="160" y1="14" x2={x} y2={y} stroke="var(--ink-2)" strokeWidth="2" />
      <circle cx={x} cy={y} r={7 + v.mass * 1.6} fill="var(--accent)" />
    </>
  );
}

function Wave({ v, t }: SceneProps) {
  const px = 50; // pixels per metre
  const f = (x: number) => 90 - v.amplitude * 12 * Math.sin(2 * Math.PI * (x / (v.wavelength * px) - v.frequency * t * 0.5));
  let d = '';
  for (let x = 0; x <= W; x += 3) d += `${x ? 'L' : 'M'}${x} ${f(x).toFixed(1)}`;
  const lam = v.wavelength * px;
  return (
    <>
      <line x1="0" y1="90" x2={W} y2="90" stroke="var(--line-2)" strokeDasharray="3 4" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy={f(60)} r="6" fill="var(--amber)" />
      <g stroke="var(--ink-3)" strokeWidth="1.5">
        <line x1="10" y1="164" x2={10 + Math.min(lam, 300)} y2="164" />
        <line x1="10" y1="159" x2="10" y2="169" />
        <line x1={10 + Math.min(lam, 300)} y1="159" x2={10 + Math.min(lam, 300)} y2="169" />
      </g>
      <text x={10 + Math.min(lam, 300) / 2} y="158" textAnchor="middle" fontSize="10" fill="var(--ink-3)">λ</text>
    </>
  );
}

function Circuit({ v, o, t }: SceneProps) {
  const loop = [[50, 40], [270, 40], [270, 140], [50, 140]];
  const per = 2 * (220 + 100);
  const pos = (s: number) => {
    let q = ((s % per) + per) % per;
    for (let i = 0; i < 4; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (q <= len) return [a[0] + ((b[0] - a[0]) * q) / len, a[1] + ((b[1] - a[1]) * q) / len];
      q -= len;
    }
    return loop[0];
  };
  const glow = clamp(o.power / 40, 0.05, 1);
  return (
    <>
      <rect x="50" y="40" width="220" height="100" rx="8" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" />
      <rect x="36" y="74" width="28" height="32" fill="var(--bg)" />
      <line x1="38" y1="82" x2="62" y2="82" stroke="var(--ink)" strokeWidth="3" />
      <line x1="44" y1="92" x2="56" y2="92" stroke="var(--ink)" strokeWidth="3" />
      <text x="22" y="92" fontSize="10" textAnchor="middle" fill="var(--ink-3)">{v.voltage} V</text>
      <rect x="128" y="30" width="64" height="20" fill="var(--bg)" />
      <path d="M128 40 l6 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l8 -8" fill="none" stroke="var(--amber-deep)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="160" y="24" fontSize="10" textAnchor="middle" fill="var(--ink-3)">{v.resistance} Ω</text>
      <circle cx="270" cy="90" r={16 + glow * 14} fill="var(--amber)" opacity={glow * 0.35} />
      <circle cx="270" cy="90" r="14" fill="var(--bg)" stroke="var(--ink-3)" strokeWidth="2.5" />
      <circle cx="270" cy="90" r="9" fill="var(--amber)" opacity={0.25 + glow * 0.75} />
      {Array.from({ length: 12 }, (_x, i) => {
        const [x, y] = pos((i * per) / 12 + t * o.current * 60);
        return <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />;
      })}
    </>
  );
}

function Gas({ v, o, t }: SceneProps) {
  const w = 40 + v.volume * 24;
  const speed = Math.sqrt(v.temperature) * 3.2;
  const tri = (q: number, span: number) => {
    const m = ((q % (2 * span)) + 2 * span) % (2 * span);
    return m > span ? 2 * span - m : m;
  };
  const hot = clamp((v.temperature - 100) / 500, 0, 1);
  return (
    <>
      <rect x="20" y="30" width={w} height="120" rx="6" fill="color-mix(in srgb, var(--accent) 6%, transparent)" stroke="var(--ink-3)" strokeWidth="2" />
      <rect x={20 + w} y="26" width="10" height="128" rx="3" fill="var(--ink-2)" />
      <rect x={30 + w} y="84" width={W - 40 - w} height="12" fill="var(--ink-3)" opacity="0.5" />
      {Array.from({ length: 22 }, (_x, i) => {
        const x = 26 + tri(i * 37.3 + t * speed * (0.6 + ((i * 7) % 5) / 5), w - 12);
        const y = 36 + tri(i * 53.9 + t * speed * (0.5 + ((i * 3) % 7) / 7), 108);
        return <circle key={i} cx={x} cy={y} r="4" fill={`color-mix(in srgb, var(--bad) ${Math.round(hot * 100)}%, var(--accent))`} />;
      })}
      <text x={20 + w / 2} y="168" textAnchor="middle" fontSize="10" fill="var(--ink-3)">{formatNumber(o.pressure, 'en')} kPa</text>
    </>
  );
}

function Lever({ v, o }: SceneProps) {
  const tilt = (o.tilt ?? 0) * 11;
  const box = (m: number) => 12 + m * 2.2;
  return (
    <>
      <path d="M160 108 l-16 40 h32 z" fill="var(--ink-3)" />
      <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '160px 108px', transition: 'transform 0.5s cubic-bezier(0.34,1.3,0.64,1)' }}>
        <rect x="14" y="104" width="292" height="8" rx="4" fill="var(--ink-2)" />
        {[1, 2, 3, 4].flatMap((k) => [160 - k * 35, 160 + k * 35]).map((x) => <line key={x} x1={x} y1="104" x2={x} y2="112" stroke="var(--bg)" strokeWidth="1.5" />)}
        <rect x={160 - v.d1 * 35 - box(v.m1) / 2} y={104 - box(v.m1)} width={box(v.m1)} height={box(v.m1)} rx="4" fill="var(--accent)" />
        <text x={160 - v.d1 * 35} y={98 - box(v.m1)} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-2)">{v.m1} kg</text>
        <rect x={160 + v.d2 * 35 - box(v.m2) / 2} y={104 - box(v.m2)} width={box(v.m2)} height={box(v.m2)} rx="4" fill="var(--amber)" />
        <text x={160 + v.d2 * 35} y={98 - box(v.m2)} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-2)">{v.m2} kg</text>
      </g>
    </>
  );
}

function fnOf(p: SimParams, fallback: string) {
  const node = parseMath(p.expr ?? fallback, ['x']);
  return (x: number) => evalMath(node, { x });
}

function axes(sx: (x: number) => number, sy: (y: number) => number): ReactNode {
  return (
    <g stroke="var(--axis)" strokeWidth="1">
      <line x1="0" y1={sy(0)} x2={W} y2={sy(0)} />
      <line x1={sx(0)} y1="0" x2={sx(0)} y2={H} />
    </g>
  );
}

function Tangent({ v, o, p }: SceneProps) {
  const f = fnOf(p, 'x^2');
  const x0 = -3.2;
  const x1 = 4.2;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i <= 40; i++) {
    const y = f(x0 + ((x1 - x0) * i) / 40);
    if (Number.isFinite(y)) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  hi = Math.min(hi, 12);
  lo = Math.max(lo, -12);
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const sy = (y: number) => H - 12 - ((y - lo) / (hi - lo)) * (H - 24);
  const P = { x: v.x, y: f(v.x) };
  const Q = { x: v.x + v.h, y: f(v.x + v.h) };
  const line = (m: number) => `M${sx(x0)} ${sy(P.y + m * (x0 - P.x))} L${sx(x1)} ${sy(P.y + m * (x1 - P.x))}`;
  return (
    <>
      {axes(sx, sy)}
      <path d={plot(f, x0, x1, sx, sy)} fill="none" stroke="var(--ink-2)" strokeWidth="2.5" />
      <path d={line(o.slope)} stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 5" />
      <path d={line(o.secant)} stroke="var(--amber)" strokeWidth="2.5" />
      <circle cx={sx(Q.x)} cy={sy(Q.y)} r="5" fill="var(--amber)" />
      <circle cx={sx(P.x)} cy={sy(P.y)} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </>
  );
}

function Riemann({ v, p }: SceneProps) {
  const f = fnOf(p, 'x^2');
  const [a, b] = p.interval ?? [0, 2];
  const pad = (b - a) * 0.15;
  let hi = 0.5;
  for (let i = 0; i <= 40; i++) hi = Math.max(hi, f(a + ((b - a) * i) / 40));
  const sx = (x: number) => ((x - (a - pad)) / (b - a + 2 * pad)) * W;
  const sy = (y: number) => H - 16 - (y / hi) * (H - 30);
  const w = (b - a) / v.n;
  return (
    <>
      {Array.from({ length: v.n }, (_x, i) => {
        const x = a + i * w;
        const y = f(x);
        return <rect key={i} x={sx(x)} y={Math.min(sy(y), sy(0))} width={Math.max(0.5, sx(x + w) - sx(x) - (v.n > 25 ? 0 : 1))} height={Math.abs(sy(0) - sy(y))} fill="color-mix(in srgb, var(--accent) 35%, transparent)" stroke="var(--accent)" strokeWidth={v.n > 25 ? 0.3 : 1} />;
      })}
      <line x1="0" y1={sy(0)} x2={W} y2={sy(0)} stroke="var(--axis)" />
      <path d={plot(f, a - pad, b + pad, sx, sy)} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
    </>
  );
}

function UnitCircle({ v, o }: SceneProps) {
  const cx = 110;
  const cy = 90;
  const R = 70;
  const x = cx + R * Math.cos(rad(v.angle));
  const y = cy - R * Math.sin(rad(v.angle));
  const large = v.angle > 180 ? 1 : 0;
  return (
    <>
      <line x1="20" y1={cy} x2="200" y2={cy} stroke="var(--axis)" />
      <line x1={cx} y1="8" x2={cx} y2="172" stroke="var(--axis)" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth="2" />
      {v.angle > 0 && <path d={`M${cx + 18} ${cy} A 18 18 0 ${large} 0 ${cx + 18 * Math.cos(rad(v.angle))} ${cy - 18 * Math.sin(rad(v.angle))}`} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" />}
      <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--ink-2)" strokeWidth="2" />
      <line x1={cx} y1={cy} x2={x} y2={cy} stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />
      <line x1={x} y1={cy} x2={x} y2={y} stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
      <circle cx={x} cy={y} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
      <text x="218" y="76" fontSize="13" fontWeight="700" fill="#0ea5e9">cos = {formatNumber(o.cos, 'en')}</text>
      <text x="218" y="100" fontSize="13" fontWeight="700" fill="#f97316">sin = {formatNumber(o.sin, 'en')}</text>
      <text x="218" y="124" fontSize="12" fill="var(--ink-3)">{v.angle}°</text>
    </>
  );
}

function Neuron({ v, p }: SceneProps) {
  const pts = p.points ?? NEURON_POINTS;
  const sx = (x: number) => 70 + x * 30;
  const sy = (y: number) => 172 - y * 27;
  const cls = (q: { x: number; y: number }) => v.w1 * q.x + v.w2 * q.y + v.b > 0;
  // decision line clipped to the box [0,6]²
  const ends: [number, number][] = [];
  if (Math.abs(v.w2) > 1e-9) for (const x of [0, 6]) ends.push([x, -(v.w1 * x + v.b) / v.w2]);
  else if (Math.abs(v.w1) > 1e-9) for (const y of [0, 6]) ends.push([-v.b / v.w1, y]);
  return (
    <>
      <rect x={sx(0)} y={sy(6)} width="180" height="162" rx="6" fill="var(--surface)" stroke="var(--line)" />
      <clipPath id="nbox"><rect x={sx(0)} y={sy(6)} width="180" height="162" rx="6" /></clipPath>
      <g clipPath="url(#nbox)">
        {Array.from({ length: 12 * 12 }, (_x, i) => {
          const gx = (i % 12) * 0.5 + 0.25;
          const gy = Math.floor(i / 12) * 0.5 + 0.25;
          return cls({ x: gx, y: gy }) ? <rect key={i} x={sx(gx - 0.25)} y={sy(gy + 0.25)} width="15" height="13.5" fill="color-mix(in srgb, #f97316 14%, transparent)" /> : null;
        })}
        {ends.length === 2 && <line x1={sx(ends[0][0])} y1={sy(ends[0][1])} x2={sx(ends[1][0])} y2={sy(ends[1][1])} stroke="var(--ink)" strokeWidth="2.5" />}
      </g>
      {pts.map((q, i) => {
        const ok = cls(q) === (q.label === 1);
        return (
          <g key={i}>
            {!ok && <circle cx={sx(q.x)} cy={sy(q.y)} r="10" fill="none" stroke="var(--bad)" strokeWidth="2" />}
            <circle cx={sx(q.x)} cy={sy(q.y)} r="6" fill={q.label === 1 ? '#f97316' : '#0ea5e9'} stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        );
      })}
    </>
  );
}

function Descent({ v }: SceneProps) {
  const sx = (x: number) => 160 + x * 30;
  const sy = (y: number) => 164 - y * 9;
  const xs: number[] = [4];
  for (let k = 0; k < v.steps; k++) xs.push(xs[k] * (1 - 2 * v.rate));
  const vis = xs.map((x) => ({ x: clamp(x, -5.2, 5.2), y: clamp(x * x, 0, 18) }));
  return (
    <>
      <line x1="0" y1={sy(0)} x2={W} y2={sy(0)} stroke="var(--axis)" />
      <path d={plot((x) => x * x, -4.3, 4.3, sx, sy)} fill="none" stroke="var(--ink-2)" strokeWidth="2.5" />
      <polyline points={vis.map((q) => `${sx(q.x)},${sy(q.y)}`).join(' ')} fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="3 3" />
      {vis.map((q, i) => <circle key={i} cx={sx(q.x)} cy={sy(q.y)} r={i === vis.length - 1 ? 6.5 : 3} fill={i === vis.length - 1 ? 'var(--accent)' : 'var(--amber)'} />)}
      <circle cx={sx(0)} cy={sy(0)} r="3" fill="var(--ok)" />
    </>
  );
}

function Normal({ v, p }: SceneProps) {
  const [a, b] = p.interval ?? [85, 115];
  const x0 = 40;
  const x1 = 160;
  const pdf = (x: number) => Math.exp(-0.5 * ((x - v.mean) / v.sd) ** 2) / v.sd;
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
  // square-root height so wide, flat curves stay visible next to narrow, tall ones
  const sy = (y: number) => 160 - Math.sqrt(y / 0.5) * 140;
  return (
    <>
      <path d={`${plot(pdf, a, b, sx, sy, 50)} L${sx(b)} 160 L${sx(a)} 160 Z`} fill="color-mix(in srgb, var(--accent) 30%, transparent)" />
      <path d={plot(pdf, x0, x1, sx, sy, 120)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <line x1="0" y1="160" x2={W} y2="160" stroke="var(--axis)" />
      {[a, b].map((x) => (
        <g key={x}>
          <line x1={sx(x)} y1="20" x2={sx(x)} y2="160" stroke="var(--amber)" strokeDasharray="4 4" />
          <text x={sx(x)} y="174" textAnchor="middle" fontSize="10" fill="var(--ink-3)">{x}</text>
        </g>
      ))}
    </>
  );
}

const DECAY_ORDER = Array.from({ length: 100 }, (_x, i) => (i * 37 + 11) % 100);

function Decay({ o }: SceneProps) {
  const alive = Math.round(o.left);
  return (
    <>
      {DECAY_ORDER.map((slot, rank) => {
        const on = rank < alive;
        return <circle key={slot} cx={78 + (slot % 10) * 18.2} cy={10 + Math.floor(slot / 10) * 17.6} r="6.5" fill={on ? 'var(--accent)' : 'var(--surface-3)'} style={{ transition: 'fill 0.3s' }} />;
      })}
    </>
  );
}

function Growth({ v }: SceneProps) {
  const q = 1 + v.rate / 100;
  const max = Math.max(2, q ** 40);
  const cap = Math.min(max, Math.max(4, q ** v.years * 1.6, 1 + (v.rate / 100) * 40));
  const sx = (x: number) => 14 + (x / 40) * (W - 28);
  const sy = (y: number) => 164 - (Math.min(y, cap) / cap) * 148;
  // the exponential leaves the chart at the top instead of running flat along the ceiling
  const xEnd = q > 1 ? Math.min(40, Math.log(cap) / Math.log(q)) : 40;
  return (
    <>
      <line x1="14" y1="164" x2={W - 14} y2="164" stroke="var(--axis)" />
      <path d={plot((x) => 1 + (v.rate / 100) * x, 0, 40, sx, sy)} fill="none" stroke="var(--amber)" strokeWidth="2.5" />
      <path d={plot((x) => q ** x, 0, xEnd, sx, sy)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      {xEnd < 40 && <path d={`M${sx(xEnd) - 4},22 L${sx(xEnd)},15 L${sx(xEnd) + 4},22`} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      <line x1={sx(v.years)} y1="16" x2={sx(v.years)} y2="164" stroke="var(--line-2)" strokeDasharray="3 4" />
      <circle cx={sx(v.years)} cy={sy(1 + (v.rate / 100) * v.years)} r="5" fill="var(--amber)" />
      <circle cx={sx(v.years)} cy={sy(q ** v.years)} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </>
  );
}

function Lens({ v, o }: SceneProps) {
  const k = 2.4;
  const ox = 160 - v.object * k;
  const real = o.image > 0 && o.image < 900;
  const ix = clamp(160 + o.image * k, -40, W + 40);
  const oh = 34;
  const ih = clamp(oh * o.magnification, 4, 80);
  return (
    <>
      <line x1="0" y1="90" x2={W} y2="90" stroke="var(--axis)" />
      <ellipse cx="160" cy="90" rx="7" ry="62" fill="color-mix(in srgb, var(--accent) 18%, transparent)" stroke="var(--accent)" strokeWidth="1.5" />
      {[-1, 1].map((s) => <circle key={s} cx={160 + s * v.focal * k} cy="90" r="3" fill="var(--amber)" />)}
      <line x1={ox} y1="90" x2={ox} y2={90 - oh} stroke="var(--ink)" strokeWidth="3" />
      <path d={`M${ox - 5} ${96 - oh} L${ox} ${88 - oh} L${ox + 5} ${96 - oh}`} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
      {real && (
        <>
          <path d={`M${ox} ${90 - oh} L160 ${90 - oh} L${ix} ${90 + ih}`} fill="none" stroke="var(--amber)" strokeWidth="1.5" />
          <path d={`M${ox} ${90 - oh} L${ix} ${90 + ih}`} fill="none" stroke="var(--amber)" strokeWidth="1.5" opacity="0.6" />
          <line x1={ix} y1="90" x2={ix} y2={90 + ih} stroke="var(--accent)" strokeWidth="3" />
          <path d={`M${ix - 5} ${84 + ih} L${ix} ${92 + ih} L${ix + 5} ${84 + ih}`} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        </>
      )}
    </>
  );
}

function Orbit({ v, o, t }: SceneProps) {
  const k = Math.min(24, Math.max(8, 62 / v.radius)); // pixels per Earth radius: near orbits are drawn larger
  const cx = 160;
  const cy = 90;
  const q = (v.speed / Math.max(0.01, o.circular)) ** 2;
  const e = Math.abs(q - 1);
  const escaping = o.kind === 1;
  const a = escaping ? 0 : v.radius / (2 - q);
  const b = a * Math.sqrt(Math.max(0, 1 - e * e));
  // launch point is on the right; the focus (Earth) sits at ±a·e from the ellipse centre
  const ex = q >= 1 ? cx + v.radius * k - a * k : cx + v.radius * k - a * k;
  const falling = o.kind === -1;
  // a falling satellite flies its arc from the launch point down to the surface, then starts again
  let hit = Math.PI;
  if (falling) {
    for (let s = 1; s <= 180; s++) {
      const A = (s / 180) * Math.PI;
      if (Math.hypot(ex + a * k * Math.cos(A) - cx, b * k * Math.sin(A)) <= k + 1) {
        hit = A;
        break;
      }
    }
  }
  const turn = t * (0.9 / Math.max(0.6, a / 2));
  const lap = falling ? turn % (hit + 0.7) : turn;
  const ang = falling ? Math.min(lap, hit) : lap;
  const sat = escaping ? { x: cx + v.radius * k + 8 * ((t * 3) % 14), y: cy - 12 * ((t * 3) % 14) } : { x: ex + a * k * Math.cos(ang), y: cy - b * k * Math.sin(ang) };
  const crashed = falling && lap >= hit;
  return (
    <>
      <circle cx={cx} cy={cy} r={v.radius * k} fill="none" stroke="var(--line)" />
      {!escaping && <ellipse cx={ex} cy={cy} rx={a * k} ry={b * k} fill="none" stroke="var(--line-2)" strokeDasharray="4 4" />}
      {escaping && <line x1={cx + v.radius * k} y1={cy} x2={cx + v.radius * k + 110} y2={cy - 165} stroke="var(--line-2)" strokeDasharray="4 4" />}
      <circle cx={cx} cy={cy} r={k} fill="#0ea5e9" />
      <circle cx={cx} cy={cy} r={k + 2} fill="none" stroke="color-mix(in srgb, #0ea5e9 40%, transparent)" strokeWidth="2" />
      <circle cx={cx + v.radius * k} cy={cy} r="2.5" fill="var(--ink-3)" />
      {crashed && <circle cx={sat.x} cy={sat.y} r={5 + (lap - hit) * 14} fill="none" stroke="var(--bad)" strokeWidth="2" opacity={Math.max(0, 1 - (lap - hit) / 0.7)} />}
      <circle cx={sat.x} cy={sat.y} r="5" fill={falling ? 'var(--bad)' : 'var(--accent)'} />
    </>
  );
}

/** A plain chart frame: x axis at the bottom, y axis on the left. */
function Axes({ x0 = 24, y0 = 160 }: { x0?: number; y0?: number }) {
  return (
    <>
      <line x1={x0} y1={y0} x2={W - 10} y2={y0} stroke="var(--axis)" />
      <line x1={x0} y1="14" x2={x0} y2={y0} stroke="var(--axis)" />
    </>
  );
}
const Label = ({ x, y, children, color = 'var(--ink-3)', anchor = 'start' }: { x: number | string; y: number | string; children: ReactNode; color?: string; anchor?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} fontSize="10" textAnchor={anchor} fill={color}>{children}</text>
);

function Arrhenius({ v, o }: SceneProps) {
  // top: energy profile (reactants → transition state → products); bottom: energy distribution of the molecules
  const sx = (x: number) => 24 + x * (W - 40);
  // reactants at y = 92, products 14 px lower in energy (exothermic); the hump rises with Eₐ
  const smooth = (x: number) => 1 / (1 + Math.exp(-(x - 0.5) * 18));
  const hump = (ea: number) => (x: number) => 92 + 14 * smooth(x) - (ea / 150) * 76 * Math.exp(-(((x - 0.5) / 0.12) ** 2));
  // illustrative distribution: exaggerated thermal energy so the tail beyond Eₐ is visible
  const kT = 10 + (v.temperature / 200) * 25;
  const f = (e: number) => (Math.sqrt(e) * Math.exp(-e / kT)) / Math.sqrt(kT ** 3);
  const ex = (e: number) => 24 + (e / 150) * (W - 40);
  // square-root height (peak of the coldest curve = 1) so the thin tail beyond Eₐ stays visible
  const ey = (y: number) => 168 - Math.sqrt(Math.max(0, y) / (0.429 / 10)) * 52;
  return (
    <>
      {v.catalyst > 0 && <path d={plot(hump(v.ea), 0, 1, sx, (y) => y, 100)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />}
      <path d={plot(hump(o.eaeff), 0, 1, sx, (y) => y, 100)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <Label x={sx(0.02)} y="86">A + B</Label>
      <Label x={sx(0.98)} y="100" anchor="end">C</Label>
      <line x1="24" y1="168" x2={W - 10} y2="168" stroke="var(--axis)" />
      <path d={`${plot(f, Math.min(150, o.eaeff), 150, ex, ey, 60)} L${ex(150)} 168 L${ex(Math.min(150, o.eaeff))} 168 Z`} fill="color-mix(in srgb, var(--bad) 35%, transparent)" />
      <path d={plot(f, 0.01, 150, ex, ey, 150)} fill="none" stroke="var(--amber-deep)" strokeWidth="2" />
      <line x1={ex(o.eaeff)} y1="112" x2={ex(o.eaeff)} y2="168" stroke="var(--bad)" strokeDasharray="4 3" />
      <Label x={ex(o.eaeff) + 3} y="122" color="var(--bad)">Eₐ</Label>
    </>
  );
}

function Population({ v, o }: SceneProps) {
  const series = logisticSeries(v.rate, v.capacity, v.start, 40);
  const top = 1100;
  const sx = (g: number) => 24 + (g / 40) * (W - 40);
  const sy = (n: number) => 160 - (Math.min(n, top) / top) * 144;
  const unl = (g: number) => v.start * (1 + v.rate / 100) ** g;
  const d = series.map((n, g) => `${g ? 'L' : 'M'}${sx(g).toFixed(1)} ${sy(n).toFixed(1)}`).join(' ');
  const gEnd = v.rate > 0 ? Math.min(40, Math.log(top / v.start) / Math.log(1 + v.rate / 100)) : 40;
  return (
    <>
      <Axes />
      <line x1="24" y1={sy(v.capacity)} x2={W - 10} y2={sy(v.capacity)} stroke="var(--amber)" strokeDasharray="5 4" />
      <Label x={W - 12} y={sy(v.capacity) - 4} anchor="end" color="var(--amber-deep)">K = {v.capacity}</Label>
      <path d={plot(unl, 0, gEnd, sx, sy)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <line x1={sx(v.gens)} y1="14" x2={sx(v.gens)} y2="160" stroke="var(--line-2)" strokeDasharray="3 4" />
      <circle cx={sx(v.gens)} cy={sy(o.size)} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </>
  );
}

function Epidemic({ v }: SceneProps) {
  const series = sirSeries(v.r0, v.vaccinated, v.recovery);
  const sx = (d: number) => 24 + (d / 365) * (W - 40);
  const sy = (q: number) => 160 - q * 144;
  const line = (k: 's' | 'i' | 'r', base = 0) => series.filter((_x, d) => d % 3 === 0).map((x, i) => `${i ? 'L' : 'M'}${sx(i * 3).toFixed(1)} ${sy(x[k] + base).toFixed(1)}`).join(' ');
  const vacc = v.vaccinated / 100;
  return (
    <>
      <Axes />
      {vacc > 0 && <rect x="24" y={sy(1)} width={W - 34} height={vacc * 144} fill="color-mix(in srgb, var(--ok) 14%, transparent)" />}
      {vacc > 0 && <Label x={W - 14} y={sy(1) + 12} anchor="end" color="var(--ok)">{v.vaccinated} %</Label>}
      <path d={line('s')} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d={line('r')} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="4 3" />
      <path d={`${line('i')} L${sx(363)} 160 L24 160 Z`} fill="color-mix(in srgb, var(--bad) 30%, transparent)" stroke="var(--bad)" strokeWidth="2.5" />
      <Label x="30" y="174" color="var(--accent)">S</Label>
      <Label x="44" y="174" color="var(--bad)">I</Label>
      <Label x="56" y="174">R</Label>
    </>
  );
}

function Hardy({ v, o }: SceneProps) {
  const size = 140;
  const x0 = 40;
  const y0 = 22;
  const a = v.p * size;
  return (
    <>
      <rect x={x0} y={y0} width={a} height={a} fill="var(--accent)" opacity="0.85" />
      <rect x={x0 + a} y={y0} width={size - a} height={a} fill="var(--amber)" opacity="0.7" />
      <rect x={x0} y={y0 + a} width={a} height={size - a} fill="var(--amber)" opacity="0.7" />
      <rect x={x0 + a} y={y0 + a} width={size - a} height={size - a} fill="var(--ink-3)" opacity="0.55" />
      <rect x={x0} y={y0} width={size} height={size} fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
      <Label x={x0 + a / 2} y={y0 - 6} anchor="middle">A</Label>
      <Label x={x0 + a + (size - a) / 2} y={y0 - 6} anchor="middle">a</Label>
      <Label x={x0 - 10} y={y0 + a / 2 + 3} anchor="middle">A</Label>
      <Label x={x0 - 10} y={y0 + a + (size - a) / 2 + 3} anchor="middle">a</Label>
      {[['AA', o.AA, 'var(--accent)'], ['Aa', o.Aa, 'var(--amber)'], ['aa', o.aa, 'var(--ink-3)']].map(([k, val, c], i) => (
        <g key={String(k)}>
          <rect x="226" y={34 + i * 40} width={Math.max(2, Number(val))} height="18" rx="3" fill={String(c)} opacity="0.85" />
          <Label x="218" y={47 + i * 40} anchor="end">{String(k)}</Label>
        </g>
      ))}
    </>
  );
}

function Enzyme({ v, o }: SceneProps) {
  const sx = (s: number) => 24 + (s / 50) * (W - 40);
  const sy = (rate: number) => 160 - (rate / 100) * 140;
  const km = v.km * v.inhibitor;
  return (
    <>
      <Axes />
      <line x1="24" y1={sy(v.vmax)} x2={W - 10} y2={sy(v.vmax)} stroke="var(--amber)" strokeDasharray="5 4" />
      <line x1="24" y1={sy(v.vmax / 2)} x2={sx(Math.min(50, km))} y2={sy(v.vmax / 2)} stroke="var(--line-2)" strokeDasharray="3 3" />
      <line x1={sx(Math.min(50, km))} y1={sy(v.vmax / 2)} x2={sx(Math.min(50, km))} y2="160" stroke="var(--line-2)" strokeDasharray="3 3" />
      <Label x={sx(Math.min(50, km))} y="174" anchor="middle">Kₘ</Label>
      {v.inhibitor > 1 && <path d={plot((s) => (v.vmax * s) / (v.km + s), 0, 50, sx, sy)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 3" />}
      <path d={plot((s) => (v.vmax * s) / (km + s), 0, 50, sx, sy)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={sx(v.substrate)} cy={sy(o.rate)} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </>
  );
}

function Predator({ v }: SceneProps) {
  const s = predatorSeries(v.birth, v.hunt);
  const top = Math.max(60, ...s.map((x) => Math.max(x[0], x[1]))) * 1.05;
  const sx = (k: number) => 24 + (k / (s.length - 1)) * (W - 40);
  const sy = (n: number) => 160 - (n / top) * 144;
  const path = (i: 0 | 1) => s.filter((_x, k) => k % 5 === 0).map((x, k) => `${k ? 'L' : 'M'}${sx(k * 5).toFixed(1)} ${sy(x[i]).toFixed(1)}`).join(' ');
  return (
    <>
      <Axes />
      <path d={path(0)} fill="none" stroke="var(--ok)" strokeWidth="2.5" />
      <path d={path(1)} fill="none" stroke="var(--bad)" strokeWidth="2.5" />
      <Label x="30" y="174" color="var(--ok)">●</Label>
      <Label x="44" y="174" color="var(--bad)">●</Label>
    </>
  );
}

function Rc({ v, o }: SceneProps) {
  const span = Math.max(2000, o.tau * 5);
  const sx = (t: number) => 24 + (t / span) * (W - 40);
  const sy = (u: number) => 160 - (u / v.voltage) * 136;
  return (
    <>
      <Axes />
      <line x1="24" y1={sy(v.voltage)} x2={W - 10} y2={sy(v.voltage)} stroke="var(--amber)" strokeDasharray="5 4" />
      <Label x={W - 12} y={sy(v.voltage) - 4} anchor="end" color="var(--amber-deep)">{v.voltage} V</Label>
      <path d={plot((t) => v.voltage * (1 - Math.exp(-t / o.tau)), 0, span, sx, sy, 120)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {o.tau <= span && <line x1={sx(o.tau)} y1={sy(v.voltage * 0.632)} x2={sx(o.tau)} y2="160" stroke="var(--line-2)" strokeDasharray="3 3" />}
      {o.tau <= span && <Label x={sx(o.tau)} y="174" anchor="middle">τ</Label>}
      <line x1={sx(v.time)} y1="14" x2={sx(v.time)} y2="160" stroke="var(--line-2)" strokeDasharray="3 4" />
      <circle cx={sx(v.time)} cy={sy(o.uc)} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </>
  );
}

function Resistor({ x, y, vertical = false, label }: { x: number; y: number; vertical?: boolean; label: string }) {
  return (
    <g transform={`translate(${x} ${y})${vertical ? ' rotate(90)' : ''}`}>
      <rect x="-20" y="-8" width="40" height="16" rx="3" fill="var(--bg)" stroke="var(--amber-deep)" strokeWidth="2.5" />
      <text x="0" y={vertical ? -14 : -12} fontSize="10" textAnchor="middle" fill="var(--ink-3)" transform={vertical ? 'rotate(-90 0 -14) translate(20 14)' : undefined}>{label}</text>
    </g>
  );
}

function Divider({ v, o }: SceneProps) {
  const level = clamp(o.out / Math.max(1, v.voltage), 0, 1);
  return (
    <>
      <path d="M60 20 H150 V160 H60" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" />
      <line x1="44" y1="84" x2="76" y2="84" stroke="var(--ink)" strokeWidth="3" />
      <line x1="50" y1="94" x2="70" y2="94" stroke="var(--ink)" strokeWidth="3" />
      <line x1="60" y1="20" x2="60" y2="84" stroke="var(--ink-3)" strokeWidth="2.5" />
      <line x1="60" y1="94" x2="60" y2="160" stroke="var(--ink-3)" strokeWidth="2.5" />
      <Label x="30" y="92" anchor="end">{v.voltage} V</Label>
      <Resistor x={150} y={55} vertical label={`R₁ ${v.r1} kΩ`} />
      <Resistor x={150} y={125} vertical label={`R₂ ${v.r2} kΩ`} />
      <line x1="150" y1="90" x2="230" y2="90" stroke="var(--ink-3)" strokeWidth="2.5" />
      <circle cx="230" cy="90" r="4" fill="var(--accent)" />
      <rect x="250" y={160 - level * 130} width="30" height={level * 130} rx="4" fill="var(--accent)" opacity="0.8" />
      <rect x="250" y="30" width="30" height="130" rx="4" fill="none" stroke="var(--line-2)" />
      <Label x="265" y="174" anchor="middle" color="var(--accent)">{formatNumber(o.out, 'en')} V</Label>
    </>
  );
}

function Lowpass({ v, o, t }: SceneProps) {
  // log frequency axis from 10 Hz to 100 kHz
  const sx = (f: number) => 24 + ((Math.log10(f) - 1) / 4) * (W - 40);
  const sy = (g: number) => 90 - g * 72;
  const gain = (f: number) => 1 / Math.sqrt(1 + (f / o.cutoff) ** 2);
  let d = '';
  for (let i = 0; i <= 100; i++) {
    const f = 10 ** (1 + (4 * i) / 100);
    d += `${i ? 'L' : 'M'}${sx(f).toFixed(1)} ${sy(gain(f)).toFixed(1)}`;
  }
  const g = gain(v.frequency);
  const wave = (amp: number) => plot((x) => 150 - amp * 14 * Math.sin(x * 0.25 - t * 6), 24, W - 10, (x) => x, (y) => y, 120);
  return (
    <>
      <line x1="24" y1="90" x2={W - 10} y2="90" stroke="var(--axis)" />
      <line x1="24" y1="14" x2="24" y2="90" stroke="var(--axis)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <line x1={sx(o.cutoff)} y1="14" x2={sx(o.cutoff)} y2="90" stroke="var(--amber)" strokeDasharray="4 3" />
      <Label x={sx(o.cutoff) + 3} y="24" color="var(--amber-deep)">f_g</Label>
      <circle cx={sx(v.frequency)} cy={sy(g)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
      <path d={wave(1)} fill="none" stroke="var(--line-2)" strokeWidth="1.5" />
      <path d={wave(g)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
    </>
  );
}

function Resonance({ v, o, t }: SceneProps) {
  // energy sloshes between the capacitor (electric field) and the coil (magnetic field)
  const phase = Math.sin(t * Math.min(12, 2 + o.f0 / 200));
  const e = phase * phase;
  return (
    <>
      <path d="M60 84 V48 Q60 40 68 40 H252 Q260 40 260 48 V64 M260 116 V132 Q260 140 252 140 H68 Q60 140 60 132 V96" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" />
      <line x1="46" y1="84" x2="74" y2="84" stroke="var(--ink)" strokeWidth="3" />
      <line x1="46" y1="96" x2="74" y2="96" stroke="var(--ink)" strokeWidth="3" />
      <rect x="44" y="84" width="32" height="12" fill="var(--accent)" opacity={e * 0.6} />
      <Label x="30" y="94" anchor="end">C</Label>
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M260 ${64 + i * 13} a8 6.5 0 1 1 0 13`} fill="none" stroke="var(--ink)" strokeWidth="2.5" />)}
      <circle cx="260" cy="90" r="30" fill="var(--amber)" opacity={(1 - e) * 0.3} />
      <Label x="292" y="94">L</Label>
      <rect x={110} y={150} width={100 * e} height="10" rx="3" fill="var(--accent)" />
      <rect x={210 - 100 * (1 - e)} y={164} width={100 * (1 - e)} height="10" rx="3" fill="var(--amber)" />
    </>
  );
}

function Transformer({ v, o }: SceneProps) {
  const coil = (x: number, n: number) => {
    const k = clamp(Math.round(Math.sqrt(n) / 3), 2, 14);
    return Array.from({ length: k }, (_x, i) => <line key={i} x1={x - 16} y1={44 + (i * 92) / k} x2={x + 16} y2={50 + (i * 92) / k} stroke="var(--amber-deep)" strokeWidth="2.5" />);
  };
  return (
    <>
      <rect x="110" y="30" width="100" height="120" rx="6" fill="none" stroke="var(--ink-3)" strokeWidth="14" opacity="0.45" />
      {coil(110, v.n1)}
      {coil(210, v.n2)}
      <Label x="70" y="94" anchor="middle">{v.u1} V</Label>
      <Label x="110" y="170" anchor="middle">n₁ = {v.n1}</Label>
      <Label x="210" y="170" anchor="middle">n₂ = {v.n2}</Label>
      <rect x="262" y={160 - clamp(o.u2 / 400, 0, 1) * 130} width="30" height={clamp(o.u2 / 400, 0, 1) * 130} rx="4" fill="var(--accent)" opacity="0.85" />
      <rect x="262" y="30" width="30" height="130" rx="4" fill="none" stroke="var(--line-2)" />
      <Label x="277" y="24" anchor="middle" color="var(--accent)">{formatNumber(o.u2, 'en')} V</Label>
    </>
  );
}

function Sampling({ v, o }: SceneProps) {
  // one second of signal
  const sx = (s: number) => 16 + s * (W - 32);
  const sy = (y: number) => 90 - y * 60;
  const n = Math.floor(v.rate);
  return (
    <>
      <line x1="16" y1="90" x2={W - 16} y2="90" stroke="var(--axis)" />
      <path d={plot((s) => Math.sin(2 * Math.PI * v.signal * s), 0, 1, sx, sy, 400)} fill="none" stroke="var(--line-2)" strokeWidth="1.5" />
      {o.aliased ? <path d={plot((s) => Math.sin(2 * Math.PI * (v.signal - Math.round(v.signal / v.rate) * v.rate) * s), 0, 1, sx, sy, 200)} fill="none" stroke="var(--bad)" strokeWidth="2.5" strokeDasharray="5 3" /> : null}
      {Array.from({ length: n + 1 }, (_x, k) => {
        const s = k / v.rate;
        const y = Math.sin(2 * Math.PI * v.signal * s);
        return (
          <g key={k}>
            <line x1={sx(s)} y1="90" x2={sx(s)} y2={sy(y)} stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx={sx(s)} cy={sy(y)} r="3.5" fill="var(--accent)" />
          </g>
        );
      })}
    </>
  );
}

function Spring({ v, o, t }: SceneProps) {
  const x = Math.cos((2 * Math.PI * t) / Math.max(0.2, o.period)) * v.amplitude * 2.4;
  const top = 14;
  const yMass = 88 + x;
  const coils = 12;
  let d = `M160 ${top}`;
  for (let i = 1; i <= coils; i++) d += ` L${i % 2 ? 146 : 174} ${top + ((yMass - top - 10) * i) / (coils + 1)}`;
  d += ` L160 ${yMass - 10}`;
  const size = 18 + Math.sqrt(v.mass) * 10;
  return (
    <>
      <line x1="110" y1={top} x2="210" y2={top} stroke="var(--ink-2)" strokeWidth="4" />
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth={1 + v.stiffness / 40} strokeLinejoin="round" />
      <rect x={160 - size / 2} y={yMass - 10} width={size} height={size} rx="4" fill="var(--accent)" />
      <line x1="230" y1="88" x2="260" y2="88" stroke="var(--line-2)" strokeDasharray="3 3" />
    </>
  );
}

const SCENES: Record<string, (p: SceneProps) => ReactNode> = {
  projectile: Projectile, pendulum: Pendulum, wave: Wave, circuit: Circuit, gas: Gas, lever: Lever, tangent: Tangent, riemann: Riemann,
  unitcircle: UnitCircle, neuron: Neuron, descent: Descent, normal: Normal, decay: Decay, growth: Growth, lens: Lens, orbit: Orbit,
  arrhenius: Arrhenius, population: Population, epidemic: Epidemic, hardy: Hardy, enzyme: Enzyme, predator: Predator,
  rc: Rc, divider: Divider, lowpass: Lowpass, resonance: Resonance, transformer: Transformer, sampling: Sampling, spring: Spring,
};
const ANIMATED = new Set(['projectile', 'pendulum', 'wave', 'circuit', 'gas', 'orbit', 'lowpass', 'resonance', 'spring']);

function AnimatedStage({ p, v, o, locale }: { p: SimParams; v: Record<string, number>; o: Record<string, number>; locale: string }) {
  const t = useClock();
  return <>{SCENES[p.scene]?.({ v, o, p, t, locale })}</>;
}

export function SimView({ params, state, dispatch, readOnly, locale, result }: WidgetViewProps<SimParams, SimState>) {
  const controls = simControls(params).filter((c) => !c.fixed);
  const out = simCompute(params, state.values);
  const outputs = simOutputs(params);
  return (
    <div className="w-sim" data-result={result ?? undefined}>
      <svg className="sim-stage" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={simWidget.describe(state, params, locale)}>
        {ANIMATED.has(params.scene) ? <AnimatedStage p={params} v={state.values} o={out} locale={locale} /> : SCENES[params.scene]?.({ v: state.values, o: out, p: params, t: 0, locale })}
      </svg>
      {outputs.length > 0 && (
        <div className="sim-out">
          {outputs.map((o) => (
            <div key={o.id} className="sim-read">
              <span className="l">{tr(locale, o.label.de, o.label.en)}</span>
              <span className="v">{Number.isFinite(out[o.id]) && Math.abs(out[o.id]) < 9000 ? formatNumber(out[o.id], locale) : '∞'}{o.unit ? <small> {o.unit}</small> : null}</span>
            </div>
          ))}
        </div>
      )}
      {controls.map((c) => (
        <div className="slider-row" key={c.id}>
          <label htmlFor={`sim-${c.id}`}>{tr(locale, c.label.de, c.label.en)}</label>
          <input id={`sim-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={state.values[c.id]} disabled={readOnly} aria-valuetext={`${formatNumber(state.values[c.id], locale)} ${c.unit ?? ''}`} onChange={(e) => dispatch({ type: 'set', id: c.id, value: Number(e.target.value) })} />
          <output htmlFor={`sim-${c.id}`}>{formatNumber(state.values[c.id], locale)}{c.unit ? ` ${c.unit}` : ''}</output>
        </div>
      ))}
    </div>
  );
}
