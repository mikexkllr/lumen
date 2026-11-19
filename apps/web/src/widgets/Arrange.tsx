/** Ordering and tile-building widgets – drag *or* buttons, never drag-only. */
import { useRef, useState } from 'react';
import { orderIds, type OrderParams, type OrderState, type TilesParams, type TilesState } from '@lumen/engine';
import { inline } from '../lib/markdown.tsx';
import { tr, type WidgetViewProps } from './types.ts';

export function OrderView({ params, state, dispatch, readOnly, labelledBy, locale }: WidgetViewProps<OrderParams, OrderState>) {
  const ids = orderIds(params);
  const label = (id: string) => params.items[ids.indexOf(id)]?.label ?? id;
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const horizontal = params.direction === 'horizontal';

  const indexAt = (clientX: number, clientY: number) => {
    const items = [...(listRef.current?.children ?? [])] as HTMLElement[];
    let best = 0;
    let dist = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2));
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  };

  return (
    <div>
      {(params.startLabel || params.endLabel) && (
        <div className="order-ends" aria-hidden="true"><span>↑ {params.startLabel}</span><span>{params.endLabel} ↓</span></div>
      )}
      <ol ref={listRef} className={`order-list ${horizontal ? 'horizontal' : ''}`} aria-labelledby={labelledBy}>
        {state.order.map((id, i) => (
          <li
            key={id}
            className={`order-item ${drag?.from === i ? 'dragging' : ''}`}
            onPointerDown={readOnly ? undefined : (e) => { if ((e.target as HTMLElement).closest('button')) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag({ from: i, over: i }); }}
            onPointerMove={drag ? (e) => setDrag({ ...drag, over: indexAt(e.clientX, e.clientY) }) : undefined}
            onPointerUp={drag ? () => { if (drag.over !== drag.from) dispatch({ type: 'move', from: drag.from, to: drag.over }); setDrag(null); } : undefined}
            style={drag && drag.over === i && drag.from !== i ? { outline: '3px dashed var(--accent)' } : undefined}
          >
            {!horizontal && <span aria-hidden="true" style={{ color: 'var(--ink-3)', cursor: readOnly ? 'default' : 'grab' }}>⠿</span>}
            <span className="label">{inline(label(id), id)}</span>
            {!readOnly && (
              <span className="row" style={{ gap: 2 }}>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => dispatch({ type: 'move', from: i, to: i - 1 })} aria-label={tr(locale, `${label(id)} nach vorn`, `Move ${label(id)} up`)}>
                  {horizontal ? '←' : '↑'}
                </button>
                <button type="button" className="icon-btn" disabled={i === state.order.length - 1} onClick={() => dispatch({ type: 'move', from: i, to: i + 1 })} aria-label={tr(locale, `${label(id)} nach hinten`, `Move ${label(id)} down`)}>
                  {horizontal ? '→' : '↓'}
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TilesView({ params, state, dispatch, readOnly, labelledBy, locale }: WidgetViewProps<TilesParams, TilesState>) {
  return (
    <div role="group" aria-labelledby={labelledBy}>
      <div className="tiles-row" aria-label={tr(locale, 'Deine Antwort', 'Your answer')} role="list">
        {state.placed.length === 0 && <span className="muted small">{tr(locale, 'Tippe unten auf Kacheln, um sie hier abzulegen.', 'Tap tiles below to place them here.')}</span>}
        {state.placed.map((idx, pos) => (
          <span role="listitem" key={`${idx}-${pos}`}>
            <button type="button" className="tile placed" disabled={readOnly} onClick={() => dispatch({ type: 'remove', position: pos })} aria-label={tr(locale, `${params.tiles[idx]} entfernen`, `Remove ${params.tiles[idx]}`)}>
              {params.tiles[idx]}
            </button>
          </span>
        ))}
      </div>
      <div className="tiles-pool">
        {params.tiles.map((t, i) => (
          <button key={i} type="button" className="tile" disabled={readOnly || state.placed.includes(i)} onClick={() => dispatch({ type: 'place', index: i })}>
            {t}
          </button>
        ))}
        {!readOnly && state.placed.length > 0 && (
          <button type="button" className="btn link small" onClick={() => dispatch({ type: 'clear' })}>
            {tr(locale, 'Leeren', 'Clear')}
          </button>
        )}
      </div>
    </div>
  );
}
