/** Balance, fraction model, number line and logic grid. */
import { useRef } from 'react';
import {
  balanceSolution,
  cellKey,
  formatTick,
  fractionPieces,
  fractionWidget,
  numberLineWidget,
  shadedCount,
  snapToTick,
  term,
  tickValues,
  balanceWidget,
  type BalanceParams,
  type BalanceState,
  type FractionParams,
  type FractionState,
  type LogicGridParams,
  type LogicGridState,
  type NumberLineParams,
  type NumberLineState,
  type Pan,
  resolveNumber,
} from '@lumen/engine';
import { tr, type WidgetViewProps } from './types.ts';

// ---------------- Balance ----------------

function PanItems({ pan, cx, baseY, reveal }: { pan: Pan; cx: number; baseY: number; reveal: number | null }) {
  const items: ('x' | 'u')[] = [...Array(pan.x).fill('x'), ...Array(pan.units).fill('u')];
  const perRow = 5;
  return (
    <g>
      {items.map((kind, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const n = Math.min(perRow, items.length - row * perRow);
        const x = cx + (col - (n - 1) / 2) * 21;
        const y = baseY - 12 - row * 21;
        return kind === 'x' ? (
          <g key={i}>
            <rect x={x - 10} y={y - 10} width="20" height="20" rx="5" fill="var(--accent)" />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="700" fontStyle="italic" fill="#fff">{reveal ?? 'x'}</text>
          </g>
        ) : (
          <g key={i}>
            <circle cx={x} cy={y} r="8.5" fill="var(--amber)" stroke="var(--surface)" strokeWidth="1.5" />
            <circle cx={x - 2.6} cy={y - 2.8} r="2.4" fill="#fff" fillOpacity="0.45" />
          </g>
        );
      })}
    </g>
  );
}

const TWEEN = { transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)' };

function BalancePan({ base, end, pan, reveal }: { base: { x: number; y: number }; end: { x: number; y: number }; pan: Pan; reveal: number | null }) {
  const hang = 62;
  const { x: ex, y: ey } = base;
  return (
    <g style={{ ...TWEEN, transform: `translate(${end.x - ex}px, ${end.y - ey}px)` }}>
      <line x1={ex} y1={ey} x2={ex - 46} y2={ey + hang} stroke="var(--line-2)" strokeWidth="1.5" />
      <line x1={ex} y1={ey} x2={ex + 46} y2={ey + hang} stroke="var(--line-2)" strokeWidth="1.5" />
      <path d={`M${ex - 58},${ey + hang} Q${ex},${ey + hang + 18} ${ex + 58},${ey + hang} Z`} fill="var(--surface-3)" />
      <PanItems pan={pan} cx={ex} baseY={ey + hang + 4} reveal={reveal} />
    </g>
  );
}

export function BalanceView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<BalanceParams, BalanceState>) {
  const angle = state.tilt * 8;
  const a = (angle * Math.PI) / 180;
  const pivot = { x: 170, y: 70 };
  const L = 104;
  const left = { x: pivot.x - L * Math.cos(a), y: pivot.y - L * Math.sin(a) };
  const right = { x: pivot.x + L * Math.cos(a), y: pivot.y + L * Math.sin(a) };
  const reveal = params.reveal ? balanceSolution(params) : null;
  // x stands alone on one pan and the scale is level: the equation is solved
  const solvedNow = !state.balanced ? null : state.left.x === 1 && state.left.units === 0 && state.right.x === 0 ? state.right.units : state.right.x === 1 && state.right.units === 0 && state.left.x === 0 ? state.left.units : null;
  const allow = new Set(params.allow);
  const sides: ('both' | 'left' | 'right')[] = params.oneSided ? ['both', 'left', 'right'] : ['both'];
  const sideLabel = (s: string) => (s === 'both' ? tr(locale, 'beide Seiten', 'both sides') : s === 'left' ? tr(locale, 'nur links', 'left only') : tr(locale, 'nur rechts', 'right only'));
  const can = (type: string, side: 'both' | 'left' | 'right') => {
    const pans = side === 'both' ? [state.left, state.right] : [side === 'left' ? state.left : state.right];
    if (type === 'remove_unit') return pans.every((p) => p.units > 0);
    if (type === 'remove_x') return pans.every((p) => p.x > 0);
    if (type === 'add_unit') return pans.every((p) => p.units < 30);
    return false;
  };
  const divisors = [2, 3, 4, 5, 6].filter((d) => [state.left.x, state.left.units, state.right.x, state.right.units].every((n) => n % d === 0) && (state.left.x + state.right.x) >= d);
  const groups: { type: string; title: string }[] = [
    { type: 'remove_unit', title: tr(locale, 'Gewicht wegnehmen', 'Remove a weight') },
    { type: 'remove_x', title: tr(locale, 'Kiste x wegnehmen', 'Remove a box x') },
    { type: 'add_unit', title: tr(locale, 'Gewicht dazulegen', 'Add a weight') },
  ].filter((g) => allow.has(g.type as never));

  return (
    <div>
      <div className="svg-wrap">
        <svg viewBox="0 0 340 210" role="img" aria-label={balanceWidget.describe(state, params, locale)}>
          <path d={`M${pivot.x},${pivot.y} L${pivot.x - 24},196 L${pivot.x + 24},196 Z`} fill="var(--surface-3)" strokeLinejoin="round" />
          <rect x="60" y="196" width="220" height="4" rx="2" fill="var(--line-2)" />
          <BalancePan base={{ x: pivot.x - L, y: pivot.y }} end={left} pan={state.left} reveal={reveal} />
          <BalancePan base={{ x: pivot.x + L, y: pivot.y }} end={right} pan={state.right} reveal={reveal} />
          <g style={{ ...TWEEN, transformOrigin: `${pivot.x}px ${pivot.y}px`, transform: `rotate(${angle}deg)` }}>
            <rect x={pivot.x - L - 6} y={pivot.y - 3} width={2 * L + 12} height="6" rx="3" fill={solvedNow !== null ? 'var(--ok)' : 'var(--ink-2)'} style={{ transition: 'fill 0.3s' }} />
          </g>
          <circle cx={pivot.x} cy={pivot.y} r="6" fill="var(--surface)" stroke="var(--ink-2)" strokeWidth="2.5" />
          {state.tilt !== 0 ? (
            <text x={pivot.x} y="24" textAnchor="middle" fontSize="12.5" fontWeight="650" fill="var(--bad)">
              {tr(locale, 'Die Waage kippt', 'The scale tips')}
            </text>
          ) : solvedNow !== null ? (
            <text key="solved" className="bal-solved" x={pivot.x} y="26" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--ok-deep)">
              x = {solvedNow} ✓
            </text>
          ) : !readOnly && state.moves > 0 ? (
            <text x={pivot.x} y="24" textAnchor="middle" fontSize="12.5" fontWeight="650" fill="var(--ok-deep)">
              {tr(locale, 'Im Gleichgewicht', 'Balanced')}
            </text>
          ) : null}
        </svg>
      </div>
      <p className="center tnum" style={{ fontSize: '1.375rem', fontWeight: 650, margin: '4px 0 0', letterSpacing: '-0.01em' }}>
        <span aria-hidden="true">{term(state.left)} {state.balanced ? '=' : '≠'} {term(state.right)}</span>
        <span className="sr-only">{tr(locale, 'Gleichung', 'Equation')}: {term(state.left)} {state.balanced ? '=' : tr(locale, 'ungleich', 'not equal')} {term(state.right)}</span>
      </p>
      {!readOnly && (
        <div className="controls">
          {groups.map((g) => (
            <div className="control-group" key={g.type} role="group" aria-label={g.title}>
              <span className="label">{g.title}</span>
              <div className="row wrap">
                {sides.map((s) => (
                  <button key={s} type="button" className={`btn small ${s === 'both' ? 'primary' : 'ghost'}`} disabled={!can(g.type, s)} onClick={() => dispatch({ type: g.type, side: s })}>
                    {sideLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {allow.has('divide') && (
            <div className="control-group" role="group" aria-label={tr(locale, 'Beide Seiten teilen', 'Divide both sides')}>
              <span className="label">{tr(locale, 'Beide Seiten teilen durch', 'Divide both sides by')}</span>
              <div className="row wrap">
                {[2, 3, 4, 5].map((d) => (
                  <button key={d} type="button" className="btn small primary" disabled={!divisors.includes(d)} onClick={() => dispatch({ type: 'divide', by: d })}>
                    : {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Fraction ----------------

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
}

export function FractionView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<FractionParams, FractionState>) {
  const n = state.parts;
  const k = shadedCount(state);
  const toggle = (i: number) => !readOnly && dispatch({ type: 'toggle', index: i });
  const keyToggle = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(i); }
  };
  const partLabel = (i: number) => tr(locale, `Teil ${i + 1} von ${n}`, `Part ${i + 1} of ${n}`);
  const refs = params.reference.map((f) => f.split('/').map(Number));
  return (
    <div>
      {params.partOptions && !readOnly && (
        <div className="segmented" role="group" aria-label={tr(locale, 'In wie viele Teile teilen?', 'Split into how many parts?')} style={{ marginBottom: 12 }}>
          {params.partOptions.map((p) => (
            <button key={p} type="button" aria-pressed={p === n} onClick={() => p !== n && dispatch({ type: 'split', parts: p })}>
              {p} {tr(locale, 'Teile', 'parts')}
            </button>
          ))}
        </div>
      )}
      <div className="svg-wrap">
        {params.shape === 'square' || params.shape === 'triangle' || params.shape === 'hexagon' ? (
          <svg viewBox="-4 -4 108 108" aria-label={fractionWidget.describe(state, params, locale)} role="group" className="frac-shape" style={{ maxWidth: 280, margin: '0 auto' }}>
            {fractionPieces(params.shape, n).map((pts, i) => (
              <polygon
                key={`${n}-${i}`}
                className={`frac-part ${state.shaded[i] ? 'on' : ''}`}
                points={pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
                fill={state.shaded[i] ? 'var(--topic, var(--accent))' : 'var(--surface-3)'}
                stroke="var(--bg)"
                strokeWidth="1.6"
                strokeLinejoin="round"
                role={readOnly ? undefined : 'checkbox'}
                aria-checked={readOnly ? undefined : state.shaded[i]}
                aria-label={readOnly ? undefined : partLabel(i)}
                tabIndex={readOnly ? undefined : 0}
                onClick={() => toggle(i)}
                onKeyDown={keyToggle(i)}
                style={{ cursor: readOnly ? 'default' : 'pointer' }}
              />
            ))}
          </svg>
        ) : params.shape === 'circle' ? (
          <svg viewBox="0 0 220 220" aria-label={fractionWidget.describe(state, params, locale)} role="group" style={{ maxWidth: 280, margin: '0 auto' }}>
            {Array.from({ length: n }, (_, i) => (
              <path
                key={i}
                d={n === 1 ? 'M110,10 A100,100 0 1 1 109.99,10 Z' : arc(110, 110, 100, (2 * Math.PI * i) / n, (2 * Math.PI * (i + 1)) / n)}
                className={`frac-part ${state.shaded[i] ? 'on' : ''}`}
                fill={state.shaded[i] ? 'var(--topic, var(--accent))' : 'var(--surface-3)'}
                stroke="var(--bg)"
                strokeWidth="3"
                role={readOnly ? undefined : 'checkbox'}
                aria-checked={readOnly ? undefined : state.shaded[i]}
                aria-label={readOnly ? undefined : partLabel(i)}
                tabIndex={readOnly ? undefined : 0}
                onClick={() => toggle(i)}
                onKeyDown={keyToggle(i)}
                style={{ cursor: readOnly ? 'default' : 'pointer' }}
              />
            ))}
          </svg>
        ) : (
          <svg viewBox={`0 0 320 ${80 + refs.length * 40}`} aria-label={fractionWidget.describe(state, params, locale)} role="group">
            {refs.map(([rn, rd], ri) => (
              <g key={ri} aria-hidden="true">
                {Array.from({ length: rd }, (_, i) => (
                  <rect key={i} x={10 + (300 / rd) * i + 1.5} y={6 + ri * 40} width={300 / rd - 3} height="28" rx="6" fill={i < rn ? 'var(--amber)' : 'var(--surface-3)'} />
                ))}
                <text x="304" y={25 + ri * 40} fontSize="12" textAnchor="end" fill={rn === rd ? '#1a1300' : 'var(--ink-2)'} fontWeight="700">{rn}/{rd}</text>
              </g>
            ))}
            {Array.from({ length: n }, (_, i) => (
              <rect
                key={i}
                x={10 + (300 / n) * i + 2}
                y={10 + refs.length * 40}
                width={300 / n - 4}
                height="60"
                rx="10"
                className={`frac-part ${state.shaded[i] ? 'on' : ''}`}
                fill={state.shaded[i] ? 'var(--topic, var(--accent))' : 'var(--surface-3)'}
                role={readOnly ? undefined : 'checkbox'}
                aria-checked={readOnly ? undefined : state.shaded[i]}
                aria-label={readOnly ? undefined : partLabel(i)}
                tabIndex={readOnly ? undefined : 0}
                onClick={() => toggle(i)}
                onKeyDown={keyToggle(i)}
                style={{ cursor: readOnly ? 'default' : 'pointer' }}
              />
            ))}
          </svg>
        )}
      </div>
      <div className="frac-readout" aria-live="polite">
        <span className="frac-stack tnum" aria-hidden="true">
          <span key={`k${k}`} className="num">{k}</span>
          <span className="bar" />
          <span key={`n${n}`} className="den">{n}</span>
        </span>
        <span className="small muted">{tr(locale, `${k} von ${n} Teilen gefärbt`, `${k} of ${n} parts shaded`)}</span>
      </div>
    </div>
  );
}

// ---------------- Number line ----------------

export function NumberLineView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<NumberLineParams, NumberLineState>) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 340;
  const x0 = 24;
  const x1 = W - 24;
  const sx = (v: number) => x0 + ((v - params.min) / (params.max - params.min)) * (x1 - x0);
  const ticks = tickValues(params);
  const setFromClient = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const v = params.min + ((px - x0) / (x1 - x0)) * (params.max - params.min);
    dispatch({ type: 'set', value: snapToTick(params, v) });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = 1 / params.ticks;
    const cur = state.value ?? params.min;
    const map: Record<string, number> = { ArrowRight: cur + step, ArrowUp: cur + step, ArrowLeft: cur - step, ArrowDown: cur - step, Home: params.min, End: params.max };
    if (!(e.key in map)) return;
    e.preventDefault();
    dispatch({ type: 'set', value: map[e.key] });
  };
  const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;
  const labelFor = (v: number) => {
    if (params.labels === 'none') return null;
    if (params.labels === 'integers') return isInt(v) ? String(Math.round(v)) : null;
    return formatTick(v, params, locale);
  };
  const markerText = state.value === null ? '' : formatTick(state.value, { ...params, labels: params.labels === 'decimals' ? 'decimals' : 'fractions' }, locale);
  return (
    <div>
      <div className="svg-wrap">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} 110`}
          aria-label={numberLineWidget.describe(state, params, locale)}
          role="group"
          onPointerDown={readOnly ? undefined : (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setFromClient(e.clientX); }}
          onPointerMove={readOnly ? undefined : (e) => e.buttons && setFromClient(e.clientX)}
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
        >
          <rect x="0" y="0" width={W} height="110" rx="14" fill="var(--surface)" stroke="var(--line)" />
          <line x1={x0 - 8} x2={x1 + 8} y1="60" y2="60" stroke="var(--ink-2)" strokeWidth="2.5" strokeLinecap="round" />
          {ticks.map((v, i) => {
            const major = isInt(v);
            const lab = labelFor(v);
            return (
              <g key={i} aria-hidden="true">
                <line x1={sx(v)} x2={sx(v)} y1={major ? 48 : 54} y2={major ? 72 : 66} stroke={major ? 'var(--ink-2)' : 'var(--ink-3)'} strokeWidth={major ? 2 : 1.3} strokeLinecap="round" />
                {lab !== null && (
                  <text x={sx(v)} y="94" textAnchor="middle" fontSize={params.labels === 'fractions' || params.labels === 'decimals' ? 11 : 14} fontWeight="700" fill="var(--ink-2)">
                    {lab}
                  </text>
                )}
              </g>
            );
          })}
          {params.markers.map((m, i) => (
            <text key={`m${i}`} x={sx(resolveNumber(m.value))} y="94" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--ink-2)" aria-hidden="true">{m.label}</text>
          ))}
          {state.value !== null && (
            <g style={{ transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: `translateX(${sx(state.value)}px)` }} aria-hidden="true">
              <path d="M0,56 L-7,40 L7,40 Z" fill="var(--accent)" />
              <circle cx="0" cy="60" r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2.5" />
              <rect x="-26" y="12" width="52" height="28" rx="9" fill="var(--accent)" />
              <text x="0" y="31" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--accent-ink)">{markerText}</text>
            </g>
          )}
        </svg>
      </div>
      {!readOnly && (
        <div
          className="nl-slider"
          role="slider"
          tabIndex={0}
          aria-label={tr(locale, 'Markierung auf dem Zahlenstrahl', 'Marker on the number line')}
          aria-valuemin={params.min}
          aria-valuemax={params.max}
          aria-valuenow={state.value ?? undefined}
          aria-valuetext={state.value === null ? tr(locale, 'keine Markierung', 'no marker') : markerText}
          onKeyDown={onKey}
        >
          <span className="small muted">{tr(locale, 'Tippe auf den Strahl oder nutze die Pfeiltasten.', 'Tap the line or use the arrow keys.')}</span>
        </div>
      )}
    </div>
  );
}

// ---------------- Logic grid ----------------

export function LogicGridView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<LogicGridParams, LogicGridState>) {
  const rows = params.categories[0].items;
  const markText = (v: number) => (v === 2 ? '✓' : v === 1 ? '✗' : '');
  const markName = (v: number) => (v === 2 ? tr(locale, 'passt', 'match') : v === 1 ? tr(locale, 'passt nicht', 'no match') : tr(locale, 'leer', 'empty'));
  return (
    <div>
      <ol className="logic-clues">
        {params.clues.map((c, i) => (
          <li key={i}>{c.text}</li>
        ))}
      </ol>
      <div className="logic-scroll">
        <div className="row" style={{ alignItems: 'flex-start', gap: 16, justifyContent: 'center', minWidth: 'fit-content' }}>
          {params.categories.slice(1).map((cat, ci) => {
            const c = ci + 1;
            return (
              <table className="logic-table" key={cat.name}>
                <caption className="sr-only">{`${params.categories[0].name} × ${cat.name}`}</caption>
                <thead>
                  <tr>
                    <th />
                    {cat.items.map((it) => (
                      <th key={it} className="col" scope="col">{it}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={r}>
                      <th className="row" scope="row">{c === 1 ? r : <span aria-label={r}>{r}</span>}</th>
                      {cat.items.map((it, ii) => {
                        const v = state.marks[cellKey(ri, c, ii)] ?? 0;
                        return (
                          <td key={it}>
                            <button
                              type="button"
                              className="logic-cell"
                              data-mark={v}
                              disabled={readOnly}
                              aria-label={`${r} – ${it}: ${markName(v)}`}
                              onClick={() => dispatch({ type: 'cycle', row: ri, cat: c, item: ii })}
                            >
                              {markText(v)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}
        </div>
      </div>
    </div>
  );
}
