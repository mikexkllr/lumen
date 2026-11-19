/** Robot programming, data charts and probability/LLM sampling widgets. */
import { useEffect, useRef, useState } from 'react';
import {
  chartWidget,
  distributionWidget,
  formatNumber,
  mean,
  median,
  probabilities,
  robotWidget,
  runRobot,
  type ChartParams,
  type ChartState,
  type DistributionParams,
  type DistributionState,
  type Instr,
  type RobotParams,
  type RobotState,
} from '@lumen/engine';
import { Icon } from '../components/ui.tsx';
import { tr, type WidgetViewProps } from './types.ts';

// ---------------- Robot ----------------

const ROT = { N: -90, E: 0, S: 90, W: 180 } as const;

function blockLabel(i: Instr, locale: string) {
  switch (i.op) {
    case 'forward': return tr(locale, '↑ vorwärts', '↑ forward');
    case 'left': return tr(locale, '↺ links drehen', '↺ turn left');
    case 'right': return tr(locale, '↻ rechts drehen', '↻ turn right');
    case 'repeat': return tr(locale, `⟳ wiederhole ${i.n}×`, `⟳ repeat ${i.n}×`);
    case 'end': return tr(locale, '⤶ Ende', '⤶ end');
  }
}
const blockClass = (op: string) => (op === 'forward' ? 'move' : op === 'left' || op === 'right' ? 'turn' : op === 'repeat' ? 'loop' : 'end');

export function RobotView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<RobotParams, RobotState>) {
  const result = runRobot(params, state.program);
  const [frame, setFrame] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => { setFrame(null); }, [state.program.length]);
  const run = () => {
    if (timer.current) clearInterval(timer.current);
    let k = 0;
    setFrame(0);
    timer.current = window.setInterval(() => {
      k++;
      if (k >= result.frames.length) {
        clearInterval(timer.current!);
        timer.current = null;
        return;
      }
      setFrame(k);
    }, 380);
  };
  const shown = result.frames[frame ?? (readOnly ? result.frames.length - 1 : 0)];
  const C = 44;
  const W = params.grid[0].length * C;
  const H = params.grid.length * C;
  let depth = 0;
  const indents = state.program.map((i) => {
    if (i.op === 'end') depth = Math.max(0, depth - 1);
    const d = depth;
    if (i.op === 'repeat') depth++;
    return d;
  });
  const full = state.program.length >= params.maxBlocks;
  const finished = frame !== null && frame === result.frames.length - 1;

  return (
    <div className="code-area">
      <div>
        <div className="svg-wrap" style={{ maxWidth: Math.min(380, W + 8), margin: '0 auto' }}>
          <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} role="img" aria-label={robotWidget.describe(state, params, locale)}>
            <rect x="-4" y="-4" width={W + 8} height={H + 8} rx="14" fill="var(--surface-2)" />
            {params.grid.map((row, y) =>
              [...row].map((c, x) => (
                <g key={`${x}-${y}`}>
                  <rect x={x * C + 2} y={y * C + 2} width={C - 4} height={C - 4} rx="8" fill={c === '#' ? 'var(--ink-2)' : 'var(--surface)'} stroke="var(--line)" />
                  {c === 'G' && <path d={`M${x * C + 16} ${y * C + 34} V${y * C + 10} l14 6 -14 6`} fill="#0e9f80" stroke="#0e9f80" strokeWidth="2.5" strokeLinejoin="round" />}
                  {c === '*' && !result.frames.slice(0, (frame ?? (readOnly ? result.frames.length - 1 : 0)) + 1).some((f) => f.x === x && f.y === y) && (
                    <path d={`M${x * C + 22} ${y * C + 10} l10 12 -10 12 -10 -12z`} fill="var(--amber)" stroke="var(--amber-deep)" strokeWidth="2" />
                  )}
                </g>
              )),
            )}
            {frame !== null && result.frames.slice(0, frame + 1).map((f, i) => <circle key={i} cx={f.x * C + C / 2} cy={f.y * C + C / 2} r="3" fill="var(--accent)" opacity="0.5" />)}
            <g style={{ transition: 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: `translate(${shown.x * C + C / 2}px, ${shown.y * C + C / 2}px) rotate(${ROT[shown.dir]}deg)` }}>
              <rect x="-15" y="-15" width="30" height="30" rx="9" fill="var(--accent)" />
              <circle cx="5" cy="-6" r="3.5" fill="#fff" />
              <circle cx="5" cy="6" r="3.5" fill="#fff" />
              <path d="M15 -6 L23 0 L15 6 Z" fill="var(--accent)" />
            </g>
          </svg>
        </div>
        <div className="run-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn small primary" onClick={run} disabled={!state.program.length}>
            ▶ {tr(locale, 'Ausführen', 'Run')}
          </button>
          {frame !== null && (
            <button type="button" className="btn small ghost" onClick={() => setFrame(null)}>{tr(locale, 'Zurück zum Start', 'Back to start')}</button>
          )}
        </div>
        {finished && (
          <p className="small center" role="status" style={{ fontWeight: 700, color: result.success ? 'var(--ok)' : 'var(--bad)', marginTop: 8 }}>
            {result.error ?? (result.crashed ? tr(locale, 'Bumm – gegen die Wand.', 'Bump – hit a wall.') : result.success ? tr(locale, 'Ziel erreicht!', 'Goal reached!') : tr(locale, 'Noch nicht am Ziel.', 'Not at the goal yet.'))}
          </p>
        )}
      </div>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="eyebrow">{tr(locale, 'Programm', 'Program')}</span>
          <span className="small" style={{ fontWeight: 700, color: state.program.length > params.maxBlocks ? 'var(--bad)' : 'var(--ink-3)' }}>{state.program.length}/{params.maxBlocks} {tr(locale, 'Blöcke', 'blocks')}</span>
        </div>
        <ol className="program" aria-label={tr(locale, 'Programm', 'Program')}>
          {state.program.length === 0 && <li className="small muted" style={{ padding: 8 }}>{tr(locale, 'Tippe unten Blöcke an, um das Programm zu bauen.', 'Tap blocks below to build the program.')}</li>}
          {state.program.map((ins, i) => {
            const active = frame !== null && result.frames[frame]?.line === i;
            return (
              <li key={i} style={{ paddingLeft: indents[i] * 22 }}>
                <span className="ln" aria-hidden="true">{i + 1}</span>
                <button
                  type="button"
                  className={`cblock ${blockClass(ins.op)} ${active ? 'active' : ''}`}
                  disabled={readOnly}
                  onClick={() => dispatch({ type: 'remove', index: i })}
                  aria-label={`${i + 1}: ${blockLabel(ins, locale)} – ${tr(locale, 'entfernen', 'remove')}`}
                >
                  {blockLabel(ins, locale)}
                  {!readOnly && <span style={{ marginLeft: 'auto', opacity: 0.75 }} aria-hidden="true">✕</span>}
                </button>
              </li>
            );
          })}
        </ol>
        {!readOnly && (
          <>
            <div className="eyebrow" style={{ margin: '12px 0 6px' }}>{tr(locale, 'Blöcke', 'Blocks')}</div>
            <div className="palette">
              {params.blocks.flatMap((op) =>
                op === 'repeat'
                  ? params.repeatCounts.map((n) => (
                      <button key={`r${n}`} type="button" className="cblock loop" disabled={full} onClick={() => dispatch({ type: 'add', op, n })}>
                        {blockLabel({ op: 'repeat', n }, locale)}
                      </button>
                    ))
                  : [
                      <button key={op} type="button" className={`cblock ${blockClass(op)}`} disabled={full} onClick={() => dispatch({ type: 'add', op })}>
                        {blockLabel({ op } as Instr, locale)}
                      </button>,
                    ],
              )}
              {state.program.length > 0 && (
                <button type="button" className="btn small ghost" onClick={() => dispatch({ type: 'clear' })}>
                  <Icon name="trash" size={16} /> {tr(locale, 'Leeren', 'Clear')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Chart ----------------

export function ChartView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<ChartParams, ChartState>) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const n = params.values.length;
  const W = 340;
  const H = 220;
  const padL = 30;
  const padB = 34;
  const bw = (W - padL - 10) / n;
  const sy = (v: number) => H - padB - ((v - params.min) / (params.max - params.min)) * (H - padB - 16);
  const toValue = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const py = ((clientY - r.top) / r.height) * H;
    return params.min + ((H - padB - py) / (H - padB - 16)) * (params.max - params.min);
  };
  const editable = (i: number) => !readOnly && params.editable.includes(i);
  const ticks: number[] = [];
  const tickStep = Math.max(params.step, Math.ceil((params.max - params.min) / 5));
  for (let v = params.min; v <= params.max + 1e-9; v += tickStep) ticks.push(v);
  const m = mean(state.values);
  const md = median(state.values);
  return (
    <div className="chart-wrap">
      {params.title && <p className="center" style={{ fontWeight: 700, marginBottom: 4 }}>{params.title}</p>}
      <div className="svg-wrap">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={chartWidget.describe(state, params, locale)}
          onPointerMove={(e) => { if (drag.current !== null && e.buttons) dispatch({ type: 'set', index: drag.current, value: toValue(e.clientY) }); }}
          onPointerUp={() => { drag.current = null; }}
        >
          <rect x="0" y="0" width={W} height={H} rx="14" fill="var(--surface)" />
          {ticks.map((v) => (
            <g key={v} aria-hidden="true">
              <line x1={padL} x2={W - 6} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
              <text x={padL - 6} y={sy(v) + 4} fontSize="10" textAnchor="end" fill="var(--ink-3)">{formatNumber(v, locale)}</text>
            </g>
          ))}
          {state.values.map((v, i) => {
            const x = padL + i * bw + bw * 0.15;
            const can = editable(i);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={sy(v)}
                  width={bw * 0.7}
                  height={Math.max(2, H - padB - sy(v))}
                  rx="6"
                  fill={can ? 'var(--amber)' : 'var(--accent)'}
                  style={{ transition: drag.current === i ? 'none' : 'y 0.3s, height 0.3s', cursor: can ? 'ns-resize' : 'default' }}
                  onPointerDown={can ? (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = i; dispatch({ type: 'set', index: i, value: toValue(e.clientY) }); } : undefined}
                  tabIndex={can ? 0 : undefined}
                  role={can ? 'slider' : undefined}
                  aria-label={can ? params.labels[i] : undefined}
                  aria-valuemin={can ? params.min : undefined}
                  aria-valuemax={can ? params.max : undefined}
                  aria-valuenow={can ? v : undefined}
                  onKeyDown={can ? (e) => {
                    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? params.step : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -params.step : 0;
                    if (d) { e.preventDefault(); dispatch({ type: 'set', index: i, value: v + d }); }
                  } : undefined}
                />
                <text x={x + bw * 0.35} y={sy(v) - 5} fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--ink)" aria-hidden="true">{formatNumber(v, locale)}</text>
                <text x={x + bw * 0.35} y={H - padB + 16} fontSize="11" textAnchor="middle" fill="var(--ink-2)" aria-hidden="true">{params.labels[i]}</text>
                {can && <text x={x + bw * 0.35} y={H - 4} fontSize="12" textAnchor="middle" fill="var(--amber-deep)" aria-hidden="true">↕</text>}
              </g>
            );
          })}
          {params.show.includes('mean') && (
            <g aria-hidden="true">
              <line x1={padL} x2={W - 6} y1={sy(m)} y2={sy(m)} stroke="var(--bad)" strokeWidth="2.5" strokeDasharray="7 5" />
              <text x={W - 8} y={sy(m) - 5} fontSize="11" fontWeight="800" textAnchor="end" fill="var(--bad)">Ø {formatNumber(Math.round(m * 100) / 100, locale)}</text>
            </g>
          )}
          {params.show.includes('median') && (
            <g aria-hidden="true">
              <line x1={padL} x2={W - 6} y1={sy(md)} y2={sy(md)} stroke="var(--ok)" strokeWidth="2.5" strokeDasharray="2 4" />
              <text x={padL + 4} y={sy(md) - 5} fontSize="11" fontWeight="800" fill="var(--ok)">Median {formatNumber(md, locale)}</text>
            </g>
          )}
        </svg>
      </div>
      {params.editable.length > 0 && !readOnly && <p className="small muted center">{tr(locale, 'Ziehe die orangen Säulen – oder wähle sie mit Tab und nutze die Pfeiltasten.', 'Drag the orange bars – or tab to them and use arrow keys.')}</p>}
    </div>
  );
}

// ---------------- Distribution ----------------

export function DistributionView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<DistributionParams, DistributionState>) {
  const probs = probabilities(params, state.temperature);
  const last = state.last.length ? state.last[state.last.length - 1] : null;
  const pct = (v: number) => `${formatNumber(Math.round(v * 1000) / 10, locale)} %`;
  return (
    <div aria-label={distributionWidget.describe(state, params, locale)} role="group">
      {params.mode === 'tokens' && params.context && (
        <div className="sentence" aria-live="polite">
          {params.context} <span className="gen" key={state.draws}>{last !== null ? params.items[last].label : '…'}</span>
        </div>
      )}
      <div className="dist-bars">
        {params.items.map((it, i) => {
          const f = state.draws ? state.counts[i] / state.draws : 0;
          return (
            <div key={it.label} className={`dist-bar ${last === i ? 'picked' : ''}`}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
              <span className="track" aria-hidden="true" style={{ position: 'relative' }}>
                <span className="fill" style={{ width: `${probs[i] * 100}%`, display: 'block' }} />
                {params.showCounts && state.draws > 0 && <span style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${f * 100}% - 2px)`, width: 4, background: 'var(--amber-deep)', borderRadius: 2, transition: 'left 0.4s' }} />}
              </span>
              <span className="p">{pct(probs[i])}</span>
            </div>
          );
        })}
      </div>
      {params.showCounts && state.draws > 0 && (
        <p className="small muted" style={{ marginTop: 8 }}>
          {tr(locale, `Strich = beobachtete Häufigkeit nach ${state.draws} Ziehungen: `, `Marker = observed frequency after ${state.draws} draws: `)}
          {params.items.map((it, i) => `${it.label} ${pct(state.counts[i] / state.draws)}`).join(' · ')}
        </p>
      )}
      {params.temperature && state.temperature !== null && !readOnly && (
        <div className="slider-row">
          <label htmlFor="temp" style={{ fontWeight: 700 }}>{tr(locale, 'Temperatur', 'Temperature')}</label>
          <input id="temp" type="range" min={params.temperature.min} max={params.temperature.max} step={params.temperature.step} value={state.temperature} onChange={(e) => dispatch({ type: 'temp', value: Number(e.target.value) })} />
          <output htmlFor="temp">{formatNumber(state.temperature, locale)}</output>
        </div>
      )}
      {!readOnly && (
        <div className="run-row">
          {params.sample.map((n) => (
            <button key={n} type="button" className="btn small primary" onClick={() => dispatch({ type: 'sample', n })}>
              {params.mode === 'tokens' ? (n === 1 ? tr(locale, 'Nächstes Wort ziehen', 'Sample next word') : tr(locale, `${n}× ziehen`, `Sample ${n}×`)) : tr(locale, `${n}× ziehen`, `Draw ${n}×`)}
            </button>
          ))}
          {state.draws > 0 && <button type="button" className="btn small ghost" onClick={() => dispatch({ type: 'reset' })}>{tr(locale, 'Zurücksetzen', 'Reset')}</button>}
        </div>
      )}
      {state.last.length > 0 && (
        <div className="sample-log" aria-hidden="true">
          {state.last.map((i, k) => <span key={k}>{params.items[i].label}</span>)}
        </div>
      )}
    </div>
  );
}
