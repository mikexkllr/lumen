/** Micro-interactions: estimate slider, swipe deck, cloze text, "teach Lux" and discover cards. */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  clozeBank,
  clozeParts,
  estimateToPos,
  flipCanOpen,
  estimateToValue,
  teachHits,
  teachNeeded,
  TEACH_MAX,
  type ClozeParams,
  type ClozeState,
  type EstimateParams,
  type EstimateState,
  type FlipParams,
  type FlipState,
  type SwipeParams,
  type SwipeState,
  type TeachParams,
  type TeachState,
} from '@lumen/engine';
import { inline } from '../lib/markdown.tsx';
import { tr, type WidgetViewProps } from './types.ts';

const big = (n: number, locale: string) => new Intl.NumberFormat(locale.startsWith('de') ? 'de-DE' : 'en-US', { maximumFractionDigits: 6 }).format(n);

// ---------------- Estimate ----------------

export function EstimateView({ params, state, dispatch, readOnly, locale, result, labelledBy }: WidgetViewProps<EstimateParams, EstimateState>) {
  const pos = state.value === null ? 0.5 : estimateToPos(state.value, params);
  const shown = state.value === null ? '?' : big(state.value, locale);
  return (
    <div className="w-estimate" data-result={result ?? undefined}>
      <div className="est-value" aria-hidden="true">
        <motion.span key={shown} initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}>{shown}</motion.span>
        {params.unit && <small>{params.unit}</small>}
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(pos * 1000)}
        disabled={readOnly}
        aria-labelledby={labelledBy}
        aria-valuetext={state.value === null ? tr(locale, 'noch keine Schätzung', 'no guess yet') : `${shown} ${params.unit ?? ''}`}
        className={state.value === null ? 'untouched' : ''}
        onPointerDown={() => state.value === null && dispatch({ type: 'set', value: estimateToValue(0.5, params) })}
        onChange={(e) => dispatch({ type: 'set', value: estimateToValue(Number(e.target.value) / 1000, params) })}
      />
      <div className="est-scale" aria-hidden="true">
        <span>{big(params.min, locale)}</span>
        <span>{state.value === null ? tr(locale, 'Zieh den Regler – dein Bauchgefühl zählt', 'Drag the slider – trust your gut') : params.scale === 'log' ? tr(locale, 'Skala: jede Stufe mal 10', 'Scale: every step times 10') : ''}</span>
        <span>{big(params.max, locale)}</span>
      </div>
    </div>
  );
}

// ---------------- Swipe ----------------

export function SwipeView({ params, state, dispatch, readOnly, locale, result }: WidgetViewProps<SwipeParams, SwipeState>) {
  const L = params.left ?? tr(locale, 'Stimmt nicht', 'False');
  const R = params.right ?? tr(locale, 'Stimmt', 'True');
  const current = state.picks.findIndex((v) => v === null);
  const dealing = current >= 0 && !readOnly;
  const [exit, setExit] = useState(0);
  const pick = (right: boolean) => {
    if (!dealing) return;
    setExit(right ? 1 : -1);
    dispatch({ type: 'pick', index: current, right });
  };
  useEffect(() => {
    if (!dealing) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') pick(false);
      if (e.key === 'ArrowRight') pick(true);
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  });
  if (dealing) {
    const card = params.cards[current];
    return (
      <div className="w-swipe">
        <div className="swipe-dots" aria-hidden="true">{params.cards.map((_c, i) => <i key={i} className={i < current ? 'done' : i === current ? 'now' : ''} />)}</div>
        <div className="swipe-stack">
          {current + 1 < params.cards.length && <div className="swipe-card ghost" aria-hidden="true" />}
          <AnimatePresence mode="popLayout" custom={exit}>
            <motion.div
              key={current}
              className="swipe-card"
              drag="x"
              dragSnapToOrigin
              dragElastic={0.7}
              onDragEnd={(_e, info) => {
                if (info.offset.x > 90) pick(true);
                else if (info.offset.x < -90) pick(false);
              }}
              whileDrag={{ rotate: 3, scale: 1.02 }}
              initial={{ scale: 0.94, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ x: exit * 320, opacity: 0, rotate: exit * 14, transition: { duration: 0.22 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              role="group"
              aria-label={tr(locale, `Karte ${current + 1} von ${params.cards.length}`, `Card ${current + 1} of ${params.cards.length}`)}
            >
              <p>{inline(card.text, `c${current}`)}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="swipe-actions">
          <button type="button" className="swipe-btn no" onClick={() => pick(false)}><span aria-hidden="true">←</span> {L}</button>
          <button type="button" className="swipe-btn yes" onClick={() => pick(true)}>{R} <span aria-hidden="true">→</span></button>
        </div>
      </div>
    );
  }
  return (
    <ul className="swipe-list">
      {params.cards.map((c, i) => {
        const ok = state.picks[i] === c.right;
        const mark = result ? (result === 'ok' || ok ? 'ok' : 'bad') : undefined;
        return (
          <motion.li key={i} data-result={mark} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <button type="button" disabled={readOnly} onClick={() => dispatch({ type: 'pick', index: i, right: !state.picks[i] })} aria-label={tr(locale, 'Seite wechseln', 'Flip side')}>
              <span className="txt">{inline(c.text, `l${i}`)}</span>
              <span className={`side ${state.picks[i] ? 'yes' : 'no'}`}>{state.picks[i] ? R : L}</span>
            </button>
            {mark && c.why && (mark === 'bad' || result === 'ok') && <p className="why">{inline(c.why, `w${i}`)}</p>}
          </motion.li>
        );
      })}
    </ul>
  );
}

// ---------------- Cloze ----------------

export function ClozeView({ params, state, dispatch, readOnly, locale, result }: WidgetViewProps<ClozeParams, ClozeState>) {
  const { segments, answers } = clozeParts(params);
  const bank = clozeBank(params);
  const next = state.fills.indexOf(null);
  return (
    <div className="w-cloze">
      <p className="cloze-text">
        {segments.map((seg, i) => (
          <span key={i}>
            {inline(seg, `s${i}`)}
            {i < answers.length &&
              (state.fills[i] === null ? (
                <span className={`gap empty ${i === next ? 'next' : ''}`} aria-label={tr(locale, `Lücke ${i + 1}`, `Gap ${i + 1}`)} />
              ) : (
                <motion.button layout type="button" className="gap" data-result={result ? (result === 'ok' || bank[state.fills[i]!] === answers[i] ? 'ok' : 'bad') : undefined} disabled={readOnly} onClick={() => dispatch({ type: 'clear', gap: i })} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                  {inline(bank[state.fills[i]!], `g${i}`)}
                </motion.button>
              ))}
          </span>
        ))}
      </p>
      <div className="cloze-bank" role="group" aria-label={tr(locale, 'Wörter zur Auswahl', 'Words to choose from')}>
        {bank.map((w, i) => (
          <button key={i} type="button" className="tile word" disabled={readOnly || state.fills.includes(i)} onClick={() => dispatch({ type: 'put', word: i })}>
            {inline(w, `b${i}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Teach ----------------

export function TeachView({ params, state, dispatch, readOnly, locale, result, labelledBy }: WidgetViewProps<TeachParams, TeachState>) {
  const hits = teachHits(state.input, params);
  const n = hits.filter(Boolean).length;
  const need = teachNeeded(params);
  return (
    <div className="w-teach">
      <textarea
        value={state.input}
        readOnly={readOnly}
        maxLength={TEACH_MAX}
        rows={4}
        aria-labelledby={labelledBy}
        placeholder={params.placeholder ?? tr(locale, 'Erklär es so, als würdest du es einer Freundin erzählen …', 'Explain it as if you were telling a friend …')}
        onChange={(e) => dispatch({ type: 'input', value: e.target.value })}
      />
      <div className="teach-meter" aria-live="polite">
        <span className="dots" aria-hidden="true">{hits.map((h, i) => <i key={i} className={h ? 'on' : ''} />)}</span>
        <span>{n >= need ? tr(locale, 'Die Kernideen sind drin', 'The key ideas are in') : tr(locale, `${n} von ${params.keywords.length} Kernideen erkannt`, `${n} of ${params.keywords.length} key ideas spotted`)}</span>
      </div>
      {result === 'ok' && (
        <div className="teach-sample">
          <strong>{tr(locale, 'So könnte man es sagen', 'One way to put it')}</strong>
          <p>{inline(params.sample, 'sample')}</p>
        </div>
      )}
    </div>
  );
}

// ---------------- Flip (discover cards) ----------------

export function FlipView({ params, state, dispatch, readOnly, locale }: WidgetViewProps<FlipParams, FlipState>) {
  const chain = params.layout !== 'grid';
  const opened = state.open.filter(Boolean).length;
  const all = opened === params.cards.length;
  const next = chain ? state.open.indexOf(false) : -1;
  return (
    <div className={`w-flip ${params.layout}`}>
      <ol className="flip-cards" role="list">
        {params.cards.map((c, i) => {
          const open = state.open[i];
          const can = !readOnly && flipCanOpen(state, params, i);
          const locked = chain && !open && !can;
          return (
            <li key={i} className={`flip-item ${open ? 'open' : ''} ${locked ? 'locked' : ''} ${i === next ? 'next' : ''}`}>
              <button
                type="button"
                className="flip-card"
                disabled={readOnly || open || locked}
                aria-expanded={open}
                aria-label={open ? `${c.front}: ${c.back}` : locked ? tr(locale, `${c.front} – erst die Karte davor aufdecken`, `${c.front} – uncover the card before first`) : tr(locale, `${c.front} – aufdecken`, `${c.front} – uncover`)}
                onClick={() => can && dispatch({ type: 'flip', index: i })}
              >
                <motion.span className="flip-inner" initial={false} animate={{ rotateY: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                  <span className="flip-face front" aria-hidden={open}>
                    <span className="flip-icon" aria-hidden="true">{c.icon}</span>
                    <span className="flip-label">{inline(c.front, `f${i}`)}</span>
                    <span className="flip-tap" aria-hidden="true">{locked ? '🔒' : tr(locale, 'Antippen', 'Tap')}</span>
                  </span>
                  <span className="flip-face back" aria-hidden={!open}>
                    <span className="flip-mini" aria-hidden="true">{c.icon} {inline(c.front, `m${i}`)}</span>
                    <span className="flip-back">{inline(c.back, `b${i}`)}</span>
                  </span>
                </motion.span>
              </button>
              {chain && (i < params.cards.length - 1 || params.layout === 'cycle') && (
                <span className={`flip-arrow ${open ? 'lit' : ''}`} aria-hidden="true">{i === params.cards.length - 1 ? '↺' : '↓'}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className={`flip-progress ${all ? 'done' : ''}`} aria-live="polite">
        <span className="dots" aria-hidden="true">{state.open.map((o, i) => <i key={i} className={o ? 'on' : ''} />)}</span>
        {all ? tr(locale, 'Alles entdeckt!', 'All discovered!') : tr(locale, `${opened} von ${params.cards.length} entdeckt`, `${opened} of ${params.cards.length} discovered`)}
      </p>
    </div>
  );
}
