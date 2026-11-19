/** Coordinate plane with draggable points, and sliders with live function graph. */
import { useRef } from 'react';
import { evalMath, formatNumber, formatPoint, graphWidget, parseMath, sliderCurve, sliderWidget, type GraphParams, type GraphState, type SliderParams, type SliderState } from '@lumen/engine';
import { Plane, plotPath } from './Plane.tsx';
import { tr, type WidgetViewProps } from './types.ts';

export function GraphView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<GraphParams, GraphState>) {
  const dragging = useRef<string | null>(null);
  const draggable = params.points.filter((p) => p.draggable && !readOnly);
  const pick = (pt: { x: number; y: number }) => {
    let best: string | null = null;
    let d = 1.2;
    for (const p of draggable) {
      const q = state.points[p.id];
      const dist = Math.hypot(q.x - pt.x, q.y - pt.y);
      if (dist < d) { d = dist; best = p.id; }
    }
    return best;
  };
  const onPointer = readOnly
    ? undefined
    : (pt: { x: number; y: number }, phase: 'down' | 'move' | 'up') => {
        if (phase === 'down') dragging.current = pick(pt) ?? (draggable.length === 1 ? draggable[0].id : null);
        if (dragging.current && phase !== 'up') dispatch({ type: 'move', id: dragging.current, x: pt.x, y: pt.y });
        if (phase === 'up') dragging.current = null;
      };
  const onKey = (id: string) => (e: React.KeyboardEvent) => {
    const q = state.points[id];
    const s = params.grid;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    dispatch({ type: 'move', id, x: q.x + d[0], y: q.y + d[1] });
  };

  return (
    <div>
      <Plane x={params.x} y={params.y} onPointer={onPointer} label={graphWidget.describe(state, params, locale)} locale={locale}>
        {(m) => (
          <>
            {params.functions.map((f, i) => {
              const node = parseMath(f.expr, ['x']);
              return <path key={`f${i}`} d={plotPath((x) => evalMath(node, { x }), m)} fill="none" stroke="var(--amber)" strokeWidth="2.5" />;
            })}
            {params.lines.map(([a, b], i) => {
              const p = state.points[a];
              const q = state.points[b];
              if (!p || !q || (p.x === q.x && p.y === q.y)) return null;
              if (p.x === q.x) return <line key={`l${i}`} x1={m.sx(p.x)} x2={m.sx(p.x)} y1={0} y2={m.H} stroke="var(--accent)" strokeWidth="2.5" />;
              const k = (q.y - p.y) / (q.x - p.x);
              const f = (x: number) => p.y + k * (x - p.x);
              return <line key={`l${i}`} x1={m.sx(m.x[0])} y1={m.sy(f(m.x[0]))} x2={m.sx(m.x[1])} y2={m.sy(f(m.x[1]))} stroke="var(--accent)" strokeWidth="2.5" />;
            })}
            {params.segments.map(([a, b], i) => {
              const p = state.points[a];
              const q = state.points[b];
              return p && q ? <line key={`s${i}`} x1={m.sx(p.x)} y1={m.sy(p.y)} x2={m.sx(q.x)} y2={m.sy(q.y)} stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" /> : null;
            })}
            {params.points.map((p) => {
              const q = state.points[p.id];
              const movable = p.draggable && !readOnly;
              const name = p.label ?? p.id;
              return (
                <g
                  key={p.id}
                  tabIndex={movable ? 0 : undefined}
                  role={movable ? 'slider' : undefined}
                  aria-label={movable ? tr(locale, `Punkt ${name}, mit Pfeiltasten verschieben`, `Point ${name}, move with arrow keys`) : undefined}
                  aria-valuetext={movable ? formatPoint(q.x, q.y, locale) : undefined}
                  onKeyDown={movable ? onKey(p.id) : undefined}
                  style={{ cursor: movable ? 'grab' : 'default', outline: 'none' }}
                  className="plane-point"
                >
                  {movable && <circle cx={m.sx(q.x)} cy={m.sy(q.y)} r="16" fill="var(--accent)" opacity="0.15" />}
                  <circle cx={m.sx(q.x)} cy={m.sy(q.y)} r={movable ? 8 : 6} fill={movable ? 'var(--accent)' : 'var(--ink)'} stroke="var(--surface)" strokeWidth="2" />
                  <text x={m.sx(q.x) + 11} y={m.sy(q.y) - 10} fontSize="13" fontWeight="700" fill="var(--ink)" aria-hidden="true">
                    {name}
                    {params.showCoordinates ? ` ${formatPoint(q.x, q.y, locale)}` : ''}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </Plane>
      {!readOnly && draggable.length > 0 && (
        <p className="small muted" style={{ marginTop: 8 }}>{tr(locale, 'Ziehe die Punkte – oder wähle sie mit Tab aus und nutze die Pfeiltasten.', 'Drag the points – or select them with Tab and use the arrow keys.')}</p>
      )}
    </div>
  );
}

export function SliderView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<SliderParams, SliderState>) {
  let f: ((x: number) => number) | null = null;
  try {
    f = sliderCurve(params, state.values);
  } catch {
    f = null;
  }
  const target = params.target ? parseMath(params.target.expr, ['x']) : null;
  let shown = params.expr.replace(/\*/g, '·');
  for (const sl of params.sliders) shown = shown.replace(new RegExp(`\\b${sl.id}\\b`, 'g'), formatNumber(state.values[sl.id], locale));
  return (
    <div>
      <Plane x={params.x} y={params.y} label={sliderWidget.describe(state, params, locale)} locale={locale}>
        {(m) => (
          <>
            {target && <path d={plotPath((x) => evalMath(target, { x }), m)} fill="none" stroke="var(--amber)" strokeWidth="3" strokeDasharray="7 6" />}
            {f && <path d={plotPath(f, m)} fill="none" stroke="var(--accent)" strokeWidth="3" />}
            {params.markers.map((mk, i) => (
              <g key={i}>
                <circle cx={m.sx(mk.x)} cy={m.sy(mk.y)} r="7" fill={mk.group === 'a' ? '#0ea5e9' : mk.group === 'b' ? '#f97316' : 'var(--amber)'} stroke="var(--surface)" strokeWidth="2" />
                {(mk.label || params.showCoordinates) && (
                  <text x={m.sx(mk.x) + 10} y={m.sy(mk.y) - 9} fontSize="12" fontWeight="700" fill="var(--ink)" aria-hidden="true">
                    {mk.label} {params.showCoordinates ? formatPoint(mk.x, mk.y, locale) : ''}
                  </text>
                )}
              </g>
            ))}
          </>
        )}
      </Plane>
      <p className="center" style={{ fontWeight: 700, margin: '8px 0 0' }} aria-hidden="true">y = {shown}</p>
      {!readOnly &&
        params.sliders.map((sl) => (
          <div className="slider-row" key={sl.id}>
            <label htmlFor={`sl-${sl.id}`} style={{ fontWeight: 700, fontStyle: 'italic' }}>{sl.label ?? sl.id}</label>
            <input
              id={`sl-${sl.id}`}
              type="range"
              min={sl.min}
              max={sl.max}
              step={sl.step}
              value={state.values[sl.id]}
              aria-valuetext={`${sl.label ?? sl.id} = ${formatNumber(state.values[sl.id], locale)}`}
              onChange={(e) => dispatch({ type: 'set', id: sl.id, value: Number(e.target.value) })}
            />
            <output htmlFor={`sl-${sl.id}`}>{formatNumber(state.values[sl.id], locale)}</output>
          </div>
        ))}
    </div>
  );
}
