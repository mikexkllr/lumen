/**
 * Lux chat panel: a bottom sheet on phones, a floating panel on desktop.
 * The conversation lives in the step (see useLux) so it survives closing and
 * reopening while the learner retries.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { reasoningQuestion, type TutorContext, type TutorIntent, type TutorStatus } from '@lumen/engine';
import { askLux, reportLux, tutorStatus, userTextFor, type LuxMessage, type LuxReportReason, type TutorStatusInfo } from '../lib/tutor.ts';
import { useApp } from '../lib/store.tsx';
import { isKid } from '../lib/settings.ts';
import { Markdown } from '../lib/markdown.tsx';
import { Icon } from './ui.tsx';
import { Lux, type LuxMood } from './Lux.tsx';
import { href } from '../lib/router.ts';

const REPORT_REASONS: LuxReportReason[] = ['wrong', 'solution', 'inappropriate', 'other'];

/** Inline form to flag a Lux reply (stores require reporting AI content without leaving the app). */
function ReportForm({ onSend, onCancel }: { onSend(reason: LuxReportReason): Promise<void>; onCancel(): void }) {
  const { t } = useApp();
  const [reason, setReason] = useState<LuxReportReason | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="lux-report" role="group" aria-label={t('lux.report.title')}>
      <span className="small">{t('lux.report.title')}</span>
      <div className="row wrap" style={{ gap: 6 }}>
        {REPORT_REASONS.map((r) => <button key={r} type="button" className="lux-chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{t(`lux.report.${r}` as 'lux.report.wrong')}</button>)}
      </div>
      <span className="tiny faint">{t('lux.report.note')}</span>
      {err && <span className="small" role="alert">{t('lux.report.error')}</span>}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn primary small" disabled={!reason || busy} onClick={async () => { setBusy(true); setErr(false); try { await onSend(reason!); } catch { setErr(true); } finally { setBusy(false); } }}>{t('lux.report.send')}</button>
        <button type="button" className="btn quiet small" onClick={onCancel}>{t('lux.report.cancel')}</button>
      </div>
    </div>
  );
}

export interface LuxState {
  messages: LuxMessage[];
  busy: boolean;
  used: boolean;
  lastSource: 'llm' | 'rules' | null;
  /** True when the last answer came from the rule tutor because the server was unreachable. */
  offline: boolean;
  /** Lux asked how the learner got to their answer and waits for the reply. */
  awaiting: boolean;
  send(intent: TutorIntent, message?: string): Promise<void>;
  /** Lux opens by asking how the learner got to their (wrong) answer. */
  askReasoning(): Promise<void>;
  /** Waiting for the learner to allow (or decline) the language model before the first answer. */
  consent: TutorStatusInfo | null;
  decideConsent(allow: boolean): void;
  /** Flags the assistant reply at `index` for the moderators. */
  report(index: number, reason: LuxReportReason): Promise<void>;
}

/** What Lux does when the panel opens: a quick action, or first ask for the learner's reasoning. */
export type LuxOpener = TutorIntent | 'ask-reasoning';

/** Conversation state for one step. `getContext` is read at send time so Lux always sees the current answer. */
export function useLux(getContext: () => TutorContext, opts: { revisit?: boolean } = {}): LuxState {
  const { settings, updateSettings } = useApp();
  const [messages, setMessages] = useState<LuxMessage[]>([]);
  const [consent, setConsent] = useState<{ info: TutorStatusInfo; intent: TutorIntent; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSource, setLastSource] = useState<'llm' | 'rules' | null>(null);
  const [offline, setOffline] = useState(false);
  const ctxRef = useRef(getContext);
  ctxRef.current = getContext;
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const send = useCallback(
    async (intent: TutorIntent, message?: string, decided?: boolean) => {
      const allowed = settings.tutor !== false && !isKid(settings);
      // An own API key is set up explicitly (with the same notice), so it counts as consent.
      const byok = allowed && settings.tutorByok ? settings.tutorByok : null;
      const granted = decided ?? (settings.tutorConsent === true || !!byok);
      // Before the first answer from the language model, ask (Apple 5.1.2: sharing data with an AI service).
      if (allowed && !granted && decided === undefined) {
        const info = await tutorStatus();
        if (info?.model) {
          setConsent({ info, intent, message });
          return;
        }
      }
      const ctx = ctxRef.current();
      const history = msgsRef.current;
      const userMsg: LuxMessage = { role: 'user', content: userTextFor(intent, ctx.locale, message) };
      setMessages((m) => [...m, userMsg]);
      setBusy(true);
      const started = Date.now();
      const ans = await askLux(ctx, history, intent, message, allowed && granted, byok);
      // a short beat so even instant rule answers feel like Lux thought about it
      const wait = Math.max(0, 550 - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      setMessages((m) => [...m, { role: 'assistant', content: ans.reply, source: ans.source, model: ans.model }]);
      setLastSource(ans.source);
      setOffline(ans.source === 'rules' && ['offline', 'unavailable', 'disabled'].includes(ans.fallback ?? ''));
      setBusy(false);
    },
    [settings],
  );
  const revisit = !!opts.revisit;
  const askReasoning = useCallback(async () => {
    const question = reasoningQuestion(ctxRef.current(), { revisit });
    setBusy(true);
    await new Promise((r) => setTimeout(r, 450));
    setMessages((m) => [...m, { role: 'assistant', content: question, source: 'rules', ask: true }]);
    setBusy(false);
  }, [revisit]);
  const decideConsent = useCallback(
    (allow: boolean) => {
      const pending = consent;
      setConsent(null);
      updateSettings(allow ? { tutorConsent: true } : { tutor: false, tutorConsent: false });
      if (pending) void send(pending.intent, pending.message, allow);
    },
    [consent, send, updateSettings],
  );
  const report = useCallback(async (index: number, reason: LuxReportReason) => {
    const m = msgsRef.current[index];
    if (!m || m.role !== 'assistant') return;
    const ctx = ctxRef.current();
    const question = [...msgsRef.current.slice(0, index)].reverse().find((x) => x.role === 'user')?.content;
    await reportLux({ reason, reply: m.content, question, task: ctx.task, kind: ctx.kind, locale: ctx.locale, model: m.model });
    setMessages((list) => list.map((x, i) => (i === index ? { ...x, reported: true } : x)));
  }, []);
  const last = messages[messages.length - 1];
  return { messages, busy, used: messages.length > 0, lastSource, offline, awaiting: !!last?.ask, send, askReasoning, consent: consent?.info ?? null, decideConsent, report };
}

const CHIPS: Record<TutorStatus, TutorIntent[]> = {
  unanswered: ['explain-task', 'hint'],
  wrong: ['why-wrong', 'hint', 'rephrase'],
  correct: ['why-right', 'rephrase'],
  revealed: ['why-right', 'rephrase'],
  explain: ['simpler', 'example', 'deeper', 'quiz'],
};

function Typed({ text, instant, onTick }: { text: string; instant: boolean; onTick(): void }) {
  const words = text.split(/(\s+)/);
  const [n, setN] = useState(instant ? words.length : 0);
  useEffect(() => {
    if (n >= words.length) return;
    const id = setTimeout(() => {
      setN((k) => Math.min(words.length, k + 2));
      onTick();
    }, 28);
    return () => clearTimeout(id);
  }, [n, words.length, onTick]);
  if (n >= words.length) return <Markdown text={text} />;
  return <p>{words.slice(0, n).join('').replace(/\$/g, '')}</p>;
}

export function LuxChat({
  open,
  onClose,
  lux,
  status,
  autoIntent,
  autoKey,
  action,
  reduce,
}: {
  open: boolean;
  onClose(): void;
  lux: LuxState;
  status: TutorStatus;
  /** Sent once per key when the panel opens. */
  autoIntent?: LuxOpener | null;
  /** Identifies the situation; the auto question is asked once per key. */
  autoKey?: string | null;
  /** Main way back to the task, e.g. "Try again". */
  action?: { label: string; onClick(): void } | null;
  reduce: boolean;
}) {
  const { t, settings } = useApp();
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState<number | null>(null);
  const [info, setInfo] = useState<TutorStatusInfo | null | undefined>(undefined);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentAuto = useRef<string | null>(null);
  const seen = useRef(0);

  useEffect(() => {
    if (!open) return;
    tutorStatus().then(setInfo);
    if (autoIntent && autoKey && sentAuto.current !== autoKey && !lux.busy) {
      sentAuto.current = autoKey;
      void (autoIntent === 'ask-reasoning' ? lux.askReasoning() : lux.send(autoIntent));
    }
    // Only with a mouse/trackpad: on touch screens the keyboard would cover the sheet
    // (and the consent question) as soon as Lux opens.
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    const id = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoKey]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [open, onClose]);

  const scroll = useCallback(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(scroll, [lux.messages.length, lux.busy, open, scroll]);

  const awaiting = lux.awaiting && status === 'wrong';
  const submit = () => {
    const text = draft.trim();
    if (!text || lux.busy) return;
    setDraft('');
    void lux.send(awaiting ? 'reasoning' : 'chat', text.slice(0, 500));
  };

  const mood: LuxMood = lux.busy ? 'think' : status === 'correct' ? 'happy' : status === 'wrong' && lux.messages.length < 2 ? 'oops' : 'idle';
  const online = settings.tutor !== false && !isKid(settings) && info;
  const sub = lux.busy
    ? t('lux.thinking')
    : settings.tutorByok && settings.tutor !== false && !isKid(settings) && !lux.offline
      ? t('lux.byok', { model: settings.tutorByok.model })
    : online && !lux.offline
      ? info.local
        ? t('lux.local', { model: info.model ?? '' })
        : t('lux.cloud')
      : info === undefined
        ? t('lux.role')
        : t('lux.offline');
  const lastIdx = lux.messages.length - 1;
  const fresh = lux.messages.length > seen.current ? seen.current : lux.messages.length;
  useEffect(() => {
    seen.current = lux.messages.length;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="lux-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
          <motion.section
            key="sheet"
            className="lux-sheet"
            role="dialog"
            aria-modal="false"
            aria-label={t('lux.dialog')}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <header className="lux-head">
              <Lux mood={mood} size={40} still={reduce} />
              <div className="who">
                <div className="name">Lux</div>
                <div className="sub" aria-live="polite">{sub}</div>
              </div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label={t('lux.close')}>
                <Icon name="close" size={19} />
              </button>
            </header>
            <div className="lux-log" ref={logRef} aria-live="polite">
              {lux.messages.length === 0 && !lux.busy && (
                <div className="lux-row">
                  <div className="lux-msg lux">
                    <p>{t(status === 'explain' ? 'lux.hello.explain' : status === 'wrong' ? 'lux.hello.wrong' : status === 'unanswered' ? 'lux.hello.task' : 'lux.hello.done')}</p>
                  </div>
                </div>
              )}
              {lux.messages.map((m, i) => (
                <motion.div key={i} className={`lux-row ${m.role === 'user' ? 'me' : ''}`} initial={reduce || i < fresh ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                  <div className={`lux-msg ${m.role === 'user' ? 'me' : 'lux'}`}>
                    {m.role === 'assistant' ? <Typed text={m.content} instant={reduce || i < fresh || i !== lastIdx} onTick={scroll} /> : <p>{m.content}</p>}
                  </div>
                  {m.role === 'assistant' && m.source === 'llm' && info?.reports && (
                    m.reported ? <span className="lux-reported">{t('lux.report.thanks')}</span>
                    : reporting === i ? <ReportForm onCancel={() => setReporting(null)} onSend={(reason) => lux.report(i, reason).then(() => setReporting(null))} />
                    : <button type="button" className="lux-flag" onClick={() => setReporting(i)}><Icon name="flag" size={12} /> {t('lux.report')}</button>
                  )}
                </motion.div>
              ))}
              {lux.consent && (
                <div className="lux-row">
                  <div className="lux-msg lux lux-consent" role="group" aria-labelledby="lux-consent-h">
                    <strong id="lux-consent-h">{t('lux.consent.title')}</strong>
                    <p>{lux.consent.local || !lux.consent.provider ? t('lux.consent.bodyLocal', { model: lux.consent.model ?? '' }) : t('lux.consent.body', { model: lux.consent.model ?? '', provider: lux.consent.provider })}</p>
                    <p className="small faint">{t('lux.consent.note')} <a href={href('legal/privacy')}>{t('legal.privacy')}</a></p>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button type="button" className="btn primary small" onClick={() => lux.decideConsent(true)}>{t('lux.consent.allow')}</button>
                      <button type="button" className="btn small" onClick={() => lux.decideConsent(false)}>{t('lux.consent.decline')}</button>
                    </div>
                  </div>
                </div>
              )}
              {lux.busy && (
                <div className="lux-row">
                  <div className="lux-msg lux lux-typing" aria-label={t('lux.thinking')}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>
            <div className="lux-chips" role="group" aria-label={t('lux.quick')}>
              {action && (
                <button type="button" className="lux-chip primary" onClick={action.onClick}>
                  <Icon name="reset" size={14} /> {action.label}
                </button>
              )}
              {awaiting && (
                <button type="button" className="lux-chip" disabled={lux.busy} onClick={() => void lux.send('reasoning', t('lux.guessedText'))}>
                  {t('lux.chip.guessed')}
                </button>
              )}
              {CHIPS[status].filter((intent) => !awaiting || intent !== 'rephrase').map((intent) => (
                <button key={intent} type="button" className="lux-chip" disabled={lux.busy || !!lux.consent} onClick={() => void lux.send(intent)}>
                  {t(`lux.chip.${intent}` as 'lux.chip.hint')}
                </button>
              ))}
            </div>
            <form
              className="lux-input"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t(awaiting ? 'lux.placeholder.reason' : 'lux.placeholder')} aria-label={t(awaiting ? 'lux.placeholder.reason' : 'lux.placeholder')} maxLength={500} enterKeyHint="send" />
              <button type="submit" className="lux-send" disabled={!draft.trim() || lux.busy || !!lux.consent} aria-label={t('lux.send')}>
                <Icon name="send" size={18} />
              </button>
            </form>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

/** Round mascot button that opens Lux. */
export function LuxButton({ onClick, label, mood = 'idle', badge = false, reduce }: { onClick(): void; label: string; mood?: LuxMood; badge?: boolean; reduce: boolean }) {
  return (
    <button type="button" className="lux-btn" onClick={onClick} aria-label={label} title={label}>
      <Lux mood={mood} size={34} still={reduce} />
      {badge && <span className="lux-dot" aria-hidden="true" />}
    </button>
  );
}
