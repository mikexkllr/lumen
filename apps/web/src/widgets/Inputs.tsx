/** Choice, numeric and expression input widgets. */
import { useEffect, useMemo, useRef } from 'react';
import { optionIds, type ChoiceParams, type ChoiceState, type ExpressionParams, type ExpressionState, type NumericParams, type NumericState } from '@lumen/engine';
import { inline } from '../lib/markdown.tsx';
import { tr, type WidgetViewProps } from './types.ts';

export function ChoiceView({ params, state, dispatch, readOnly, result, labelledBy, locale }: WidgetViewProps<ChoiceParams, ChoiceState>) {
  const ids = optionIds(params);
  const byId = Object.fromEntries(ids.map((id, i) => [id, params.options[i]]));
  return (
    <div className={`w-options ${params.layout === 'grid' ? 'grid' : ''}`} role="group" aria-labelledby={labelledBy}>
      {params.multiple && <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>{tr(locale, 'Mehrere Antworten möglich.', 'Several answers possible.')}</p>}
      {state.order.map((id, i) => {
        const selected = state.selected.includes(id);
        const res = selected && result ? result : undefined;
        return (
          <button
            key={id}
            type="button"
            className="option"
            aria-pressed={selected}
            data-result={res}
            disabled={readOnly}
            onClick={() => dispatch({ type: 'toggle', id })}
          >
            <span className="key" aria-hidden="true">{params.multiple ? (selected ? '✓' : '') : String.fromCharCode(65 + i)}</span>
            <span>{inline(byId[id].label, id)}</span>
            {res && <span className="sr-only">{res === 'ok' ? tr(locale, 'richtig', 'correct') : tr(locale, 'falsch', 'wrong')}</span>}
          </button>
        );
      })}
    </div>
  );
}

const isCoarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function Keypad({ keys, onKey, disabled, locale }: { keys: string[]; onKey(k: string): void; disabled: boolean; locale: string }) {
  return (
    <div className="keypad" role="group" aria-label={tr(locale, 'Bildschirmtastatur', 'On-screen keypad')}>
      {keys.map((k) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onKey(k)} aria-label={k === '⌫' ? tr(locale, 'Löschen', 'Delete') : k === '−' ? 'Minus' : k === ' ' ? tr(locale, 'Leerzeichen (für gemischte Zahlen)', 'Space (mixed numbers)') : k}>
          {k === ' ' ? '␣' : k}
        </button>
      ))}
    </div>
  );
}

export function NumericView({ params, state, dispatch, readOnly, labelledBy, onSubmit, locale, result }: WidgetViewProps<NumericParams, NumericState>) {
  const ref = useRef<HTMLInputElement>(null);
  const coarse = useMemo(isCoarse, []);
  useEffect(() => {
    if (!readOnly && !coarse) ref.current?.focus({ preventScroll: true });
  }, [readOnly, coarse]);
  const decimal = locale.startsWith('de') ? ',' : '.';
  const press = (k: string) => {
    if (k === '⌫') dispatch({ type: 'input', value: state.input.slice(0, -1) });
    else dispatch({ type: 'input', value: state.input + (k === '−' ? '-' : k) });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <div className="num-input">
        {params.prefix && <span>{params.prefix}</span>}
        <input
          ref={ref}
          type="text"
          inputMode={params.keypad && coarse ? 'none' : 'decimal'}
          autoComplete="off"
          spellCheck={false}
          aria-labelledby={labelledBy}
          aria-invalid={result === 'bad' || undefined}
          placeholder={params.placeholder ?? '?'}
          value={state.input}
          readOnly={readOnly}
          onChange={(e) => dispatch({ type: 'input', value: e.target.value })}
        />
        {params.unit && <span>{params.unit}</span>}
      </div>
      {params.keypad && !readOnly && <Keypad keys={['7', '8', '9', '⌫', '4', '5', '6', '/', '1', '2', '3', '−', '0', decimal, ' ']} onKey={press} disabled={readOnly} locale={locale} />}
    </form>
  );
}

export function ExpressionView({ params, state, dispatch, readOnly, labelledBy, onSubmit, locale }: WidgetViewProps<ExpressionParams, ExpressionState>) {
  const ref = useRef<HTMLInputElement>(null);
  const insert = (k: string) => {
    dispatch({ type: 'input', value: k === '⌫' ? state.input.slice(0, -1) : state.input + k });
    ref.current?.focus({ preventScroll: true });
  };
  const symbols = [...params.variables, '+', '−', '·', '/', '(', ')', '^', '⌫'];
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <div className="num-input">
        {params.prefix && <span>{params.prefix}</span>}
        <input
          ref={ref}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-labelledby={labelledBy}
          placeholder={params.placeholder ?? tr(locale, 'z. B. 2x + 3', 'e.g. 2x + 3')}
          value={state.input}
          readOnly={readOnly}
          onChange={(e) => dispatch({ type: 'input', value: e.target.value })}
        />
      </div>
      {!readOnly && (
        <div className="keypad" role="group" aria-label={tr(locale, 'Symbole', 'Symbols')}>
          {symbols.map((k) => (
            <button key={k} type="button" onClick={() => insert(k === '−' ? '-' : k === '·' ? '*' : k)} aria-label={k === '⌫' ? tr(locale, 'Löschen', 'Delete') : k}>
              {k}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
