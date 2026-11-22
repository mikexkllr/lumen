/** Buckets, match, pixels, bits, logic gates, Venn diagrams and networks. */
import { useEffect, useRef, useState } from 'react';
import {
  bucketIds,
  bucketTargets,
  bitsValue,
  cellLabel,
  circuitDepths,
  edgeIndex,
  evaluateCircuit,
  formatNumber,
  gateLabel,
  isLocked,
  itemIds,
  pathCost,
  pixelSize,
  regionName,
  vennRegions,
  vennWidget,
  networkWidget,
  gatesWidget,
  type BitsParams,
  type BitsState,
  type BucketsParams,
  type BucketsState,
  type GatesParams,
  type GatesState,
  type MatchParams,
  type MatchState,
  type NetworkParams,
  type NetworkState,
  type PixelsParams,
  type PixelsState,
  type VennParams,
  type VennState,
} from '@lumen/engine';
import { inline } from '../lib/markdown.tsx';
import { tr, type WidgetViewProps } from './types.ts';

// ---------------- Buckets ----------------

export function BucketsView({ params, state, dispatch, readOnly, locale, result }: WidgetViewProps<BucketsParams, BucketsState>) {
  const ids = itemIds(params);
  const bids = bucketIds(params);
  const target = bucketTargets(params);
  const label = (id: string) => params.items[ids.indexOf(id)]?.label ?? id;
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null);
  const start = useRef<{ id: string; x: number; y: number } | null>(null);
  const pool = state.order.filter((id) => !state.placed[id]);

  const bucketAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-bucket]') as HTMLElement | null;
    return el?.dataset.bucket ?? null;
  };
  const down = (id: string) => (e: React.PointerEvent) => {
    if (readOnly) return;
    start.current = { id, x: e.clientX, y: e.clientY };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
      setDrag({ id: s.id, x: e.clientX, y: e.clientY, over: bucketAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (drag && s) {
        const b = bucketAt(e.clientX, e.clientY);
        if (b) dispatch({ type: 'place', item: s.id, bucket: b });
        setActive(null);
      }
      setDrag(null);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  }, [drag, dispatch]);

  const cardResult = (id: string) => (result && state.placed[id] ? (target[id] === state.placed[id] ? 'ok' : result === 'bad' ? 'bad' : undefined) : undefined);
  return (
    <div>
      <div className="bk-pool" role="list" aria-label={tr(locale, 'Karten', 'Cards')}>
        {pool.length === 0 && <span className="small faint" style={{ alignSelf: 'center' }}>{tr(locale, 'Alle Karten sind verteilt.', 'All cards are sorted.')}</span>}
        {pool.map((id) => (
          <span role="listitem" key={id} style={{ display: 'contents' }}>
          <button
            type="button"
            className={`bk-card ${drag?.id === id ? 'dragging' : ''}`}
            aria-pressed={active === id}
            disabled={readOnly}
            onPointerDown={down(id)}
            onClick={() => !drag && setActive(active === id ? null : id)}
          >
            {inline(label(id), id)}
          </button>
          </span>
        ))}
      </div>
      <div className="bk-buckets" style={{ ['--n' as string]: params.buckets.length === 4 ? 2 : params.buckets.length }}>
        {params.buckets.map((b, i) => {
          const bid = bids[i];
          const inside = state.order.filter((id) => state.placed[id] === bid);
          return (
            <div
              key={bid}
              data-bucket={bid}
              className={`bk-bucket ${active ? 'armed' : ''} ${drag?.over === bid ? 'over' : ''}`}
              role="button"
              tabIndex={readOnly ? -1 : 0}
              aria-label={tr(locale, `Gruppe ${b.label}${active ? `: ${label(active)} hier ablegen` : ''}`, `Group ${b.label}${active ? `: drop ${label(active)} here` : ''}`)}
              onClick={() => { if (active && !readOnly) { dispatch({ type: 'place', item: active, bucket: bid }); setActive(null); } }}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && active && !readOnly) { e.preventDefault(); dispatch({ type: 'place', item: active, bucket: bid }); setActive(null); } }}
            >
              <span className="bk-title"><span>{inline(b.label, bid)}</span><span className="tnum">{inside.length}</span></span>
              <span className="bk-items">
                {inside.map((id) => (
                  <button key={id} type="button" className="bk-card" data-result={cardResult(id)} disabled={readOnly} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'unplace', item: id }); }} aria-label={tr(locale, `${label(id)} zurücklegen`, `Return ${label(id)}`)}>
                    {inline(label(id), id)}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      {!readOnly && <p className="small faint center" style={{ marginTop: 10 }}>{tr(locale, 'Ziehe die Karten – oder tippe erst eine Karte, dann eine Gruppe.', 'Drag cards – or tap a card, then a group.')}</p>}
      {drag && <span className="bk-card bk-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{inline(label(drag.id), 'g')}</span>}
    </div>
  );
}

// ---------------- Match ----------------

const PAIR_COLORS = ['#5145f0', '#0f9d58', '#e8590c', '#c2255c', '#0c8599', '#9c36b5'];

export function MatchView({ params, state, dispatch, readOnly, locale, result }: WidgetViewProps<MatchParams, MatchState>) {
  const [sel, setSel] = useState<{ side: 'l' | 'r'; i: number } | null>(null);
  const pairOfRight = (r: number) => state.links.indexOf(r);
  const pick = (side: 'l' | 'r', i: number) => {
    if (readOnly) return;
    if (!sel || sel.side === side) {
      if (side === 'l' && state.links[i] >= 0 && !sel) { dispatch({ type: 'unlink', left: i }); }
      setSel(sel && sel.side === side && sel.i === i ? null : { side, i });
      return;
    }
    const left = side === 'l' ? i : sel.i;
    const right = side === 'r' ? i : sel.i;
    dispatch({ type: 'link', left, right });
    setSel(null);
  };
  return (
    <div className="mt-cols" role="group">
      {(params.leftTitle || params.rightTitle) && (
        <>
          <span className="mt-title">{params.leftTitle}</span>
          <span className="mt-title">{params.rightTitle}</span>
        </>
      )}
      <div className="mt-col">
        {params.pairs.map((p, i) => {
          const linked = state.links[i] >= 0;
          const res = result && linked ? (state.links[i] === i ? 'ok' : result === 'bad' ? 'bad' : undefined) : undefined;
          return (
            <button key={i} type="button" className="mt-item" data-pair={linked ? i : undefined} data-result={res} style={{ ['--pc' as string]: PAIR_COLORS[i % PAIR_COLORS.length] }} aria-pressed={sel?.side === 'l' && sel.i === i} disabled={readOnly} onClick={() => pick('l', i)}>
              <span className="mt-dot" aria-hidden="true">{linked ? i + 1 : ''}</span>
              <span>{inline(p.left, `l${i}`)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-col">
        {state.right.map((r) => {
          const l = pairOfRight(r);
          const res = result && l >= 0 ? (l === r ? 'ok' : result === 'bad' ? 'bad' : undefined) : undefined;
          return (
            <button key={r} type="button" className="mt-item" data-pair={l >= 0 ? l : undefined} data-result={res} style={{ ['--pc' as string]: PAIR_COLORS[(l >= 0 ? l : 0) % PAIR_COLORS.length] }} aria-pressed={sel?.side === 'r' && sel.i === r} disabled={readOnly} onClick={() => pick('r', r)} aria-label={`${params.pairs[r].right}${l >= 0 ? tr(locale, `, verbunden mit ${params.pairs[l].left}`, `, linked to ${params.pairs[l].left}`) : ''}`}>
              <span className="mt-dot" aria-hidden="true">{l >= 0 ? l + 1 : ''}</span>
              <span>{inline(params.pairs[r].right, `r${r}`)}</span>
            </button>
          );
        })}
      </div>
      {!readOnly && <p className="small faint center" style={{ gridColumn: '1 / -1', margin: '4px 0 0' }}>{tr(locale, 'Tippe links und rechts, um ein Paar zu bilden.', 'Tap left and right to make a pair.')}</p>}
    </div>
  );
}

// ---------------- Pixels ----------------

export function PixelsView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<PixelsParams, PixelsState>) {
  const { rows, cols } = pixelSize(params);
  const painting = useRef<number | null>(null);
  const on = state.grid.reduce((s, row) => s + row.filter((v) => v > 0).length, 0);
  const paint = (r: number, c: number, first: boolean) => {
    if (readOnly || isLocked(params, r, c)) return;
    if (params.rule === 'lightsout') {
      if (first) dispatch({ type: 'toggle', r, c });
      return;
    }
    if (first) {
      const v = (state.grid[r][c] + 1) % params.shades;
      painting.current = v;
      dispatch({ type: 'set', r, c, v });
    } else if (painting.current !== null && state.grid[r][c] !== painting.current) dispatch({ type: 'set', r, c, v: painting.current });
  };
  useEffect(() => {
    const up = () => (painting.current = null);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, []);
  const labelled = !!(params.numbers || params.labels);
  return (
    <div>
      <div
        className="px-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: Math.min(440, cols * (labelled ? 44 : 40)), ['--px-on' as string]: params.color }}
        role="grid"
        aria-label={tr(locale, `Raster ${rows} mal ${cols}`, `Grid ${rows} by ${cols}`)}
        onPointerMove={(e) => {
          if (painting.current === null) return;
          const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const r = el?.dataset.r;
          const c = el?.dataset.c;
          if (r !== undefined && c !== undefined) paint(Number(r), Number(c), false);
        }}
      >
        {state.grid.map((row, r) =>
          row.map((v, c) => {
            const lab = cellLabel(params, r, c);
            const locked = isLocked(params, r, c);
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                role="gridcell"
                className={`px-cell ${locked ? 'locked' : ''}`}
                data-v={v}
                data-r={r}
                data-c={c}
                disabled={readOnly}
                aria-pressed={v > 0}
                aria-label={`${lab ?? tr(locale, `Zeile ${r + 1}, Spalte ${c + 1}`, `Row ${r + 1}, column ${c + 1}`)}${locked ? tr(locale, ' (fest)', ' (fixed)') : ''}`}
                onPointerDown={(e) => { e.preventDefault(); paint(r, c, true); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!readOnly && !locked) dispatch({ type: 'toggle', r, c }); } }}
                style={{ fontSize: cols > 8 ? '0.6875rem' : undefined }}
              >
                {lab}
              </button>
            );
          }),
        )}
        {(params.mirror === 'vertical' || params.mirror === 'both') && <span className="px-axis v" aria-hidden="true" />}
        {(params.mirror === 'horizontal' || params.mirror === 'both') && <span className="px-axis h" aria-hidden="true" />}
      </div>
      {params.counter && <p className="px-counter">{tr(locale, `${on} ${on === 1 ? 'Feld' : 'Felder'} gefärbt`, `${on} cell${on === 1 ? '' : 's'} filled`)}</p>}
    </div>
  );
}

// ---------------- Bits ----------------

export function BitsView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<BitsParams, BitsState>) {
  const n = params.bits;
  const value = bitsValue(state.bits);
  return (
    <div>
      <div className="bits" role="group" aria-label={tr(locale, 'Bits', 'Bits')}>
        {state.bits.map((b, i) => {
          const pv = 2 ** (n - 1 - i);
          const locked = params.locked.includes(i);
          return (
            <div className="bit" key={i}>
              {params.placeValues && <span className="pv">{pv}</span>}
              <button type="button" aria-pressed={b === 1} disabled={readOnly || locked} onClick={() => dispatch({ type: 'toggle', index: i })} aria-label={tr(locale, `Stelle ${pv}: ${b}`, `Place ${pv}: ${b}`)}>
                {b}
              </button>
              {params.labels?.[i] && <span className="cap">{params.labels[i]}</span>}
            </div>
          );
        })}
      </div>
      {params.showValue && (
        <p className="bits-value" aria-live="polite">
          <strong>{value}</strong>
          {params.placeValues ? state.bits.map((b, i) => (b ? 2 ** (n - 1 - i) : null)).filter((x) => x !== null).join(' + ') || '0' : tr(locale, 'Dezimalwert', 'decimal value')}
        </p>
      )}
    </div>
  );
}

// ---------------- Gates ----------------

export function GatesView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<GatesParams, GatesState>) {
  const depth = circuitDepths(params);
  const vals = evaluateCircuit(params, state.inputs, state.types, state.mem);
  const cols = Math.max(...Object.values(depth)) + 1;
  const byCol: string[][] = Array.from({ length: cols }, () => []);
  for (const i of params.inputs) byCol[0].push(i.id);
  for (const g of params.gates) byCol[depth[g.id]].push(g.id);
  for (const o of params.outputs) byCol[cols - 1].push(o.id);
  const colW = 120;
  const W = Math.max(300, cols * colW);
  const rowsMax = Math.max(...byCol.map((c) => c.length));
  const H = Math.max(140, rowsMax * 78 + 20);
  const pos: Record<string, { x: number; y: number }> = {};
  byCol.forEach((ids, c) => ids.forEach((id, k) => (pos[id] = { x: 40 + c * ((W - 80) / Math.max(1, cols - 1)), y: (H / (ids.length + 1)) * (k + 1) })));
  const gateW = 66;
  const gateH = 44;
  const outPort = (id: string) => {
    const p = pos[id];
    if (params.inputs.some((i) => i.id === id)) return { x: p.x + 24, y: p.y };
    return { x: p.x + gateW / 2, y: p.y };
  };
  const inPort = (id: string, k: number, n: number) => {
    const p = pos[id];
    if (params.outputs.some((o) => o.id === id)) return { x: p.x - 16, y: p.y };
    return { x: p.x - gateW / 2, y: p.y - gateH / 2 + (gateH / (n + 1)) * (k + 1) };
  };
  const wire = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    // feedback runs back to the left: route it in a loop below both ends
    if (b.x <= a.x + 8) {
      const low = Math.min(H - 8, Math.max(a.y, b.y) + gateH * 0.75);
      return `M${a.x},${a.y} C${a.x + 26},${a.y} ${a.x + 26},${low} ${a.x},${low} L${b.x},${low} C${b.x - 26},${low} ${b.x - 26},${b.y} ${b.x},${b.y}`;
    }
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  };
  const wires: { d: string; on: boolean; key: string }[] = [];
  for (const g of params.gates) g.in.forEach((src, k) => pos[src] && wires.push({ key: `${g.id}-${k}`, d: wire(outPort(src), inPort(g.id, k, g.in.length)), on: vals[src] === 1 }));
  for (const o of params.outputs) pos[o.from] && wires.push({ key: `o-${o.id}`, d: wire(outPort(o.from), inPort(o.id, 0, 1)), on: vals[o.from] === 1 });
  const picks = params.gates.some((g) => g.options?.length);
  const switches = params.inputs.some((i) => !i.fixed);

  return (
    <div className="gates">
      <div className="svg-wrap" style={{ maxWidth: Math.min(580, W * 1.7), margin: '0 auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={gatesWidget.describe(state, params, locale)}>
          <rect x="0" y="0" width={W} height={H} rx="16" fill="var(--surface)" stroke="var(--line)" />
          {wires.map((w) => <path key={w.key} d={w.d} className={`wire ${w.on ? 'on' : ''}`} />)}
          {params.inputs.map((i) => {
            const p = pos[i.id];
            const on = state.inputs[i.id] === 1;
            const can = !readOnly && !i.fixed;
            return (
              <g key={i.id} className={`sw ${on ? 'on' : ''} ${i.fixed ? 'fixed' : ''}`} transform={`translate(${p.x - 22},${p.y - 13})`} role={can ? 'switch' : undefined} aria-checked={can ? on : undefined} aria-label={can ? `${tr(locale, 'Schalter', 'Switch')} ${i.label ?? i.id}` : undefined} tabIndex={can ? 0 : undefined}
                onClick={() => can && dispatch({ type: 'toggle', id: i.id })}
                onKeyDown={(e) => { if (can && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); dispatch({ type: 'toggle', id: i.id }); } }}>
                <rect width="46" height="26" rx="13" />
                <circle cx="13" cy="13" r="10" style={{ transform: on ? 'translateX(20px)' : undefined }} />
                <text className="lbl" x="23" y="-8" textAnchor="middle">{i.label ?? i.id} = {state.inputs[i.id]}</text>
              </g>
            );
          })}
          {params.gates.map((g) => {
            const p = pos[g.id];
            const can = !readOnly && !!g.options?.length;
            const type = state.types[g.id];
            return (
              <g key={g.id} className={`gate ${vals[g.id] === 1 ? 'on' : ''} ${g.options?.length ? 'pick' : ''}`} transform={`translate(${p.x - gateW / 2},${p.y - gateH / 2})`} role={can ? 'button' : undefined} tabIndex={can ? 0 : undefined}
                aria-label={can ? tr(locale, `Gatter ${g.id}: ${gateLabel(type, locale)} – antippen zum Wechseln`, `Gate ${g.id}: ${type} – tap to change`) : undefined}
                onClick={() => can && dispatch({ type: 'cycle', id: g.id })}
                onKeyDown={(e) => { if (can && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); dispatch({ type: 'cycle', id: g.id }); } }}>
                <rect width={gateW} height={gateH} rx="12" />
                <text x={gateW / 2} y={gateH / 2 + 5} textAnchor="middle">{gateLabel(type, locale)}</text>
              </g>
            );
          })}
          {params.outputs.map((o) => {
            const p = pos[o.id];
            const on = vals[o.id] === 1;
            return (
              <g key={o.id} className={`lamp ${on ? 'on' : ''}`}>
                <circle className="halo" cx={p.x + 4} cy={p.y} r="26" opacity="0.25" style={{ opacity: on ? 0.25 : 0 }} />
                <circle className="bulb" cx={p.x + 4} cy={p.y} r="16" />
                <text className="lbl" x={p.x + 4} y={p.y - 22} textAnchor="middle">{o.label ?? o.id}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {!readOnly && (picks || switches) && (
        <p className="hint-line">{picks && switches ? tr(locale, 'Schalter umlegen und gestrichelte Gatter antippen.', 'Flip switches and tap dashed gates.') : picks ? tr(locale, 'Tippe die gestrichelten Gatter an, um ihre Art zu wechseln.', 'Tap the dashed gates to change their type.') : tr(locale, 'Tippe die Schalter an.', 'Tap the switches.')}</p>
      )}
    </div>
  );
}

// ---------------- Venn ----------------

export function VennView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<VennParams, VennState>) {
  const three = params.sets.length === 3;
  const W = 340;
  const H = three ? 300 : 220;
  const R = three ? 78 : 82;
  const centers = three ? [[132, 118], [208, 118], [170, 184]] : [[128, 112], [212, 112]];
  const inside = (x: number, y: number) => centers.map(([cx, cy]) => Math.hypot(x - cx, y - cy) <= R);
  const regionAt = (x: number, y: number) => {
    const m = inside(x, y);
    const key = ['A', 'B', 'C'].filter((_, i) => m[i]).join('');
    return key || (params.outside ? 'O' : null);
  };
  const ref = useRef<SVGSVGElement>(null);
  const click = (e: React.PointerEvent) => {
    if (readOnly) return;
    const r = ref.current!.getBoundingClientRect();
    const reg = regionAt(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
    if (reg) dispatch({ type: 'toggle', region: reg });
  };
  // Each region = clip to the sets it belongs to, mask out the others.
  const id = useRef(`v${Math.random().toString(36).slice(2, 8)}`).current;
  const regions = vennRegions(params);
  const labelPos: Record<string, [number, number]> = three
    ? { A: [100, 96], B: [240, 96], C: [170, 236], AB: [170, 92], AC: [126, 174], BC: [214, 174], ABC: [170, 142], O: [24, 24] }
    : { A: [92, 116], B: [248, 116], AB: [170, 116], O: [24, 24] };
  return (
    <div className="venn">
      <div className="svg-wrap" style={{ maxWidth: 420, margin: '0 auto' }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={vennWidget.describe(state, params, locale)} onPointerDown={click} style={{ cursor: readOnly ? 'default' : 'pointer' }}>
          <defs>
            {centers.map(([cx, cy], i) => (
              <clipPath key={i} id={`${id}c${i}`}><circle cx={cx} cy={cy} r={R} /></clipPath>
            ))}
            {centers.map(([cx, cy], i) => (
              <mask key={i} id={`${id}m${i}`}><rect width={W} height={H} fill="#fff" /><circle cx={cx} cy={cy} r={R} fill="#000" /></mask>
            ))}
          </defs>
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="16" fill={state.shaded.includes('O') ? 'color-mix(in srgb, var(--accent) 35%, var(--surface))' : 'var(--surface)'} stroke="var(--line-2)" />
          {regions.filter((r) => r !== 'O').map((reg) => {
            const ins = ['A', 'B', 'C'].map((l, i) => (reg.includes(l) ? i : -1)).filter((i) => i >= 0);
            const outs = centers.map((_, i) => i).filter((i) => !ins.includes(i));
            let node: React.ReactNode = <rect width={W} height={H} className={`region ${state.shaded.includes(reg) ? 'on' : ''}`} />;
            for (const o of outs) node = <g mask={`url(#${id}m${o})`}>{node}</g>;
            for (const i of ins) node = <g clipPath={`url(#${id}c${i})`}>{node}</g>;
            return <g key={reg}>{node}</g>;
          })}
          {centers.map(([cx, cy], i) => <circle key={i} className="outline" cx={cx} cy={cy} r={R} />)}
          {params.sets.map((s, i) => {
            const [cx, cy] = centers[i];
            const ly = three ? (i === 2 ? cy + R + 18 : cy - R - 10) : cy - R - 10;
            return <text key={s} className="set-label" x={three && i < 2 ? cx + (i === 0 ? -30 : 30) : cx} y={Math.min(H - 6, Math.max(16, ly))} textAnchor="middle">{s}</text>;
          })}
          {Object.entries(params.counts).map(([reg, v]) => {
            const p = labelPos[reg.toUpperCase().split('').sort().join('')] ?? labelPos[reg];
            return p ? <text key={reg} x={p[0]} y={p[1] + 6} textAnchor="middle" fontSize="17">{v}</text> : null;
          })}
          {params.universe && <text x={W - 14} y={H - 12} textAnchor="end" fontSize="12" fill="var(--ink-3)">{params.universe}</text>}
        </svg>
      </div>
      {!readOnly && (
        <div className="venn-keys row wrap" style={{ justifyContent: 'center', gap: 6, marginTop: 10 }} role="group" aria-label={tr(locale, 'Bereiche', 'Regions')}>
          {regions.map((reg) => (
            <button key={reg} type="button" className="chip" style={{ height: 30, fontSize: '0.75rem' }} aria-pressed={state.shaded.includes(reg)} onClick={() => dispatch({ type: 'toggle', region: reg })} title={regionName(params, reg, locale)}>
              {regionName(params, reg, locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Network ----------------

const NODE_COLORS = ['var(--surface)', '#5145f0', '#e8590c', '#0f9d58', '#c2255c'];

export function NetworkView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<NetworkParams, NetworkState>) {
  const A = params.aspect;
  const W = 100;
  const H = 100 * A;
  const pad = 6;
  const px = (x: number) => pad + (x / 100) * (W - 2 * pad);
  const py = (y: number) => pad + (y / 100) * (H - 2 * pad);
  const node = (id: string) => params.nodes.find((n) => n.id === id)!;
  const onPath = new Set<number>();
  for (let i = 1; i < state.path.length; i++) onPath.add(edgeIndex(params, state.path[i - 1], state.path[i]));
  const showW = params.weights ?? params.edges.some((e) => e.w !== undefined);
  const last = state.path[state.path.length - 1];
  const tapNode = (id: string) => {
    if (readOnly) return;
    if (params.mode === 'path') dispatch({ type: 'visit', id });
    else if (params.mode === 'color') dispatch({ type: 'color', id });
  };
  const cost = pathCost(params, state.path);
  const selW = state.edges.reduce((s, k) => s + (params.edges[k].w ?? 1), 0);
  const unit = params.unit ? ` ${params.unit}` : '';
  // Instructions only while the learner can act; display-only visuals stay clean.
  let info: string | null = null;
  if (params.mode === 'path') {
    if (state.path.length > 1) info = `${state.path.map((id) => node(id).label ?? id).join(' → ')} · ${formatNumber(cost, locale)}${unit}`;
    else if (!readOnly && params.start) info = tr(locale, `Start bei ${node(params.start).label ?? params.start} – tippe den nächsten Punkt.`, `Start at ${node(params.start).label ?? params.start} – tap the next node.`);
  } else if (params.mode === 'select') {
    if (!readOnly || state.edges.length) info = tr(locale, `Gewählt: ${state.edges.length} Verbindungen · ${formatNumber(selW, locale)}${unit}`, `Selected: ${state.edges.length} edges · ${selW}${unit}`);
  } else if (!readOnly) {
    info = tr(locale, 'Tippe Punkte an, um die Farbe zu wechseln.', 'Tap nodes to change their colour.');
  }
  return (
    <div className="net">
      <div className="svg-wrap" style={{ maxWidth: 520, margin: '0 auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={networkWidget.describe(state, params, locale)}>
          <rect x="0.3" y="0.3" width={W - 0.6} height={H - 0.6} rx="4" fill="var(--surface)" stroke="var(--line)" strokeWidth="0.3" />
          {params.edges.map((e, k) => {
            const a = node(e.a);
            const b = node(e.b);
            const on = onPath.has(k) || state.edges.includes(k);
            const mx = (px(a.x) + px(b.x)) / 2;
            const my = (py(a.y) + py(b.y)) / 2;
            return (
              <g key={k}>
                <line className={`edge ${on ? 'on' : ''}`} x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} />
                {params.mode === 'select' && !readOnly && (
                  <line className="edge-hit" x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} role="checkbox" aria-checked={state.edges.includes(k)} tabIndex={0} aria-label={`${a.label ?? a.id}–${b.label ?? b.id}${e.w !== undefined ? ` (${formatNumber(e.w, locale)}${unit})` : ''}`}
                    onClick={() => dispatch({ type: 'edge', index: k })} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dispatch({ type: 'edge', index: k }); } }} />
                )}
                {showW && e.w !== undefined && (
                  <g className={`w-label ${on ? 'on' : ''}`} pointerEvents="none">
                    <rect x={mx - 4} y={my - 2.8} width="8" height="5.6" rx="2.8" />
                    <text x={mx} y={my + 1.2} textAnchor="middle">{formatNumber(e.w, locale)}</text>
                  </g>
                )}
              </g>
            );
          })}
          {params.nodes.map((n) => {
            const inPath = state.path.includes(n.id);
            const color = state.colors[n.id] ?? 0;
            const clickable = !readOnly && params.mode !== 'select';
            const text = n.label ?? n.id;
            // Longer names get a pill instead of a circle so they never overflow.
            const pill = text.length > 2;
            const hw = pill ? text.length * 1.3 + 2.4 : 4.6;
            const fillStyle = params.mode === 'color' && color ? { fill: NODE_COLORS[color], stroke: NODE_COLORS[color] } : undefined;
            return (
              <g key={n.id} className={`node ${inPath ? 'in' : ''} ${last === n.id ? 'last' : ''} ${color ? 'colored' : ''}`} transform={`translate(${px(n.x)},${py(n.y)})`} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `${n.label ?? n.id}${params.mode === 'color' ? tr(locale, `, Farbe ${color || 'keine'}`, `, colour ${color || 'none'}`) : inPath ? tr(locale, ', auf der Route', ', on the route') : ''}` : undefined}
                onClick={() => tapNode(n.id)} onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tapNode(n.id); } }} style={{ cursor: clickable ? 'pointer' : 'default' }}>
                {pill ? (
                  <>
                    <rect className="ring" x={-hw - 1.8} y={-6.4} width={2 * hw + 3.6} height={12.8} rx={6.4} />
                    <rect className="n" x={-hw} y={-4.6} width={2 * hw} height={9.2} rx={4.6} style={fillStyle} />
                  </>
                ) : (
                  <>
                    <circle className="ring" r="6.4" />
                    <circle className="n" r="4.6" style={fillStyle} />
                  </>
                )}
                <text y="1.5" textAnchor="middle">{text}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {info && (
        <div className="net-info" aria-live="polite">
          <span>{info}</span>
          {params.mode === 'path' && state.path.length > 1 && !readOnly && <button type="button" className="btn small quiet" onClick={() => dispatch({ type: 'undo' })}>{tr(locale, 'Schritt zurück', 'Undo')}</button>}
        </div>
      )}
    </div>
  );
}
