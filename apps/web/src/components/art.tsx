/**
 * Own generative illustrations – course covers in a calm "scientific
 * illustration" style (isometric solids, precise line diagrams, grids),
 * the completion mark and a restrained particle burst. Pure SVG/canvas,
 * no image assets, works offline.
 */
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0x5145f0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Linear mix of two hex colours (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
/** Darken (#rrggbb) by factor 0..1. */
export const shade = (hex: string, f = 0.6) => mix(hex, '#000000', 1 - f);

export function topicVars(color?: string): CSSProperties {
  const c = color ?? '#5145f0';
  return {
    ['--topic' as string]: c,
    ['--topic-deep' as string]: `color-mix(in srgb, ${c} 78%, #000)`,
    ['--topic-soft' as string]: `color-mix(in srgb, ${c} 12%, var(--surface))`,
  } as CSSProperties;
}

// ---------------------------------------------------------------- drawing kit
const W = '#ffffff';
const op = (o: number) => ({ fill: W, fillOpacity: o });
const line = (o = 0.9, w = 3) => ({ stroke: W, strokeOpacity: o, strokeWidth: w, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

type P3 = [number, number, number];
const iso = ([x, y, z]: P3, cx = 200, cy = 150): [number, number] => [cx + (x - y) * 0.866, cy + (x + y) * 0.5 - z];
const pts = (ps: P3[], cx?: number, cy?: number) => ps.map((p) => iso(p, cx, cy).map((v) => v.toFixed(1)).join(',')).join(' ');

function Box({ x, y, z = 0, w, d, h, cx, cy, tones = [0.95, 0.6, 0.32] }: { x: number; y: number; z?: number; w: number; d: number; h: number; cx?: number; cy?: number; tones?: [number, number, number] }) {
  const top: P3[] = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
  const left: P3[] = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
  const right: P3[] = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
  return (
    <g>
      <polygon points={pts(left, cx, cy)} {...op(tones[1])} />
      <polygon points={pts(right, cx, cy)} {...op(tones[2])} />
      <polygon points={pts(top, cx, cy)} {...op(tones[0])} />
    </g>
  );
}

function Cylinder({ cx, cy, rx, ry, h, o = 0.9 }: { cx: number; cy: number; rx: number; ry: number; h: number; o?: number }) {
  return (
    <g>
      <path d={`M${cx - rx},${cy} v${-h} a${rx},${ry} 0 0 0 ${2 * rx},0 v${h} a${rx},${ry} 0 0 1 ${-2 * rx},0z`} {...op(o * 0.55)} />
      <ellipse cx={cx} cy={cy - h} rx={rx} ry={ry} {...op(o)} />
    </g>
  );
}

const arrowHead = (x: number, y: number, ang: number, s = 9) => {
  const a1 = ang + Math.PI * 0.82;
  const a2 = ang - Math.PI * 0.82;
  return `M${x + Math.cos(a1) * s},${y + Math.sin(a1) * s} L${x},${y} L${x + Math.cos(a2) * s},${y + Math.sin(a2) * s}`;
};

function sector(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => `${(cx + r * Math.sin(a)).toFixed(1)},${(cy - r * Math.cos(a)).toFixed(1)}`;
  return `M${cx},${cy} L${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- motifs
function Motif({ name, tint }: { name: string; tint: string }): ReactNode {
  switch (name) {
    case 'fraction':
      return (
        <g>
          <circle cx="200" cy="125" r="104" {...line(0.22, 1.5)} strokeDasharray="3 7" />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={sector(200, 125, 78, (i * Math.PI) / 2 + 0.03, ((i + 1) * Math.PI) / 2 - 0.03)} {...op(i < 3 ? 0.92 - i * 0.12 : 0.14)} transform={i === 3 ? 'translate(10,6)' : undefined} />
          ))}
          <path d={sector(200, 125, 78, (3 * Math.PI) / 2 + 0.03, 2 * Math.PI - 0.03)} {...line(0.85, 2)} strokeDasharray="5 5" transform="translate(10,6)" />
        </g>
      );
    case 'percent':
    case 'decimal': {
      const r = 66;
      const c = 2 * Math.PI * r;
      return (
        <g>
          <circle cx="200" cy="125" r={r} fill="none" stroke={W} strokeOpacity="0.16" strokeWidth="26" />
          <circle cx="200" cy="125" r={r} fill="none" stroke={W} strokeOpacity="0.92" strokeWidth="26" strokeDasharray={`${c * 0.68} ${c}`} transform="rotate(-90 200 125)" />
          <circle cx="200" cy="125" r={r} fill="none" stroke={tint} strokeWidth="26" strokeDasharray={`${c * 0.12} ${c}`} transform="rotate(155 200 125)" />
          <text x="200" y="139" textAnchor="middle" fontSize="40" fontWeight="700" fill={W} letterSpacing="-1">%</text>
        </g>
      );
    }
    case 'negative':
      return (
        <g>
          <path d="M50 160 H350" {...line(0.9, 3)} />
          <path d={arrowHead(350, 160, 0)} {...line(0.9, 3)} />
          {Array.from({ length: 11 }, (_, i) => (
            <path key={i} d={`M${66 + i * 27} ${i === 5 ? 146 : 152} V${i === 5 ? 174 : 168}`} {...line(i === 5 ? 0.95 : 0.6, i === 5 ? 3 : 2)} />
          ))}
          <path d="M255 148 C 240 80, 150 80, 120 148" {...line(0.95, 3)} />
          <path d={arrowHead(120, 148, Math.PI * 0.62)} {...line(0.95, 3)} />
          <circle cx="255" cy="160" r="9" {...op(0.95)} />
          <circle cx="120" cy="160" r="9" fill={tint} />
        </g>
      );
    case 'ratio': {
      const out: ReactNode[] = [];
      let x = 92;
      let y = 48;
      let w = 233;
      let h = 144;
      const arcs: string[] = [];
      for (let i = 0; i < 6; i++) {
        const s = Math.min(w, h);
        const dir = i % 4;
        let sx = x;
        let sy = y;
        if (dir === 0) { sx = x; sy = y; x += s; w -= s; arcs.push(`M${sx},${sy + s} A${s},${s} 0 0 1 ${sx + s},${sy}`); }
        else if (dir === 1) { sx = x; sy = y; y += s; h -= s; arcs.push(`M${sx},${sy} A${s},${s} 0 0 1 ${sx + s},${sy + s}`); }
        else if (dir === 2) { sx = x + w - s; sy = y; w -= s; arcs.push(`M${sx + s},${sy} A${s},${s} 0 0 1 ${sx},${sy + s}`); }
        else { sx = x; sy = y + h - s; h -= s; arcs.push(`M${sx + s},${sy + s} A${s},${s} 0 0 1 ${sx},${sy}`); }
        out.push(<rect key={i} x={sx} y={sy} width={s} height={s} {...op(0.08 + i * 0.1)} stroke={W} strokeOpacity="0.5" strokeWidth="1.2" />);
      }
      return (
        <g>
          {out}
          <path d={arcs.join(' ')} {...line(0.95, 3)} />
        </g>
      );
    }
    case 'terms':
      return (
        <g>
          <rect x="96" y="50" width="104" height="104" rx="6" {...op(0.92)} />
          <rect x="210" y="50" width="34" height="104" rx="6" {...op(0.55)} />
          <rect x="254" y="50" width="34" height="104" rx="6" {...op(0.55)} />
          <rect x="96" y="164" width="104" height="34" rx="6" {...op(0.4)} />
          {[0, 1, 2].map((i) => <rect key={i} x={210 + i * 0} y={164} width="34" height="34" rx="6" fill={tint} transform={`translate(${i * 44},0)`} />)}
          <text x="148" y="110" textAnchor="middle" fontSize="28" fontWeight="700" fill={tint} fontStyle="italic">x²</text>
        </g>
      );
    case 'balance':
      return (
        <g>
          <path d="M200 70 L170 200 H230 Z" {...op(0.25)} />
          <path d="M90 82 L310 66" {...line(0.95, 5)} />
          <circle cx="200" cy="74" r="8" fill={tint} />
          <path d="M90 82 L62 140 M90 82 L118 140 M310 66 L282 124 M310 66 L338 124" {...line(0.55, 1.6)} />
          <path d="M52 140 Q90 156 128 140 Z" {...op(0.9)} />
          <path d="M272 124 Q310 140 348 124 Z" {...op(0.9)} />
          <Box x={-18} y={-18} w={26} d={26} h={26} cx={92} cy={142} />
          {[0, 1, 2].map((i) => <circle key={i} cx={292 + i * 18} cy={114} r="8" fill={tint} />)}
        </g>
      );
    case 'function':
    case 'parabola':
      return (
        <g>
          <path d="M60 200 H350 M90 225 V30" {...line(0.35, 1.6)} />
          <path d="M100 50 Q 200 330 300 50" {...line(0.95, 3.5)} />
          <path d="M120 210 L330 90" stroke={tint} strokeWidth="3" strokeLinecap="round" />
          {[[200, 190], [262, 126], [138, 126]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" {...op(0.95)} />)}
        </g>
      );
    case 'geometry':
    case 'pythagoras':
      return (
        <g transform="translate(18,10)">
          <polygon points="150,150 230,150 150,90" {...op(0.95)} />
          <rect x="150" y="150" width="80" height="80" {...op(0.22)} transform="translate(0,-2)" />
          <rect x="90" y="90" width="60" height="60" {...op(0.4)} />
          <polygon points="150,90 230,150 290,70 210,10" fill={tint} fillOpacity="0.85" />
          <path d="M150 140 H160 V150" {...line(0.6, 1.5)} />
        </g>
      );
    case 'circle':
      return (
        <g>
          <circle cx="200" cy="125" r="84" {...op(0.14)} />
          <circle cx="200" cy="125" r="84" {...line(0.92, 3)} />
          <path d={`M200 125 L${200 + 84 * Math.cos(-0.5)} ${125 + 84 * Math.sin(-0.5)}`} {...line(0.92, 3)} />
          <path d={`M${200 + 84 * Math.cos(-0.5)} ${125 + 84 * Math.sin(-0.5)} A84 84 0 0 1 ${200 + 84 * Math.cos(0.9)} ${125 + 84 * Math.sin(0.9)}`} stroke={tint} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="200" cy="125" r="5" {...op(0.95)} />
          <text x="168" y="168" fontSize="34" fontWeight="600" fill={W} fillOpacity="0.9" fontStyle="italic">π</text>
        </g>
      );
    case 'symmetry':
      return (
        <g>
          <path d="M200 30 V220" {...line(0.6, 2)} strokeDasharray="6 7" />
          <path d="M196 60 C 150 30, 92 50, 100 100 C 104 128, 140 132, 196 124 C 140 140, 112 170, 140 200 C 160 214, 190 196, 196 160 Z" {...op(0.92)} />
          <path d="M204 60 C 250 30, 308 50, 300 100 C 296 128, 260 132, 204 124 C 260 140, 288 170, 260 200 C 240 214, 210 196, 204 160 Z" {...line(0.9, 2.5)} />
          <circle cx="148" cy="92" r="8" fill={tint} />
          <circle cx="252" cy="92" r="8" {...line(0.9, 2)} />
        </g>
      );
    case 'cube':
    case 'solids':
      return (
        <g>
          <Box x={-60} y={-20} w={40} d={40} h={40} cy={168} />
          <Box x={-20} y={-20} w={40} d={40} h={40} cy={168} />
          <Box x={20} y={-20} w={40} d={40} h={40} cy={168} />
          <Box x={-20} y={-60} w={40} d={40} h={40} cy={168} />
          <Box x={-20} y={-20} z={40} w={40} d={40} h={40} cy={168} />
          <Box x={-20} y={-60} z={40} w={40} d={40} h={40} cy={168} tones={[0.9, 0.5, 0.25]} />
          <Box x={-20} y={-20} z={80} w={40} d={40} h={40} cy={168} tones={[1, 0.7, 0.45]} />
        </g>
      );
    case 'dice': {
      const s = 70;
      const face = (u: number, v: number): P3 => [-s / 2 + u * s, -s / 2 + v * s, s];
      const top = [[0.25, 0.25], [0.75, 0.75], [0.5, 0.5], [0.25, 0.75], [0.75, 0.25]];
      return (
        <g>
          <Box x={-s / 2} y={-s / 2} w={s} d={s} h={s} cx={175} cy={150} />
          {top.map(([u, v], i) => {
            const [x, y] = iso(face(u, v), 175, 150);
            return <ellipse key={i} cx={x} cy={y} rx="7" ry="4" fill={tint} />;
          })}
          {[[0.3, 0.3], [0.7, 0.7]].map(([u, v], i) => {
            const [x, y] = iso([s / 2, -s / 2 + u * s, v * s], 175, 150);
            return <ellipse key={`r${i}`} cx={x} cy={y} rx="4" ry="6" fill={W} fillOpacity="0.9" transform={`rotate(-30 ${x} ${y})`} />;
          })}
          <Box x={-22} y={-22} w={44} d={44} h={44} cx={285} cy={190} tones={[0.85, 0.5, 0.25]} />
          {(() => { const [x, y] = iso([0, 0, 44], 285, 190); return <ellipse cx={x} cy={y} rx="6" ry="3.5" fill={tint} />; })()}
        </g>
      );
    }
    case 'chart':
      return (
        <g>
          {[30, 58, 44, 86, 120].map((h, i) => <Box key={i} x={-110 + i * 44} y={-14} w={28} d={28} h={h} cy={190} tones={i === 4 ? [1, 0.75, 0.5] : [0.85, 0.5, 0.26]} />)}
          <path d="M92 150 L150 120 L190 132 L240 92 L290 58" stroke={tint} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'scatter':
    case 'correlation': {
      const r = rand(7);
      return (
        <g>
          <path d="M70 210 H340 M80 220 V36" {...line(0.35, 1.6)} />
          {Array.from({ length: 30 }, (_, i) => {
            const x = 90 + r() * 240;
            const y = 200 - (x - 90) * 0.62 - (r() - 0.5) * 70;
            return <circle key={i} cx={x} cy={Math.max(40, Math.min(200, y))} r={4 + r() * 3} {...op(0.35 + r() * 0.6)} />;
          })}
          <path d="M90 196 L330 52" stroke={tint} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      );
    }
    case 'tree': {
      const leaves = [[300, 44], [300, 98], [300, 152], [300, 206]];
      return (
        <g>
          <path d="M100 125 L200 72 M100 125 L200 178" {...line(0.8, 3)} />
          <path d="M200 72 L300 44 M200 178 L300 152 M200 178 L300 206" {...line(0.45, 2.5)} />
          <path d="M200 72 L300 98" stroke={tint} strokeWidth="4" strokeLinecap="round" />
          <path d="M100 125 L200 72" stroke={tint} strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="125" r="13" {...op(0.95)} />
          <circle cx="200" cy="72" r="11" fill={tint} />
          <circle cx="200" cy="178" r="11" {...op(0.7)} />
          {leaves.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" {...(i === 1 ? { fill: tint } : op(0.55))} />)}
        </g>
      );
    }
    case 'coins':
    case 'money':
      return (
        <g>
          {[[130, 200, 3], [200, 206, 6], [270, 200, 9]].map(([cx, cy, n], k) => (
            <g key={k}>{Array.from({ length: n }, (_, i) => <Cylinder key={i} cx={cx} cy={cy - i * 13} rx={30} ry={12} h={9} o={k === 2 && i === n - 1 ? 1 : 0.85} />)}</g>
          ))}
          <path d="M100 120 C 170 110, 230 80, 300 30" stroke={tint} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={arrowHead(300, 30, -0.62, 12)} stroke={tint} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'growth':
      return (
        <g>
          {[4, 8, 16, 32, 64, 128].map((h, i) => <rect key={i} x={90 + i * 40} y={210 - h * 1.2} width="26" height={h * 1.2} rx="5" {...op(0.18 + i * 0.13)} />)}
          <path d={Array.from({ length: 50 }, (_, i) => { const x = 80 + i * 5.4; const y = 210 - 4.8 * Math.pow(2, (x - 90) / 40) * 1.2; return `${i ? 'L' : 'M'}${x.toFixed(1)},${Math.max(18, y).toFixed(1)}`; }).join(' ')} stroke={tint} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'primes': {
      const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]);
      return (
        <g>
          {Array.from({ length: 40 }, (_, i) => {
            const n = i + 1;
            const x = 70 + (i % 8) * 34;
            const y = 40 + Math.floor(i / 8) * 34;
            return <rect key={i} x={x} y={y} width="26" height="26" rx="7" {...(primes.has(n) ? (n === 7 ? { fill: tint } : op(0.92)) : op(0.13))} />;
          })}
        </g>
      );
    }
    case 'powers':
      return (
        <g>
          {[128, 64, 32, 16, 8].map((s, i) => <rect key={s} x={96} y={214 - s * 1.3} width={s * 1.3} height={s * 1.3} rx={4} {...op(0.14 + i * 0.18)} stroke={W} strokeOpacity="0.5" strokeWidth="1.2" />)}
          <text x="292" y="92" fontSize="44" fontWeight="700" fill={tint}>n²</text>
        </g>
      );
    case 'mental':
      return (
        <g>
          <rect x="90" y="46" width="140" height="100" rx="6" {...op(0.92)} />
          <rect x="236" y="46" width="70" height="100" rx="6" {...op(0.55)} />
          <rect x="90" y="152" width="140" height="48" rx="6" {...op(0.4)} />
          <rect x="236" y="152" width="70" height="48" rx="6" fill={tint} />
          <text x="160" y="106" textAnchor="middle" fontSize="24" fontWeight="700" fill={tint}>20·10</text>
          <text x="331" y="130" fontSize="30" fontWeight="700" fill={W} fillOpacity="0.9">×</text>
        </g>
      );
    case 'inequality':
      return (
        <g>
          <path d="M50 150 H350" {...line(0.5, 3)} />
          <path d="M160 150 H340" stroke={tint} strokeWidth="8" strokeLinecap="round" />
          <path d={arrowHead(346, 150, 0, 14)} stroke={tint} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${70 + i * 26} 140 V160`} {...line(0.5, 2)} />)}
          <circle cx="160" cy="150" r="12" fill="none" stroke={W} strokeWidth="4" />
          <text x="128" y="104" fontSize="54" fontWeight="300" fill={W} fillOpacity="0.85">x &gt; 3</text>
        </g>
      );
    case 'puzzle':
    case 'logic':
      return (
        <g>
          {Array.from({ length: 16 }, (_, i) => {
            const x = 116 + (i % 4) * 44;
            const y = 40 + Math.floor(i / 4) * 44;
            const mark = [0, 6, 9, 15].includes(i) ? 'yes' : [1, 4, 7, 10, 13].includes(i) ? 'no' : '';
            return (
              <g key={i}>
                <rect x={x} y={y} width="38" height="38" rx="8" {...op(mark === 'yes' ? 0.95 : 0.16)} />
                {mark === 'yes' && <path d={`M${x + 10} ${y + 20} l6 6 12 -13`} stroke={tint} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                {mark === 'no' && <path d={`M${x + 13} ${y + 13} l12 12 M${x + 25} ${y + 13} l-12 12`} {...line(0.7, 2.5)} />}
              </g>
            );
          })}
        </g>
      );
    case 'truth':
      return (
        <g>
          {[[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]].map((row, r) => row.map((v, c) => (
            <g key={`${r}-${c}`}>
              <rect x={118 + c * 58} y={44 + r * 42} width="48" height="32" rx="9" {...(c === 2 ? (v ? { fill: tint } : op(0.2)) : op(v ? 0.9 : 0.25))} />
              <text x={142 + c * 58} y={66 + r * 42} textAnchor="middle" fontSize="17" fontWeight="700" fill={c === 2 && v ? W : v ? '#000' : W} fillOpacity={v ? 0.75 : 0.85} fontFamily="ui-monospace, monospace">{v}</text>
            </g>
          )))}
          <path d="M108 36 V218" {...line(0.25, 1.5)} />
        </g>
      );
    case 'venn':
      return (
        <g>
          <circle cx="166" cy="104" r="62" {...op(0.2)} />
          <circle cx="234" cy="104" r="62" {...op(0.2)} />
          <circle cx="200" cy="160" r="62" {...op(0.2)} />
          <clipPath id="vclip"><circle cx="166" cy="104" r="62" /></clipPath>
          <clipPath id="vclip2"><circle cx="234" cy="104" r="62" /></clipPath>
          <g clipPath="url(#vclip)"><g clipPath="url(#vclip2)"><circle cx="200" cy="160" r="62" fill={tint} /></g></g>
          <circle cx="166" cy="104" r="62" {...line(0.9, 2.5)} />
          <circle cx="234" cy="104" r="62" {...line(0.9, 2.5)} />
          <circle cx="200" cy="160" r="62" {...line(0.9, 2.5)} />
        </g>
      );
    case 'game':
      return (
        <g>
          {[1, 3, 5, 7].map((n, r) => Array.from({ length: n }, (_, i) => (
            <circle key={`${r}-${i}`} cx={200 + (i - (n - 1) / 2) * 34} cy={52 + r * 46} r="13" {...(r === 3 && i >= 5 ? line(0.7, 2) : r === 2 && i === 2 ? { fill: tint } : op(0.9 - r * 0.12))} />
          )))}
        </g>
      );
    case 'robot':
    case 'code':
      return (
        <g>
          <rect x="70" y="36" width="260" height="178" rx="16" {...op(0.14)} stroke={W} strokeOpacity="0.4" />
          {[0, 1, 2].map((i) => <circle key={i} cx={92 + i * 16} cy="56" r="4.5" {...op(0.6)} />)}
          {[[0, 120, 0.9], [1, 90, 0.55], [1, 140, 0.55], [2, 70, 0.9], [1, 110, 0.55], [0, 60, 0.9]].map(([ind, w, o], i) => (
            <rect key={i} x={92 + (ind as number) * 22} y={80 + i * 21} width={w} height="10" rx="5" {...(i === 3 ? { fill: tint } : op(o as number))} />
          ))}
          <path d="M282 150 l-14 14 14 14 M306 150 l14 14 -14 14" {...line(0.9, 3)} />
        </g>
      );
    case 'algorithm':
    case 'sort':
      return (
        <g>
          {[30, 52, 74, 96, 118, 140, 162, 184].map((h, i) => <rect key={i} x={84 + i * 30} y={206 - h * 0.9} width="20" height={h * 0.9} rx="5" {...(i === 2 || i === 5 ? { fill: tint } : op(0.3 + i * 0.08))} />)}
          <path d="M154 30 C 170 10, 230 10, 244 30" {...line(0.85, 2.5)} />
          <path d={arrowHead(244, 30, 1.1, 9)} {...line(0.85, 2.5)} />
        </g>
      );
    case 'binary': {
      const bits = '1011001101001110110010110';
      return (
        <g>
          {[...bits].map((b, i) => {
            const x = 110 + (i % 5) * 38;
            const y = 34 + Math.floor(i / 5) * 38;
            return (
              <g key={i}>
                <rect x={x} y={y} width="32" height="32" rx="8" {...(b === '1' ? (i === 12 ? { fill: tint } : op(0.92)) : op(0.12))} />
                <text x={x + 16} y={y + 22} textAnchor="middle" fontSize="15" fontWeight="700" fill={b === '1' ? '#000' : W} fillOpacity={b === '1' ? 0.55 : 0.6} fontFamily="ui-monospace, monospace">{b}</text>
              </g>
            );
          })}
        </g>
      );
    }
    case 'circuit':
      return (
        <g>
          <path d="M60 88 H150 M60 162 H150" {...line(0.45, 3)} />
          <path d="M60 88 H150" stroke={tint} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M150 64 H190 A62 62 0 0 1 190 186 H150 Z" {...op(0.92)} />
          <path d="M252 125 H300" stroke={tint} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="320" cy="125" r="30" fill={tint} fillOpacity="0.35" />
          <circle cx="320" cy="125" r="18" fill={tint} />
          <circle cx="60" cy="88" r="7" fill={tint} />
          <circle cx="60" cy="162" r="7" {...op(0.5)} />
        </g>
      );
    case 'cipher':
    case 'crypto': {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return (
        <g>
          <circle cx="200" cy="125" r="98" {...op(0.12)} />
          <circle cx="200" cy="125" r="98" {...line(0.6, 1.5)} />
          <circle cx="200" cy="125" r="64" {...op(0.85)} />
          {[...letters].map((l, i) => {
            const a = (i / 26) * Math.PI * 2;
            const b = ((i + 3) / 26) * Math.PI * 2;
            return (
              <g key={l}>
                <text x={200 + Math.sin(a) * 82} y={130 - Math.cos(a) * 82} textAnchor="middle" fontSize="12" fontWeight="700" fill={W} fillOpacity={i === 0 ? 1 : 0.75}>{l}</text>
                <text x={200 + Math.sin(b) * 48} y={129 - Math.cos(b) * 48} textAnchor="middle" fontSize="10" fontWeight="700" fill="#000" fillOpacity="0.55">{l}</text>
              </g>
            );
          })}
          <circle cx={200 + Math.sin(0) * 82} cy={125 - 82} r="11" fill="none" stroke={tint} strokeWidth="3" />
        </g>
      );
    }
    case 'network':
    case 'graph': {
      const n: [number, number][] = [[84, 120], [150, 56], [160, 178], [236, 112], [300, 52], [312, 186], [350, 116]];
      const e = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [3, 4], [3, 5], [2, 5], [4, 6], [5, 6]];
      const hot = new Set(['0-2', '2-3', '3-4', '4-6']);
      return (
        <g>
          {e.map(([a, b]) => <path key={`${a}-${b}`} d={`M${n[a][0]} ${n[a][1]} L${n[b][0]} ${n[b][1]}`} {...(hot.has(`${a}-${b}`) ? { stroke: tint, strokeWidth: 5, strokeLinecap: 'round' as const } : line(0.4, 2.5))} />)}
          {n.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 0 || i === 6 ? 14 : 10} {...op(0.95)} />)}
        </g>
      );
    }
    case 'ai':
      return (
        <g>
          <path d="M80 50 h210 a16 16 0 0 1 16 16 v62 a16 16 0 0 1 -16 16 h-150 l-30 24 v-24 h-30 a16 16 0 0 1 -16 -16 v-62 a16 16 0 0 1 16 -16z" {...op(0.9)} />
          <rect x="98" y="74" width="150" height="10" rx="5" fill="#000" fillOpacity="0.18" />
          <rect x="98" y="96" width="110" height="10" rx="5" fill="#000" fillOpacity="0.18" />
          <rect x="216" y="96" width="56" height="10" rx="5" fill={tint} />
          {[0.72, 0.18, 0.1].map((p, i) => <rect key={i} x={200} y={176 + i * 16} width={150 * p} height="10" rx="5" {...(i === 0 ? { fill: tint } : op(0.5))} />)}
        </g>
      );
    case 'neural': {
      const layers = [3, 4, 4, 2];
      const pos = layers.map((n, li) => Array.from({ length: n }, (_, i) => [90 + li * 74, 125 + (i - (n - 1) / 2) * 48] as [number, number]));
      return (
        <g>
          {pos.slice(0, -1).map((layer, li) => layer.map((a, i) => pos[li + 1].map((b, j) => (
            <path key={`${li}-${i}-${j}`} d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} {...((i + j + li) % 3 === 0 ? { stroke: tint, strokeWidth: 2.5 } : line(0.25, 1.5))} />
          ))))}
          {pos.flat().map(([x, y], i) => <circle key={i} cx={x} cy={y} r="11" {...op(0.95)} />)}
        </g>
      );
    }
    case 'vision':
    case 'pixels': {
      const img = ['..####..', '.######.', '##.##.##', '########', '##....##', '.##..##.', '..####..', '........'];
      return (
        <g>
          {img.map((row, r) => [...row].map((c, k) => <rect key={`${r}-${k}`} x={128 + k * 18} y={38 + r * 18} width="15" height="15" rx="3.5" {...op(c === '#' ? 0.9 : 0.1)} />))}
          <rect x={128 + 4 * 18 - 3} y={38 + 3 * 18 - 3} width={3 * 18 + 3} height={3 * 18 + 3} rx="6" fill="none" stroke={tint} strokeWidth="4" />
        </g>
      );
    }
    case 'motion':
    case 'physics':
      return (
        <g>
          <path d="M50 210 H350" {...line(0.4, 2)} />
          <path d="M70 205 Q 200 -40 330 205" {...line(0.5, 2)} strokeDasharray="2 9" />
          {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((t, i) => {
            const x = 70 + 260 * t;
            const y = 205 - 4 * 122 * t * (1 - t);
            return <circle key={i} cx={x} cy={y} r={7 + i * 0.6} {...op(0.25 + i * 0.13)} />;
          })}
          <circle cx={70 + 260 * 0.85} cy={205 - 4 * 122 * 0.85 * 0.15} r="11" fill={tint} />
          <path d="M92 182 L130 112" stroke={tint} strokeWidth="3.5" strokeLinecap="round" />
          <path d={arrowHead(130, 112, -1.07, 11)} stroke={tint} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'energy':
      return (
        <g>
          <circle cx="200" cy="125" r="92" {...line(0.3, 1.5)} />
          <circle cx="200" cy="125" r="70" {...op(0.14)} />
          <path d="M214 42 L160 134 H198 L184 208 L244 112 H204 Z" {...op(0.95)} />
          <path d="M310 70 a92 92 0 0 1 -10 120" stroke={tint} strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'electricity':
      return (
        <g>
          <path d="M90 70 H310 V190 H90 Z" {...line(0.55, 3)} />
          <path d="M90 70 H200" stroke={tint} strokeWidth="3.5" />
          <path d="M140 180 V200 M156 172 V208" {...line(0.95, 4)} />
          <rect x="128" y="186" width="40" height="8" fill="var(--topic, #000)" opacity="0" />
          <circle cx="250" cy="70" r="26" fill={tint} fillOpacity="0.3" />
          <circle cx="250" cy="70" r="16" fill={tint} />
          <path d="M243 70 l4 -6 4 6 4 -6" stroke="#fff" strokeWidth="2" fill="none" />
          <rect x="296" y="110" width="28" height="44" rx="5" {...op(0.9)} />
        </g>
      );
    case 'sequence':
      return (
        <g>
          {[1, 2, 3, 4].map((n, k) => {
            const x0 = 72 + [0, 32, 90, 170][k];
            return Array.from({ length: n }, (_, r) => Array.from({ length: r + 1 }, (_, c) => (
              <circle key={`${k}-${r}-${c}`} cx={x0 + c * 18 - r * 9 + n * 9} cy={210 - (n - r) * 18} r="7" {...(k === 3 ? { fill: tint } : op(0.4 + k * 0.18))} />
            )));
          })}
        </g>
      );
    case 'review':
      return (
        <g>
          <path d="M120 125 A80 80 0 0 1 270 86" {...line(0.95, 6)} />
          <path d={arrowHead(272, 88, 1.0, 14)} {...line(0.95, 6)} />
          <path d="M280 125 A80 80 0 0 1 130 164" stroke={tint} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d={arrowHead(128, 162, -2.1, 14)} stroke={tint} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'hanoi':
      return (
        <g>
          <rect x="60" y="196" width="280" height="10" rx="5" {...op(0.4)} />
          {[100, 200, 300].map((x) => <rect key={x} x={x - 4} y="70" width="8" height="128" rx="4" {...op(0.35)} />)}
          {[0, 1, 2, 3].map((i) => <rect key={i} x={100 - (84 - i * 18) / 2} y={176 - i * 22} width={84 - i * 18} height="18" rx="9" {...op(0.95 - i * 0.12)} />)}
          {[0, 1].map((i) => <rect key={`b${i}`} x={300 - (66 - i * 18) / 2} y={176 - i * 22} width={66 - i * 18} height="18" rx="9" fill={tint} fillOpacity={1 - i * 0.2} />)}
          <path d="M200 52 C 220 30, 270 30, 290 52" {...line(0.7, 2.5)} strokeDasharray="4 6" />
        </g>
      );
    case 'doors':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${82 + i * 88},48)`}>
              <rect width="68" height="140" rx="8" {...(i === 1 ? { fill: tint } : op(i === 2 ? 0.2 : 0.85))} />
              <circle cx="54" cy="74" r="4" fill={i === 1 ? '#fff' : '#000'} fillOpacity="0.4" />
              {i === 2 && <path d="M18 112 q16 -26 32 0 M22 86 l6 -10 M46 86 l-6 -10" {...line(0.9, 3)} />}
              <text x="34" y="40" textAnchor="middle" fontSize="24" fontWeight="800" fill={i === 1 ? '#fff' : '#000'} fillOpacity="0.45">{i + 1}</text>
            </g>
          ))}
          <text x="200" y="228" textAnchor="middle" fontSize="20" fontWeight="800" fill={W} fillOpacity="0.9">?</text>
        </g>
      );
    case 'waves':
      return (
        <g>
          {[[34, 0.022, 0.95, 3.5], [20, 0.045, 0.55, 2.5], [12, 0.07, 0.3, 2]].map(([a, f, o, w], k) => (
            <path key={k} d={Array.from({ length: 81 }, (_, i) => { const x = 40 + i * 4; return `${i ? 'L' : 'M'}${x},${(125 + Math.sin((x - 40) * f * 3.2) * a).toFixed(1)}`; }).join(' ')} {...(k === 0 ? { stroke: tint, strokeWidth: w, fill: 'none', strokeLinecap: 'round' as const } : line(o, w))} />
          ))}
          <path d="M40 125 H360" {...line(0.25, 1.5)} />
        </g>
      );
    case 'space': {
      const r = rand(11);
      return (
        <g>
          {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={r() * 400} cy={r() * 250} r={0.6 + r() * 1.6} {...op(0.3 + r() * 0.6)} />)}
          <ellipse cx="200" cy="130" rx="150" ry="46" {...line(0.35, 1.5)} transform="rotate(-12 200 130)" />
          <ellipse cx="200" cy="130" rx="96" ry="30" {...line(0.35, 1.5)} transform="rotate(-12 200 130)" />
          <circle cx="200" cy="130" r="30" fill={tint} />
          <circle cx="200" cy="130" r="44" fill={tint} fillOpacity="0.2" />
          <circle cx="292" cy="108" r="10" {...op(0.95)} />
          <circle cx="62" cy="170" r="14" {...op(0.75)} />
          <ellipse cx="62" cy="170" rx="24" ry="6" {...line(0.7, 2)} transform="rotate(-20 62 170)" />
        </g>
      );
    }
    case 'fractal': {
      const tris: ReactNode[] = [];
      const draw = (x: number, y: number, s: number, d: number) => {
        if (d === 0) {
          tris.push(<polygon key={`${x}-${y}-${s}`} points={`${x},${y} ${x + s},${y} ${x + s / 2},${y - s * 0.866}`} {...op(0.88)} />);
          return;
        }
        draw(x, y, s / 2, d - 1);
        draw(x + s / 2, y, s / 2, d - 1);
        draw(x + s / 4, y - (s / 2) * 0.866, s / 2, d - 1);
      };
      draw(105, 220, 190, 4);
      return <g>{tris}<polygon points="105,220 295,220 200,55.5" fill="none" stroke={tint} strokeWidth="3" strokeLinejoin="round" /></g>;
    }
    case 'stars':
      return (
        <g>
          {[0, 1, 2].map((row) => (
            <g key={row} transform={`translate(96,${58 + row * 52})`}>
              <rect x="-14" y="-22" width="236" height="44" rx="12" {...op(0.12 + row * 0.04)} />
              {[0, 1, 2, 3, 4].map((k) => {
                const filled = k < [5, 4, 2][row];
                const cx = 14 + k * 40;
                const star = Array.from({ length: 10 }, (_, j) => { const ang = -Math.PI / 2 + (j * Math.PI) / 5; const rr = j % 2 ? 6 : 14; return `${(cx + rr * Math.cos(ang)).toFixed(1)},${(rr * Math.sin(ang)).toFixed(1)}`; }).join(' ');
                return <polygon key={k} points={star} {...(filled ? (row === 0 ? { fill: tint } : op(0.9)) : op(0.2))} />;
              })}
            </g>
          ))}
        </g>
      );
    case 'calculus': {
      const f = (x: number) => 200 - 0.0045 * (x - 70) * (x - 70) * 0.9 - 10;
      const pts = Array.from({ length: 29 }, (_, i) => 60 + i * 10).map((x) => `${x},${f(x).toFixed(1)}`);
      const area = `M150,215 L${Array.from({ length: 11 }, (_, i) => 150 + i * 10).map((x) => `${x},${f(x).toFixed(1)}`).join(' L')} L250,215 Z`;
      const x0 = 250;
      const slope = -0.0081 * (x0 - 70);
      return (
        <g>
          <path d="M50 215 H350 M60 225 V30" {...line(0.35, 2)} />
          <path d={area} {...op(0.22)} />
          {Array.from({ length: 5 }, (_, i) => <rect key={i} x={150 + i * 20} y={f(150 + i * 20 + 10)} width="18" height={215 - f(150 + i * 20 + 10)} {...op(0.16)} />)}
          <polyline points={pts.join(' ')} {...line(0.9, 4)} />
          <path d={`M${x0 - 70},${f(x0) - slope * 70} L${x0 + 70},${f(x0) + slope * 70}`} stroke={tint} strokeWidth="4" strokeLinecap="round" />
          <circle cx={x0} cy={f(x0)} r="9" fill={tint} />
        </g>
      );
    }
    case 'vectors':
      return (
        <g>
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${80 + i * 40} 40 V210 M60 ${50 + i * 26} H340`} {...line(0.1, 1)} />)}
          <path d="M100 190 L210 140" {...line(0.85, 5)} />
          <path d={arrowHead(210, 140, Math.atan2(-50, 110), 14)} {...line(0.85, 5)} />
          <path d="M210 140 L260 60" {...line(0.55, 5)} />
          <path d={arrowHead(260, 60, Math.atan2(-80, 50), 14)} {...line(0.55, 5)} />
          <path d="M100 190 L258 64" stroke={tint} strokeWidth="5" strokeLinecap="round" strokeDasharray="1 0" />
          <path d={arrowHead(260, 60, Math.atan2(-130, 160), 15)} stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="100" cy="190" r="7" {...op(0.9)} />
        </g>
      );
    case 'bell': {
      const g = (x: number) => 205 - 150 * Math.exp(-((x - 200) ** 2) / (2 * 48 ** 2));
      const pts = Array.from({ length: 61 }, (_, i) => 50 + i * 5).map((x) => `${x},${g(x).toFixed(1)}`);
      const mid = Array.from({ length: 21 }, (_, i) => 152 + i * 4.8).map((x) => `${x.toFixed(1)},${g(x).toFixed(1)}`);
      return (
        <g>
          <path d={`M152,205 L${mid.join(' L')} L248,205 Z`} fill={tint} fillOpacity="0.85" />
          <path d={`M104,205 L${Array.from({ length: 21 }, (_, i) => 104 + i * 9.6).map((x) => `${x.toFixed(1)},${g(x).toFixed(1)}`).join(' L')} L296,205 Z`} {...op(0.18)} />
          <polyline points={pts.join(' ')} {...line(0.95, 4)} />
          <path d="M40 205 H360" {...line(0.4, 2)} />
          <path d="M200 205 V50" {...line(0.5, 2)} strokeDasharray="3 6" />
        </g>
      );
    }
    case 'proof':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={96 + i * 22} y={52 + i * 52} width={170} height="34" rx="9" {...op(0.18 + i * 0.16)} />
              <rect x={110 + i * 22} y={64 + i * 52} width={60 + i * 24} height="10" rx="5" {...op(0.7)} />
            </g>
          ))}
          {[0, 1].map((i) => <path key={i} d={`M${150 + i * 22} ${88 + i * 52} V${102 + i * 52}`} {...line(0.6, 3)} />)}
          <rect x="286" y="160" width="30" height="30" fill={tint} />
        </g>
      );
    case 'stack':
      return (
        <g>
          {[0, 1, 2, 3].map((i) => <rect key={i} x="78" y={190 - i * 34} width="110" height="28" rx="7" {...(i === 3 ? { fill: tint } : op(0.3 + i * 0.18))} />)}
          <path d="M133 46 V70" {...line(0.8, 4)} />
          <path d={arrowHead(133, 72, Math.PI / 2, 11)} {...line(0.8, 4)} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={222 + i * 30} y="120" width="24" height="44" rx="6" {...op(0.25 + i * 0.17)} />)}
          <path d="M218 190 H350" {...line(0.45, 3)} />
          <path d={arrowHead(350, 190, 0, 10)} {...line(0.45, 3)} />
        </g>
      );
    case 'atom':
      return (
        <g>
          {[0, 60, 120].map((rot, i) => (
            <ellipse key={rot} cx="200" cy="125" rx="120" ry="40" transform={`rotate(${rot} 200 125)`} {...line(0.35 + i * 0.2, 2.5)} />
          ))}
          <circle cx="192" cy="120" r="14" fill={tint} />
          <circle cx="210" cy="130" r="14" {...op(0.9)} />
          <circle cx="198" cy="136" r="12" fill={tint} fillOpacity="0.8" />
          {[
            [320, 125],
            [140, 21],
            [140, 229],
          ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" {...op(0.95)} />)}
        </g>
      );
    case 'fluid':
      return (
        <g>
          <path d="M90 60 V210 Q90 220 100 220 H300 Q310 220 310 210 V60" {...line(0.6, 4)} />
          <path d="M92 120 Q140 110 200 120 T308 120 V210 Q308 218 300 218 H100 Q92 218 92 210 Z" {...op(0.22)} />
          <rect x="160" y="88" width="64" height="52" rx="6" fill={tint} />
          {[
            [130, 190, 6],
            [140, 168, 4],
            [262, 196, 7],
            [254, 160, 4],
          ].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} {...line(0.7, 2)} />)}
          <path d="M192 156 V196" {...line(0.85, 4)} />
          <path d={arrowHead(192, 152, -Math.PI / 2, 11)} {...line(0.85, 4)} />
        </g>
      );
    case 'periodic':
      return (
        <g>
          {Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => {
              if (r === 0 && c > 0 && c < 8) return null;
              const hot = (r === 1 && c === 0) || (r === 2 && c === 7) || (r === 3 && c === 4);
              return <rect key={`${r}-${c}`} x={62 + c * 31} y={46 + r * 40} width="26" height="34" rx="5" {...(hot ? { fill: tint } : op(0.16 + ((r + c) % 3) * 0.12))} />;
            }),
          )}
        </g>
      );
    case 'bonds':
      return (
        <g>
          <path d="M200 120 L120 175 M200 120 L280 175" {...line(0.75, 6)} />
          <path d="M200 120 L200 52" {...line(0.4, 3)} strokeDasharray="4 7" />
          <circle cx="200" cy="120" r="40" fill={tint} />
          <circle cx="120" cy="175" r="24" {...op(0.9)} />
          <circle cx="280" cy="175" r="24" {...op(0.9)} />
          <circle cx="200" cy="40" r="14" {...op(0.35)} />
        </g>
      );
    case 'mole':
      return (
        <g>
          <path d="M175 40 H225 M182 40 V100 L120 205 Q115 215 127 215 H273 Q285 215 280 205 L218 100 V40" {...line(0.85, 5)} />
          <path d="M150 160 L250 160 L276 207 Q279 213 271 213 H129 Q121 213 124 207 Z" fill={tint} fillOpacity="0.85" />
          {[[175, 185, 6], [205, 175, 4], [230, 192, 5], [195, 140, 4], [212, 118, 3]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} {...op(0.9)} />)}
        </g>
      );
    case 'organic': {
      const hex = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
      return (
        <g>
          <polygon points={hex(150, 125, 58)} {...line(0.9, 5)} />
          <circle cx="150" cy="125" r="32" stroke={tint} strokeWidth="5" fill="none" />
          <path d="M200 96 L240 72 L280 96 L320 72 L360 96" {...line(0.6, 5)} />
          {[[240, 72], [280, 96], [320, 72], [360, 96]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" {...op(0.85)} />)}
        </g>
      );
    }
    case 'heat':
      return (
        <g>
          <rect x="176" y="40" width="34" height="140" rx="17" {...line(0.85, 5)} />
          <circle cx="193" cy="192" r="28" fill={tint} />
          <rect x="186" y="100" width="14" height="92" rx="7" fill={tint} />
          {[0, 1, 2].map((i) => <path key={i} d={`M${250 + i * 32} 190 q -14 -22 0 -44 t 0 -44`} {...line(0.35 + i * 0.2, 4)} />)}
          {[0, 1, 2].map((i) => <path key={`l${i}`} d={`M${110 - i * 32} 190 q -14 -22 0 -44 t 0 -44`} {...line(0.35 + i * 0.2, 4)} />)}
        </g>
      );
    case 'magnet':
      return (
        <g>
          {[40, 70, 100].map((r, i) => <path key={r} d={`M${150 - r * 0.2} 150 A${r + 50} ${r + 40} 0 0 1 ${250 + r * 0.2} 150`} {...line(0.18 + i * 0.1, 2)} strokeDasharray="3 6" />)}
          <path d="M150 210 V140 A50 50 0 0 1 250 140 V210" stroke={tint} strokeWidth="34" fill="none" />
          <path d="M150 210 V188 M250 210 V188" {...line(0.95, 34)} strokeLinecap="butt" />
        </g>
      );
    case 'relativity':
      return (
        <g>
          {Array.from({ length: 7 }, (_, i) => {
            const y = 70 + i * 22;
            const dip = 34 * Math.exp(-((y - 136) ** 2) / 1800);
            return <path key={`h${i}`} d={`M40 ${y} Q200 ${y + dip * 2.2} 360 ${y}`} {...line(0.22, 1.5)} />;
          })}
          {Array.from({ length: 9 }, (_, i) => {
            const x = 60 + i * 35;
            const lean = (x - 200) * -0.18;
            return <path key={`v${i}`} d={`M${x} 60 Q${x + lean} 150 ${x} 220`} {...line(0.22, 1.5)} />;
          })}
          <circle cx="200" cy="150" r="30" fill={tint} />
          <path d="M60 70 Q190 110 340 60" {...line(0.85, 3)} strokeDasharray="5 6" />
        </g>
      );
    case 'quantum': {
      const pts = Array.from({ length: 81 }, (_, i) => { const x = 40 + i * 4; const env = Math.exp(-((x - 200) ** 2) / 4200); return `${x},${(125 - 70 * env * Math.sin((x - 200) / 9)).toFixed(1)}`; });
      const r = rand(7);
      return (
        <g>
          {Array.from({ length: 46 }, (_, i) => { const x = 200 + (r() + r() + r() - 1.5) * 120; const y = 125 + (r() - 0.5) * 140; return <circle key={i} cx={x} cy={y} r="2.6" {...op(0.25)} />; })}
          <polyline points={pts.join(' ')} stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M40 125 H360" {...line(0.3, 1.5)} />
        </g>
      );
    }
    case 'logarithm': {
      const pts = Array.from({ length: 60 }, (_, i) => { const x = 62 + i * 5; return `${x},${(210 - 52 * Math.log(1 + (x - 60) / 12)).toFixed(1)}`; });
      return (
        <g>
          <path d="M60 215 H350 M60 225 V35" {...line(0.4, 2)} />
          {[1, 2, 3].map((k) => <path key={k} d={`M60 ${210 - 52 * Math.log(1 + (12 * (10 ** (k / 2) - 1)) / 12)} H350`} {...line(0.14, 1)} />)}
          <polyline points={pts.join(' ')} stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" />
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={62 + 2 ** i * 4.4} cy={210 - 52 * Math.log(1 + (2 ** i * 4.4) / 12)} r="6" {...op(0.9)} />)}
        </g>
      );
    }
    case 'matrix':
      return (
        <g>
          <path d="M120 48 H100 V202 H120 M280 48 H300 V202 H280" {...line(0.9, 6)} />
          {Array.from({ length: 9 }, (_, i) => {
            const r = Math.floor(i / 3);
            const c = i % 3;
            return <circle key={i} cx={150 + c * 50} cy={75 + r * 50} r="15" {...(r === c ? { fill: tint } : op(0.3))} />;
          })}
        </g>
      );
    case 'complex':
      return (
        <g>
          <path d="M70 125 H330 M200 25 V225" {...line(0.35, 2)} />
          <circle cx="200" cy="125" r="80" {...line(0.45, 2)} strokeDasharray="4 7" />
          {[[280, 125], [200, 45], [120, 125], [200, 205]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" {...(i === 1 ? { fill: tint } : op(0.85))} />)}
          <path d="M200 125 L257 68" stroke={tint} strokeWidth="5" strokeLinecap="round" />
          <path d={arrowHead(257, 68, -Math.PI / 4, 13)} stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M290 110 A90 90 0 0 0 230 45" {...line(0.7, 3)} />
          <path d={arrowHead(230, 45, Math.PI * 1.1, 10)} {...line(0.7, 3)} />
        </g>
      );
    case 'regression': {
      const r = rand(11);
      const ptsR = Array.from({ length: 14 }, (_, i) => { const x = 70 + i * 20; return { x, y: 200 - (x - 60) * 0.48 + (r() - 0.5) * 60 }; });
      return (
        <g>
          <path d="M60 215 H350 M60 225 V35" {...line(0.35, 2)} />
          {ptsR.map((p, i) => <path key={`r${i}`} d={`M${p.x} ${p.y} V${200 - (p.x - 60) * 0.48}`} {...line(0.3, 2)} />)}
          <path d="M60 200 L350 61" stroke={tint} strokeWidth="5" strokeLinecap="round" />
          {ptsR.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="7" {...op(0.9)} />)}
        </g>
      );
    }
    case 'testing': {
      const g = (x: number) => 200 - 140 * Math.exp(-((x - 180) ** 2) / (2 * 50 ** 2));
      const pts = Array.from({ length: 61 }, (_, i) => 30 + i * 5.5).map((x) => `${x.toFixed(1)},${g(x).toFixed(1)}`);
      const tail = Array.from({ length: 21 }, (_, i) => 280 + i * 3.6).map((x) => `${x.toFixed(1)},${g(x).toFixed(1)}`);
      return (
        <g>
          <path d={`M280,200 L${tail.join(' L')} L352,200 Z`} fill={tint} />
          <polyline points={pts.join(' ')} {...line(0.9, 4)} />
          <path d="M30 200 H370" {...line(0.4, 2)} />
          <path d="M300 200 V60" stroke={tint} strokeWidth="4" strokeDasharray="6 6" />
          <circle cx="300" cy="56" r="9" fill={tint} />
        </g>
      );
    }
    case 'reinforcement':
      return (
        <g>
          {Array.from({ length: 20 }, (_, i) => {
            const r = Math.floor(i / 5);
            const c = i % 5;
            const wall = [6, 8, 12, 13].includes(i);
            return <rect key={i} x={110 + c * 38} y={48 + r * 38} width="34" height="34" rx="6" {...op(wall ? 0.55 : 0.12)} />;
          })}
          <path d="M127 65 H165 V179 H241 V103 H279" stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 10" />
          <circle cx="127" cy="65" r="11" fill={tint} />
          <polygon points={Array.from({ length: 10 }, (_, j) => { const a = -Math.PI / 2 + (j * Math.PI) / 5; const rr = j % 2 ? 7 : 16; return `${(279 + rr * Math.cos(a)).toFixed(1)},${(103 + rr * Math.sin(a)).toFixed(1)}`; }).join(' ')} {...op(0.95)} />
        </g>
      );
    case 'transformer':
      return (
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <rect x={52 + i * 50} y="48" width="42" height="24" rx="8" {...op(0.85)} />
              <rect x={52 + i * 50} y="178" width="42" height="24" rx="8" {...(i === 4 ? { fill: tint } : op(0.3))} />
            </g>
          ))}
          {[0, 1, 2, 3, 5].map((i) => {
            const w = [0.15, 0.9, 0.25, 0.4, 0.2][[0, 1, 2, 3, 5].indexOf(i)];
            return <path key={i} d={`M${73 + i * 50} 72 C${73 + i * 50} 130 ${273} 120 ${273} 178`} stroke={i === 1 ? tint : '#fff'} strokeOpacity={w} strokeWidth={2 + w * 6} fill="none" />;
          })}
        </g>
      );
    case 'complexity': {
      const curve = (f: (x: number) => number) => Array.from({ length: 40 }, (_, i) => { const x = i / 39; return `${(60 + x * 290).toFixed(1)},${(210 - Math.min(175, f(x) * 175)).toFixed(1)}`; }).join(' ');
      return (
        <g>
          <path d="M60 215 H355 M60 225 V30" {...line(0.35, 2)} />
          <polyline points={curve((x) => x * 0.5)} {...line(0.5, 4)} />
          <polyline points={curve((x) => x * x)} {...line(0.85, 4)} />
          <polyline points={curve((x) => (2 ** (x * 9) - 1) / 60)} stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case 'limits': {
      const lem = Array.from({ length: 101 }, (_, i) => { const t = (i / 100) * Math.PI * 2; const d = 1 + Math.sin(t) ** 2; return `${(200 + (130 * Math.cos(t)) / d).toFixed(1)},${(125 + (130 * Math.sin(t) * Math.cos(t)) / d).toFixed(1)}`; });
      return (
        <g>
          {[0, 1, 2].map((i) => <rect key={i} x={40 + i * 14} y={30 + i * 10} width={320 - i * 28} height={190 - i * 20} rx="12" {...line(0.12 + i * 0.08, 1.5)} />)}
          <polyline points={lem.join(' ')} stroke={tint} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    case 'mltree':
      return (
        <g>
          <path d="M200 52 L130 122 M200 52 L270 122 M130 122 L95 192 M130 122 L165 192 M270 122 L235 192 M270 122 L305 192" {...line(0.6, 4)} />
          <rect x="176" y="36" width="48" height="32" rx="9" fill={tint} />
          {[[130, 122], [270, 122]].map(([x, y], i) => <rect key={i} x={x - 22} y={y - 15} width="44" height="30" rx="8" {...op(0.85)} />)}
          {[95, 165, 235, 305].map((x, i) => <circle key={x} cx={x} cy="196" r="14" {...(i === 1 ? { fill: tint } : op(0.4 + i * 0.1))} />)}
        </g>
      );
    case 'shield':
      return (
        <g>
          <path d="M200 34 L272 62 V122 Q272 182 200 216 Q128 182 128 122 V62 Z" {...op(0.18)} />
          <path d="M200 34 L272 62 V122 Q272 182 200 216 Q128 182 128 122 V62 Z" {...line(0.85, 5)} />
          <path d="M168 124 L192 148 L236 100" stroke={tint} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'generative': {
      const r = rand(5);
      return (
        <g>
          {Array.from({ length: 6 }, (_, c) =>
            Array.from({ length: 5 }, (_, row) => {
              const clean = c >= 3;
              const v = clean ? 0.2 + ((c + row) % 3) * 0.25 : r();
              return <rect key={`${c}-${row}`} x={70 + c * 44} y={40 + row * 36} width="40" height="32" rx={clean ? 6 : 2} {...(clean && row === 2 && c === 4 ? { fill: tint } : op(v * 0.8))} />;
            }),
          )}
          <path d="M196 125 H232" {...line(0.9, 4)} />
          <path d={arrowHead(234, 125, 0, 10)} {...line(0.9, 4)} />
        </g>
      );
    }
    case 'mixtures':
      return (
        <g>
          <path d="M150 40 V190 Q150 214 174 214 H226 Q250 214 250 190 V40" {...line(0.85, 5)} />
          <rect x="153" y="150" width="94" height="60" rx="4" fill={tint} fillOpacity="0.85" />
          <rect x="153" y="105" width="94" height="45" {...op(0.35)} />
          <rect x="153" y="80" width="94" height="25" {...op(0.15)} />
          {[[175, 128], [215, 118], [196, 92]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" {...op(0.9)} />)}
          <path d="M100 150 H130 M270 150 H300" {...line(0.4, 3)} strokeDasharray="4 6" />
        </g>
      );
    case 'acids': {
      const cols = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6'];
      return (
        <g>
          {cols.map((c, i) => <rect key={i} x={56 + i * 32} y="150" width="28" height="44" rx="6" fill={c} fillOpacity="0.85" />)}
          <path d="M200 40 Q232 86 232 108 A32 32 0 0 1 168 108 Q168 86 200 40 Z" fill={tint} />
          <path d="M200 140 V150" {...line(0.8, 3)} />
        </g>
      );
    }
    case 'battery':
      return (
        <g>
          <rect x="110" y="80" width="170" height="90" rx="14" {...line(0.9, 6)} />
          <rect x="280" y="108" width="14" height="34" rx="4" {...op(0.9)} />
          <rect x="122" y="92" width="100" height="66" rx="6" fill={tint} />
          <path d="M150 125 H190 M170 105 V145" {...line(0.95, 6)} strokeLinecap="butt" />
          <path d="M246 125 H266" {...line(0.6, 6)} />
          <path d="M80 70 L60 112 H84 L66 160" stroke={tint} strokeWidth="5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      );
    case 'kinetics': {
      const hill = (h: number) => `M50 190 C120 190 140 ${190 - h} 200 ${190 - h} S280 200 350 200`;
      return (
        <g>
          <path d={hill(140)} {...line(0.45, 4)} strokeDasharray="6 7" />
          <path d={hill(70)} stroke={tint} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M40 210 H360 M40 220 V40" {...line(0.35, 2)} />
          <circle cx="200" cy="114" r="10" fill={tint} />
          <circle cx="60" cy="182" r="9" {...op(0.9)} />
        </g>
      );
    }
    case 'optics':
      return (
        <g>
          <path d="M200 40 Q232 125 200 210 Q168 125 200 40 Z" {...op(0.3)} />
          <path d="M200 40 Q232 125 200 210 Q168 125 200 40 Z" {...line(0.85, 3)} />
          {[80, 125, 170].map((y, i) => <path key={i} d={`M50 ${y} L200 ${y} L320 125`} {...(i === 1 ? { stroke: tint, strokeWidth: 4, fill: 'none' } : line(0.75, 3))} />)}
          <circle cx="320" cy="125" r="10" fill={tint} />
          <path d="M40 125 H360" {...line(0.2, 1.5)} strokeDasharray="4 6" />
        </g>
      );
    case 'nuclear': {
      const r = rand(3);
      return (
        <g>
          {Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; const d = 14 + r() * 14; return <circle key={i} cx={200 + Math.cos(a) * d} cy={125 + Math.sin(a) * d} r="11" {...(i % 2 ? { fill: tint } : op(0.9))} />; })}
          {[0, 1, 2].map((i) => {
            const a = -0.5 + i * 2.1;
            return <path key={i} d={`M${200 + Math.cos(a) * 52} ${125 + Math.sin(a) * 52} q 10 -10 20 0 t 20 0 t 20 0`} transform={`rotate(${(a * 180) / Math.PI} ${200 + Math.cos(a) * 52} ${125 + Math.sin(a) * 52})`} {...line(0.7, 3)} />;
          })}
        </g>
      );
    }
    case 'database':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(0 ${i * 46})`}>
              <path d="M140 58 V92 A60 16 0 0 0 260 92 V58" {...op(0.22 + i * 0.15)} />
              <ellipse cx="200" cy="58" rx="60" ry="16" {...(i === 0 ? { fill: tint } : op(0.5 + i * 0.15))} />
            </g>
          ))}
          <path d="M140 58 V184 A60 16 0 0 0 260 184 V58" {...line(0.7, 3)} />
        </g>
      );
    case 'lock':
      return (
        <g>
          <path d="M160 116 V88 A40 40 0 0 1 240 88 V116" {...line(0.9, 12)} />
          <rect x="138" y="112" width="124" height="96" rx="16" fill={tint} />
          <circle cx="200" cy="152" r="13" {...op(0.95)} />
          <rect x="195" y="158" width="10" height="28" rx="4" {...op(0.95)} />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={80 + i * 18} cy="200" r="5" {...op(0.4)} />)}
          {[0, 1, 2, 3].map((i) => <circle key={`r${i}`} cx={266 + i * 18} cy="200" r="5" {...op(0.4)} />)}
        </g>
      );
    case 'bayes':
      return (
        <g>
          {Array.from({ length: 100 }, (_, i) => {
            const c = i % 20;
            const rr = Math.floor(i / 20);
            const sick = i === 47;
            const fp = [3, 22, 58, 71, 89].includes(i);
            return <circle key={i} cx={68 + c * 14} cy={66 + rr * 30} r="5.5" {...(sick ? { fill: tint } : fp ? op(0.85) : op(0.18))} />;
          })}
          <rect x="190" y="50" width="32" height="132" rx="10" {...line(0.6, 2.5)} />
        </g>
      );
    case 'fallacies':
      return (
        <g>
          <rect x="70" y="56" width="120" height="70" rx="16" {...op(0.85)} />
          <path d="M100 126 L92 150 L124 126" {...op(0.85)} />
          <rect x="210" y="96" width="120" height="70" rx="16" fill={tint} />
          <path d="M300 166 L310 190 L278 166" fill={tint} />
          <path d="M240 118 L300 144 M300 118 L240 144" {...line(0.95, 7)} />
        </g>
      );
    case 'quantifiers':
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <circle key={i} cx={150 + Math.cos(a) * 62} cy={125 + Math.sin(a) * 62} r="11" {...op(0.85)} />; })}
          <circle cx="150" cy="125" r="88" {...line(0.4, 2)} strokeDasharray="5 6" />
          {Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2; return <circle key={`b${i}`} cx={290 + Math.cos(a) * 40} cy={125 + Math.sin(a) * 40} r="9" {...(i === 2 ? { fill: tint } : op(0.25))} />; })}
          <circle cx="290" cy="125" r="60" {...line(0.4, 2)} strokeDasharray="5 6" />
        </g>
      );
    case 'integral': {
      const f = (x: number) => 190 - 120 * Math.sin(((x - 60) / 280) * Math.PI);
      return (
        <g>
          <path d="M50 195 H355 M60 210 V30" {...line(0.35, 2)} />
          {Array.from({ length: 14 }, (_, i) => { const x = 60 + i * 20; return <rect key={i} x={x} y={f(x + 10)} width="18" height={195 - f(x + 10)} {...(i === 7 ? { fill: tint } : op(0.22 + (i % 2) * 0.1))} />; })}
          <polyline points={Array.from({ length: 57 }, (_, i) => { const x = 60 + i * 5; return `${x},${f(x).toFixed(1)}`; }).join(' ')} {...line(0.95, 4)} />
        </g>
      );
    }
    case 'modular':
      return (
        <g>
          <circle cx="200" cy="125" r="92" {...line(0.3, 2)} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * 2 * Math.PI - Math.PI / 2;
            return <circle key={i} cx={200 + 92 * Math.cos(a)} cy={125 + 92 * Math.sin(a)} r={i === 3 ? 13 : 7} {...(i === 3 ? { fill: tint } : op(0.35 + (i % 3) * 0.2))} />;
          })}
          <path d={sector(200, 125, 62, -Math.PI / 2, Math.PI * 1.25)} {...line(0.85, 4)} strokeDasharray="6 7" fill="none" />
          <path d="M200 125 L246 79" {...line(0.95, 5)} />
          <circle cx="200" cy="125" r="8" {...op(0.95)} />
        </g>
      );
    case 'climate':
      return (
        <g>
          <circle cx="200" cy="250" r="150" {...op(0.16)} />
          <circle cx="200" cy="250" r="112" fill={tint} />
          <path d="M20 250 A180 180 0 0 1 380 250" {...line(0.45, 3)} strokeDasharray="4 8" />
          <circle cx="330" cy="40" r="22" {...op(0.9)} />
          <path d="M312 56 L230 150" {...line(0.85, 3)} />
          <path d="M230 150 L170 96 L118 150" {...line(0.6, 3)} strokeDasharray="5 6" />
          <path d="M118 150 L94 128" {...line(0.35, 3)} strokeDasharray="5 6" />
        </g>
      );
    case 'entropy': {
      const r = rand(11);
      return (
        <g>
          <rect x="40" y="50" width="140" height="150" rx="14" {...line(0.6, 2.5)} />
          <rect x="220" y="50" width="140" height="150" rx="14" {...line(0.6, 2.5)} />
          {Array.from({ length: 16 }, (_, i) => <circle key={`a${i}`} cx={62 + (i % 4) * 16} cy={84 + Math.floor(i / 4) * 26} r="6" {...op(0.9)} />)}
          {Array.from({ length: 16 }, (_, i) => <circle key={`b${i}`} cx={236 + r() * 108} cy={66 + r() * 118} r="6" {...(i === 5 ? { fill: tint } : op(0.55 + r() * 0.35))} />)}
          <path d="M188 125 H212" {...line(0.85, 4)} />
          <path d="M204 117 L213 125 L204 133" {...line(0.85, 4)} />
        </g>
      );
    }
    case 'agents':
      return (
        <g>
          <circle cx="200" cy="125" r="74" {...line(0.3, 2)} strokeDasharray="4 7" />
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * 2 * Math.PI - Math.PI / 2;
            const x = 200 + 74 * Math.cos(a);
            const y = 125 + 74 * Math.sin(a);
            return <circle key={i} cx={x} cy={y} r={i === 0 ? 22 : 15} {...(i === 0 ? { fill: tint } : op(0.85))} />;
          })}
          {[0, 1, 2].map((i) => {
            const a = ((i + 0.5) / 3) * 2 * Math.PI - Math.PI / 2;
            return <circle key={`m${i}`} cx={200 + 74 * Math.cos(a)} cy={125 + 74 * Math.sin(a)} r="4" {...op(0.7)} />;
          })}
          {[0, 1, 2].map((i) => <rect key={`t${i}`} x={300 + (i % 2) * 22} y={150 + i * 26} width="40" height="18" rx="5" {...op(0.2 + i * 0.15)} />)}
          <path d="M264 162 H300" {...line(0.5, 2.5)} strokeDasharray="3 5" />
        </g>
      );
    default:
      return (
        <g>
          {[110, 86, 62, 38].map((r, i) => <circle key={r} cx="200" cy="125" r={r} {...op(0.08 + i * 0.12)} />)}
          <circle cx="200" cy="125" r="20" fill={tint} />
        </g>
      );
  }
}

/** Generated course cover; fills its container (object-fit: cover semantics). */
export function Cover({ motif, color, title }: { motif?: string; color?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const c = color ?? '#5145f0';
  const light = mix(c, '#ffffff', 0.16);
  const dark = mix(c, '#05050a', 0.5);
  const tint = mix(c, '#ffffff', 0.62);
  return (
    <svg className="cover-svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <radialGradient id={`gl${id}`} cx="0.82" cy="0.08" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <pattern id={`dt${id}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#fff" fillOpacity="0.1" />
        </pattern>
      </defs>
      <rect width="400" height="250" fill={`url(#bg${id})`} />
      <rect width="400" height="250" fill={`url(#dt${id})`} />
      <rect width="400" height="250" fill={`url(#gl${id})`} />
      <Motif name={motif ?? 'default'} tint={tint} />
    </svg>
  );
}

/** Small square artwork (same art, cropped). */
export function ArtTile({ motif, color }: { motif?: string; color?: string }) {
  return <Cover motif={motif} color={color} />;
}

/** Animated completion mark: filled disc, ring and a check that draws itself. */
export function DoneMark({ reduce = false }: { reduce?: boolean }) {
  return (
    <svg className="done-mark" viewBox="0 0 96 96" aria-hidden="true">
      <circle className="ring" cx="48" cy="48" r="44" strokeWidth="6">
        {!reduce && <animate attributeName="r" from="30" to="44" dur="0.5s" fill="freeze" />}
      </circle>
      <circle cx="48" cy="48" r="36">
        {!reduce && <animate attributeName="r" values="0;40;36" dur="0.45s" fill="freeze" />}
      </circle>
      <path d="M32 49 l11 11 21 -24" strokeDasharray="50" strokeDashoffset={reduce ? 0 : 50}>
        {!reduce && <animate attributeName="stroke-dashoffset" from="50" to="0" begin="0.3s" dur="0.35s" fill="freeze" />}
      </path>
    </svg>
  );
}

/** Restrained particle burst on a canvas. Skipped when motion is reduced. */
export function Confetti({ run = true, reduce = false, color = '#5145f0' }: { run?: boolean; reduce?: boolean; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!run || reduce) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    const colors = [color, mix(color, '#ffffff', 0.45), '#f59e0b', '#fcd34d', mix(color, '#000000', 0.25)];
    const cx = innerWidth / 2;
    const cy = Math.min(innerHeight * 0.3, 260);
    const parts = Array.from({ length: 90 }, (_, i) => {
      const a = (i / 90) * Math.PI * 2 + Math.random() * 0.3;
      const v = 4 + Math.random() * 9;
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, s: 3 + Math.random() * 4, c: colors[i % colors.length], round: Math.random() < 0.4 };
    });
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const age = (t - t0) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += 0.22;
        p.vx *= 0.975;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 0.9) / 0.9);
        ctx.translate(p.x * dpr, p.y * dpr);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, (p.s / 2) * dpr, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.s * dpr, (-p.s / 3) * dpr, p.s * 2 * dpr, (p.s / 1.5) * dpr);
        ctx.restore();
      }
      if (age < 2) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
    };
  }, [run, reduce, color]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

/** Animated count-up number. */
export function CountUp({ to, duration = 900, reduce = false, prefix = '' }: { to: number; duration?: number; reduce?: boolean; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = `${prefix}${to}`;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      el.textContent = `${prefix}${Math.round(to * (1 - Math.pow(1 - k, 3)))}`;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, reduce, prefix]);
  return <span ref={ref}>{prefix}0</span>;
}
