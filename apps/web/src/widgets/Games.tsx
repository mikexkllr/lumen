/** Game-like widgets: Nim vs computer, Tower of Hanoi, angle dial, rectangle builder, swap sorting. */
import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  angleWidget,
  canMove,
  formatNumber,
  hanoiWidget,
  minMoves,
  minSwaps,
  nimWidget,
  rectWidget,
  snapAngle,
  swapWidget,
  type AngleParams,
  type AngleState,
  type HanoiParams,
  type HanoiState,
  type NimParams,
  type NimState,
  type RectParams,
  type RectState,
  type SwapParams,
  type SwapState,
} from '@lumen/engine';
import { Icon } from '../components/ui.tsx';
import { tr, type WidgetViewProps } from './types.ts';

// ---------------- Nim ----------------

export function NimView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<NimParams, NimState>) {
  const [hover, setHover] = useState<{ pile: number; k: number } | null>(null);
  const lastMove = state.history[state.history.length - 1];
  // Highlight the computer's stones only while its move is the latest one.
  const lastC = lastMove?.who === 'computer' ? lastMove : undefined;
  const max = params.maxTake;
  const takeFor = (pile: number, k: number) => state.piles[pile] - k;
  const can = (pile: number, k: number) => !readOnly && !state.over && k < state.piles[pile] && (!max || takeFor(pile, k) <= max);
  let status: string;
  if (state.over) status = state.winner === 'player' ? tr(locale, 'Gewonnen! Du hast den letzten Stein genommen.', 'You won! You took the last stone.') : tr(locale, 'Verloren – der Computer hat den letzten Stein.', 'Lost – the computer took the last stone.');
  else if (lastC) status = tr(locale, `Computer nimmt ${lastC.take} aus Reihe ${lastC.pile + 1}. Du bist dran.`, `Computer takes ${lastC.take} from row ${lastC.pile + 1}. Your turn.`);
  else status = tr(locale, 'Du bist dran. Tippe auf einen Stein – er und alle rechts davon werden genommen.', 'Your turn. Tap a stone – it and all to its right are taken.');
  return (
    <div className="nim" aria-label={nimWidget.describe(state, params, locale)} role="group">
      <p className="nim-rule">{max ? tr(locale, `Nimm 1 bis ${max} Steine aus einer Reihe. Wer den letzten nimmt, gewinnt.`, `Take 1 to ${max} stones from one row. Taking the last one wins.`) : tr(locale, 'Nimm beliebig viele Steine aus einer Reihe. Wer den letzten nimmt, gewinnt.', 'Take any number from one row. Taking the last one wins.')}</p>
      <div className="nim-piles">
        {params.piles.map((orig, pile) => {
          const cur = state.piles[pile];
          // stones removed by the last computer / player move (for a short highlight)
          const compFrom = lastC && lastC.pile === pile ? cur : -1;
          const compTo = lastC && lastC.pile === pile ? cur + lastC.take : -1;
          return (
            <div className="nim-row" key={pile}>
              {params.piles.length > 1 && <span className="nim-label">{pile + 1}</span>}
              <div className="nim-stones" onPointerLeave={() => setHover(null)}>
                {Array.from({ length: orig }, (_, k) => {
                  const alive = k < cur;
                  const willTake = hover && hover.pile === pile && k >= hover.k && alive;
                  const byComp = !alive && k >= compFrom && k < compTo;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`stone ${alive ? '' : 'gone'} ${willTake ? 'take' : ''} ${byComp ? 'comp' : ''}`}
                      disabled={!can(pile, k)}
                      onPointerEnter={() => can(pile, k) && setHover({ pile, k })}
                      onFocus={() => can(pile, k) && setHover({ pile, k })}
                      onClick={() => { dispatch({ type: 'take', pile, n: takeFor(pile, k) }); setHover(null); }}
                      aria-label={alive ? tr(locale, `Reihe ${pile + 1}: ${takeFor(pile, k)} nehmen`, `Row ${pile + 1}: take ${takeFor(pile, k)}`) : tr(locale, 'genommen', 'taken')}
                    />
                  );
                })}
              </div>
              <span className="nim-count tnum">{cur}</span>
            </div>
          );
        })}
      </div>
      <div className={`nim-status ${state.over ? (state.winner === 'player' ? 'won' : 'lost') : ''}`} role="status" aria-live="polite">
        <Icon name={state.over ? (state.winner === 'player' ? 'trophy' : 'cpu') : 'cpu'} size={16} />
        <span>{status}</span>
        {state.over && state.winner === 'computer' && !readOnly && (
          <button type="button" className="btn small primary" onClick={() => dispatch({ type: 'reset' })}><Icon name="reset" size={14} /> {tr(locale, 'Neues Spiel', 'New game')}</button>
        )}
      </div>
    </div>
  );
}

// ---------------- Hanoi ----------------

export function HanoiView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<HanoiParams, HanoiState>) {
  const [sel, setSel] = useState<number | null>(null);
  const [bad, setBad] = useState<number | null>(null);
  const names = ['A', 'B', 'C'];
  const tap = (i: number) => {
    if (readOnly) return;
    if (sel === null) {
      if (state.pegs[i].length) setSel(i);
      return;
    }
    if (sel === i) return setSel(null);
    if (canMove(state, sel, i)) dispatch({ type: 'move', from: sel, to: i });
    else {
      setBad(i);
      setTimeout(() => setBad(null), 450);
    }
    setSel(null);
  };
  const n = params.disks;
  return (
    <div className="hanoi" role="group" aria-label={hanoiWidget.describe(state, params, locale)}>
      <div className="hanoi-pegs">
        {state.pegs.map((peg, i) => (
          <button key={i} type="button" className={`peg ${sel === i ? 'sel' : ''} ${bad === i ? 'bad' : ''} ${i === params.target ? 'target' : ''}`} onClick={() => tap(i)} disabled={readOnly} aria-pressed={sel === i} aria-label={tr(locale, `Stab ${names[i]}${i === params.target ? ' (Ziel)' : ''}: ${peg.length} Scheiben`, `Peg ${names[i]}${i === params.target ? ' (target)' : ''}: ${peg.length} disks`)}>
            <span className="rod" />
            <span className="disks">
              {peg.map((d, k) => (
                <motion.span
                  key={d}
                  layoutId={`disk-${d}`}
                  className="disk"
                  style={{ width: `${30 + (d / n) * 64}%`, background: `color-mix(in srgb, var(--topic, var(--accent)) ${Math.round(45 + (d / n) * 55)}%, #fff)` }}
                  animate={{ y: sel === i && k === peg.length - 1 ? -14 : 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                />
              ))}
            </span>
            <span className="peg-name">{names[i]}{i === params.target ? ' ★' : ''}</span>
          </button>
        ))}
      </div>
      <p className="hanoi-info tnum">
        {tr(locale, `Züge: ${state.moves}`, `Moves: ${state.moves}`)} · {tr(locale, `Minimum: ${minMoves(n)}`, `Minimum: ${minMoves(n)}`)}
        {params.maxMoves !== undefined && state.moves > params.maxMoves && <span className="warn-text"> · {tr(locale, 'zu viele', 'too many')}</span>}
        {!readOnly && state.moves > 0 && <button type="button" className="btn small quiet" onClick={() => { dispatch({ type: 'reset' }); setSel(null); }}><Icon name="reset" size={14} /> {tr(locale, 'Neu', 'Restart')}</button>}
      </p>
      {!readOnly && <p className="small faint center">{tr(locale, 'Tippe erst einen Stab an, dann den Zielstab. Nie eine große Scheibe auf eine kleine.', 'Tap a peg, then the target peg. Never a big disk on a small one.')}</p>}
    </div>
  );
}

// ---------------- Angle ----------------

export function AngleView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<AngleParams, AngleState>) {
  const ref = useRef<SVGSVGElement>(null);
  const half = params.max <= 180 && !params.trig;
  const W = 300;
  const H = half ? 175 : 300;
  const cx = W / 2;
  const cy = half ? 155 : 150;
  const R = params.trig ? 100 : 118;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (d: number, r = R) => [cx + r * Math.cos(rad(d)), cy - r * Math.sin(rad(d))] as const;
  const setFrom = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - cx;
    const y = cy - ((e.clientY - r.top) / r.height) * H;
    let d = (Math.atan2(y, x) * 180) / Math.PI;
    if (d < 0) d += 360;
    if (half && d > 270) d = 0;
    dispatch({ type: 'set', deg: snapAngle(params, d) });
  };
  const from = params.reference ?? 0;
  const d = state.deg;
  const sweep = ((d - from) % 360 + 360) % 360;
  const [ex, ey] = pt(d);
  const [sx, sy] = pt(from);
  const arcR = params.trig ? 26 : 38;
  const [ax0, ay0] = pt(from, arcR);
  const [ax1, ay1] = pt(d, arcR);
  const cosv = Math.cos(rad(d));
  const sinv = Math.sin(rad(d));
  const ticks = params.showValue && !params.trig ? Array.from({ length: half ? 13 : 24 }, (_, i) => i * 15) : [];
  return (
    <div className="angle-w">
      <div className="svg-wrap" style={{ maxWidth: 360, margin: '0 auto' }}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="slider"
          tabIndex={readOnly ? -1 : 0}
          aria-label={angleWidget.describe(state, params, locale)}
          aria-valuemin={0}
          aria-valuemax={params.max}
          aria-valuenow={params.showValue ? d : undefined}
          onPointerDown={readOnly ? undefined : (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setFrom(e); }}
          onPointerMove={readOnly ? undefined : (e) => e.buttons && setFrom(e)}
          onKeyDown={readOnly ? undefined : (e) => {
            const k = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
            if (k) { e.preventDefault(); dispatch({ type: 'set', deg: d + k * params.snap }); }
          }}
          style={{ cursor: readOnly ? 'default' : 'grab', touchAction: 'none' }}
        >
          <rect x="0" y="0" width={W} height={H} rx="16" fill="var(--surface)" stroke="var(--line)" />
          {params.trig && (
            <g aria-hidden="true">
              <line x1={cx - R - 18} x2={cx + R + 18} y1={cy} y2={cy} stroke="var(--axis)" strokeWidth="1.2" />
              <line y1={cy - R - 18} y2={cy + R + 18} x1={cx} x2={cx} stroke="var(--axis)" strokeWidth="1.2" />
              <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth="1.5" />
              <text x={cx + R + 4} y={cy - 6} fontSize="11" fill="var(--ink-3)">1</text>
              <text x={cx + 5} y={cy - R - 4} fontSize="11" fill="var(--ink-3)">1</text>
            </g>
          )}
          {!params.trig && <path d={half ? `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}` : `M${cx + R},${cy} A${R},${R} 0 1 1 ${cx + R - 0.01},${cy}`} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 5" aria-hidden="true" />}
          {ticks.map((tk) => {
            const [x0, y0] = pt(tk, R + 2);
            const [x1, y1] = pt(tk, R + (tk % 90 === 0 ? 12 : tk % 30 === 0 ? 9 : 5));
            const [lx, ly] = pt(tk, R + 22);
            return (
              <g key={tk} aria-hidden="true">
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--ink-3)" strokeWidth={tk % 30 === 0 ? 1.5 : 1} />
                {tk % 30 === 0 && tk < 360 && H > ly - 4 && <text x={lx} y={ly + 4} fontSize="10" textAnchor="middle" fill="var(--ink-3)">{tk}</text>}
              </g>
            );
          })}
          <path d={`M${cx},${cy} L${ax0},${ay0} A${arcR},${arcR} 0 ${sweep > 180 ? 1 : 0} 0 ${ax1},${ay1} Z`} fill="color-mix(in srgb, var(--topic, var(--accent)) 22%, transparent)" aria-hidden="true" />
          <line x1={cx} y1={cy} x2={sx} y2={sy} stroke="var(--ink-2)" strokeWidth="3" strokeLinecap="round" />
          {params.trig && (
            <g aria-hidden="true">
              <line x1={cx} y1={cy} x2={cx + R * cosv} y2={cy} stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
              <line x1={ex} y1={cy} x2={ex} y2={ey} stroke="var(--amber)" strokeWidth="4" strokeLinecap="round" />
              <text x={cx + (R * cosv) / 2} y={cy + (sinv >= 0 ? 16 : -8)} fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--accent)">cos {formatNumber(Math.round(cosv * 100) / 100, locale)}</text>
              <text x={ex + (cosv >= 0 ? 6 : -6)} y={cy - (R * sinv) / 2} fontSize="11" fontWeight="700" textAnchor={cosv >= 0 ? 'start' : 'end'} fill="var(--amber-deep)">sin {formatNumber(Math.round(sinv * 100) / 100, locale)}</text>
            </g>
          )}
          <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--topic, var(--accent))" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="5" fill="var(--ink-2)" />
          <circle cx={ex} cy={ey} r={readOnly ? 6 : 11} fill="var(--topic, var(--accent))" stroke="var(--surface)" strokeWidth="3" />
          {params.showValue && <text x={cx + (cosv > -0.3 && !params.trig ? -36 : 0)} y={half ? cy - 52 : cy + (params.trig ? 132 : 0) + (params.trig ? 0 : 6)} fontSize="22" fontWeight="750" textAnchor="middle" fill="var(--ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(d, locale)}°</text>}
        </svg>
      </div>
      {!readOnly && <p className="small faint center" style={{ marginTop: 8 }}>{tr(locale, 'Ziehe den Punkt im Kreis – oder nutze die Pfeiltasten.', 'Drag the point around – or use the arrow keys.')}</p>}
    </div>
  );
}

// ---------------- Rectangle ----------------

export function RectView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<RectParams, RectState>) {
  const ref = useRef<SVGSVGElement>(null);
  const C = 26;
  const pad = 14;
  const W = params.maxW * C + pad * 2;
  const H = params.maxH * C + pad * 2;
  const setFrom = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - pad;
    const y = ((e.clientY - r.top) / r.height) * H - pad;
    dispatch({ type: 'set', w: Math.round(x / C), h: params.perimeter ? state.h : Math.round(y / C) });
  };
  const area = state.w * state.h;
  const per = 2 * (state.w + state.h);
  return (
    <div className="rect-w">
      <div className="svg-wrap" style={{ maxWidth: Math.min(460, W * 1.15), margin: '0 auto' }}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={rectWidget.describe(state, params, locale)}
          onPointerDown={readOnly ? undefined : (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setFrom(e); }}
          onPointerMove={readOnly ? undefined : (e) => e.buttons && setFrom(e)}
          style={{ cursor: readOnly ? 'default' : 'nwse-resize', touchAction: 'none' }}
        >
          <rect x="0" y="0" width={W} height={H} rx="14" fill="var(--surface)" stroke="var(--line)" />
          {Array.from({ length: params.maxW + 1 }, (_, i) => <line key={`v${i}`} x1={pad + i * C} x2={pad + i * C} y1={pad} y2={pad + params.maxH * C} stroke="var(--grid)" />)}
          {Array.from({ length: params.maxH + 1 }, (_, i) => <line key={`h${i}`} y1={pad + i * C} y2={pad + i * C} x1={pad} x2={pad + params.maxW * C} stroke="var(--grid)" />)}
          <rect x={pad} y={pad} width={state.w * C} height={state.h * C} rx="4" fill="color-mix(in srgb, var(--topic, var(--accent)) 30%, transparent)" stroke="var(--topic, var(--accent))" strokeWidth="2.5" style={{ transition: 'width 0.15s, height 0.15s' }} />
          <text x={pad + (state.w * C) / 2} y={pad - 3} fontSize="11" textAnchor="middle" fontWeight="700" fill="var(--ink-2)">{state.w}</text>
          <text x={pad + state.w * C + 5} y={pad + (state.h * C) / 2 + 4} fontSize="11" fontWeight="700" fill="var(--ink-2)">{state.h}</text>
          {!readOnly && <circle cx={pad + state.w * C} cy={pad + state.h * C} r="9" fill="var(--topic, var(--accent))" stroke="var(--surface)" strokeWidth="3" />}
        </svg>
      </div>
      <div className="rect-read" aria-live="polite">
        {params.show.includes('area') && <span><strong className="tnum">{area}</strong> {params.unit}² {tr(locale, 'Fläche', 'area')}</span>}
        {params.show.includes('perimeter') && <span><strong className="tnum">{per}</strong> {params.unit} {tr(locale, 'Umfang', 'perimeter')}</span>}
      </div>
      {!readOnly && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 6 }}>
          <button type="button" className="btn small ghost" onClick={() => dispatch({ type: 'set', w: state.w - 1, h: state.h })} aria-label={tr(locale, 'schmaler', 'narrower')}>− {tr(locale, 'Breite', 'width')}</button>
          <button type="button" className="btn small ghost" onClick={() => dispatch({ type: 'set', w: state.w + 1, h: state.h })} aria-label={tr(locale, 'breiter', 'wider')}>+ {tr(locale, 'Breite', 'width')}</button>
          {!params.perimeter && <button type="button" className="btn small ghost" onClick={() => dispatch({ type: 'set', w: state.w, h: state.h - 1 })}>− {tr(locale, 'Höhe', 'height')}</button>}
          {!params.perimeter && <button type="button" className="btn small ghost" onClick={() => dispatch({ type: 'set', w: state.w, h: state.h + 1 })}>+ {tr(locale, 'Höhe', 'height')}</button>}
        </div>
      )}
    </div>
  );
}

// ---------------- Swap ----------------

export function SwapView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<SwapParams, SwapState>) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(...params.values);
  const tap = (pos: number) => {
    if (readOnly) return;
    if (sel === null) return setSel(pos);
    if (sel === pos) return setSel(null);
    if (!params.adjacent || Math.abs(sel - pos) === 1) dispatch({ type: 'swap', i: sel, j: pos });
    setSel(null);
  };
  return (
    <div className="swap" role="group" aria-label={swapWidget.describe(state, params, locale)}>
      <div className="swap-bars">
        {state.order.map((k, pos) => {
          const target = sel !== null && sel !== pos && (!params.adjacent || Math.abs(sel - pos) === 1);
          return (
            <motion.button
              layout
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              key={k}
              type="button"
              className={`bar ${sel === pos ? 'sel' : ''} ${target ? 'target' : ''}`}
              onClick={() => tap(pos)}
              disabled={readOnly}
              aria-pressed={sel === pos}
              aria-label={`${params.labels?.[k] ?? params.values[k]}${tr(locale, `, Position ${pos + 1}`, `, position ${pos + 1}`)}`}
            >
              <span className="bar-fill" style={{ height: `${18 + (params.values[k] / max) * 82}%` }}><span className="bar-v tnum">{params.values[k]}</span></span>
              {params.labels && <span className="bar-l">{params.labels[k]}</span>}
            </motion.button>
          );
        })}
      </div>
      <p className="swap-info tnum">
        {tr(locale, `Tausche: ${state.swaps}`, `Swaps: ${state.swaps}`)}
        {params.maxSwaps !== undefined && ` · ${tr(locale, `höchstens ${params.maxSwaps}`, `at most ${params.maxSwaps}`)}`}
        {params.maxSwaps === undefined && state.swaps > 0 && ` · ${tr(locale, `Minimum ${minSwaps(params)}`, `minimum ${minSwaps(params)}`)}`}
        {!readOnly && state.swaps > 0 && <button type="button" className="btn small quiet" onClick={() => { dispatch({ type: 'reset' }); setSel(null); }}><Icon name="reset" size={14} /> {tr(locale, 'Neu', 'Restart')}</button>}
      </p>
      {!readOnly && <p className="small faint center">{params.adjacent ? tr(locale, 'Tippe zwei Nachbarn an, um sie zu tauschen.', 'Tap two neighbours to swap them.') : tr(locale, 'Tippe zwei Balken an, um sie zu tauschen.', 'Tap two bars to swap them.')}</p>}
    </div>
  );
}
