/**
 * Focused micro-learning player. Top: close + segmented progress + combo.
 * Middle: one step at a time (slides in). Bottom: action bar that turns into
 * a feedback panel (correct / wrong / solution). Two attempts per problem,
 * "show solution" at any time after the first miss.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addDays,
  buildExplainContext,
  buildTutorContext,
  checkProblem,
  dailyPuzzle,
  dailyQuests,
  deriveAchievements,
  levelInfo,
  openMistakes,
  deriveRating,
  getWidget,
  initialState,
  isAnswered,
  placementRecommendation,
  prerequisiteItems,
  randomSeed,
  referenceSolve,
  resolveProblem,
  weekKey,
  type ProblemStep,
  type ResolvedProblem,
  type Step,
  type TutorStatus,
} from '@lumen/engine';
import { Confetti, CountUp, Cover, topicVars } from '../components/art.tsx';
import { Icon } from '../components/ui.tsx';
import { Lux } from '../components/Lux.tsx';
import { LuxButton, LuxChat, useLux, type LuxOpener } from '../components/LuxChat.tsx';
import { inline, Markdown } from '../lib/markdown.tsx';
import { reportProblem } from '../lib/report.ts';
import { navigate } from '../lib/router.ts';
import { prefersReducedMotion } from '../lib/settings.ts';
import { play, vibrate } from '../lib/sound.ts';
import { useApp, type NewEvent } from '../lib/store.tsx';
import { VIEWS, Visual } from '../widgets/index.tsx';
import { TIER_COLORS } from '../lib/gamify.ts';

export type PlayerMode = { kind: 'lesson'; conceptId: string } | { kind: 'review'; itemIds: string[]; unitId?: string } | { kind: 'placement' } | { kind: 'daily' } | { kind: 'mistakes'; topicId: string };

interface PlayItem {
  key: string;
  step: Step;
  conceptId?: string;
  topicId?: string;
  itemId?: string;
  seed: number;
  /** Revisiting an earlier mistake: the learner's wrong answer, Lux explains it first. */
  revisit?: { state: unknown };
}

type Phase = 'answering' | 'wrong' | 'correct' | 'revealed';

const TUTOR_STATUS: Record<Phase, Exclude<TutorStatus, 'explain'>> = { answering: 'unanswered', wrong: 'wrong', correct: 'correct', revealed: 'revealed' };

function lessonTitles(app: ReturnType<typeof useApp>, item: PlayItem): { course?: string; lesson?: string } {
  const lib = app.lib;
  return {
    course: item.topicId ? lib?.catalog.topics.find((tp) => tp.id === item.topicId)?.title : undefined,
    lesson: item.conceptId ? lib?.catalog.concepts[item.conceptId]?.title : undefined,
  };
}

interface Outcome {
  problem: boolean;
  firstTry: boolean;
  correct: boolean;
  /** Set when the learner went wrong – used for the review with Lux at the end. */
  mistake?: { item: PlayItem; state: unknown };
}

/** At most this many mistakes are revisited in one go. */
const MAX_REVISITS = 12;

const EASE = [0.2, 0.8, 0.2, 1] as const;

const depthOf = (it?: PlayItem) => it?.step.depth ?? 1;
const DEPTH_KEY = 'lumen.depth.v1';
/** Deepest stage reached per lesson (device-local), so a return visit can pick up there. */
function readDepths(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DEPTH_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function saveDepth(conceptId: string, depth: number) {
  try {
    const all = readDepths();
    if ((all[conceptId] ?? 0) >= depth) return;
    localStorage.setItem(DEPTH_KEY, JSON.stringify({ ...all, [conceptId]: depth }));
  } catch {
    /* storage not available */
  }
}

/** Reads a text aloud with the browser's speech synthesis (formulas and markup stripped). */
function speak(text: string, locale: string) {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const plain = text.replace(/\$\$?([^$]+)\$\$?/g, ' $1 ').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 / $2').replace(/\\[a-zA-Z]+/g, ' ').replace(/[*_`{}\\]/g, '').replace(/\s+/g, ' ');
  const u = new SpeechSynthesisUtterance(plain);
  u.lang = locale.startsWith('de') ? 'de-DE' : 'en-US';
  u.rate = 0.98;
  speechSynthesis.speak(u);
}

export function Player({ mode }: { mode: PlayerMode }) {
  const app = useApp();
  const { lib, t } = app;
  const [items, setItems] = useState<PlayItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [stepDone, setStepDone] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [done, setDone] = useState(false);
  const [combo, setCombo] = useState(0);
  const [placementResult, setPlacementResult] = useState<{ topic: string; unit?: string } | null>(null);
  /** Lux walks through the mistakes of the finished session. */
  const [reviewing, setReviewing] = useState(false);
  const [lessonMistakes, setLessonMistakes] = useState(0);
  /** Stage gate: shown before the lesson goes one level deeper (or when resuming a lesson at a deeper stage). */
  const [gate, setGate] = useState<{ depth: number; resume?: boolean } | null>(null);
  const startedAt = useRef(Date.now());
  const xpBefore = useRef(app.progress.xpTotal);
  const before = useRef<Snapshot | null>(null);
  if (!before.current) before.current = snapshot(app);
  const pulledPrereqs = useRef(false);
  const reduce = prefersReducedMotion(app.settings);

  useEffect(() => {
    if (!lib) return;
    let cancelled = false;
    const findItem = async (itemId: string): Promise<PlayItem | null> => {
      const conceptId = itemId.split('/')[0];
      const meta = lib.catalog.concepts[conceptId];
      if (!meta) return null;
      const c = await lib.concept(conceptId);
      const step = c.steps.find((s) => s.id === itemId);
      const seed = randomSeed();
      return step ? { key: `${itemId}#${seed}`, step, conceptId, topicId: meta.topicId, itemId, seed } : null;
    };
    (async () => {
      try {
        let list: PlayItem[] = [];
        if (mode.kind === 'lesson') {
          const c = await lib.concept(mode.conceptId);
          const topicId = lib.catalog.concepts[c.id].topicId;
          list = c.steps.map((s) => ({ key: s.id, step: s, conceptId: c.id, topicId, seed: 0 }));
          // Coming back to a finished lesson that still has deeper stages: offer to continue there.
          const reached = readDepths()[c.id] ?? 0;
          const maxDepth = Math.max(...list.map(depthOf));
          const resumeAt = list.findIndex((it) => depthOf(it) > reached);
          if (!cancelled && app.progress.completedConcepts.has(c.id) && reached >= 1 && reached < maxDepth && resumeAt > 0) {
            setIndex(resumeAt);
            setGate({ depth: depthOf(list[resumeAt]), resume: true });
          }
        } else if (mode.kind === 'daily') {
          const dp = dailyPuzzle(lib.catalog, app.today);
          if (!dp) throw new Error('No daily puzzle available');
          const c = await lib.concept(dp.conceptId);
          const step = c.steps.find((s) => s.id === dp.itemId);
          if (step) list = [{ key: `daily-${app.today}`, step, conceptId: dp.conceptId, topicId: dp.topicId, seed: dp.seed }];
        } else if (mode.kind === 'mistakes') {
          for (const m of openMistakes(app.events, { topicId: mode.topicId }).slice(-MAX_REVISITS)) {
            if (!m.conceptId || !lib.catalog.concepts[m.conceptId]) continue;
            const c = await lib.concept(m.conceptId);
            const step = c.steps.find((s) => s.id === m.stepId);
            if (step?.kind === 'problem') list.push({ key: `rev-${m.stepId}`, step, conceptId: m.conceptId, topicId: m.topicId, seed: m.seed, revisit: { state: m.state } });
          }
          if (!list.length) throw new Error(t('mistakes.none'));
        } else if (mode.kind === 'review') {
          for (const itemId of mode.itemIds) {
            const it = await findItem(itemId);
            if (it) list.push(it);
          }
        } else {
          const p = lib.catalog.placement;
          if (!p) throw new Error('Keine Einstufung vorhanden');
          list = p.items.map((it) => ({ key: it.step.id!, step: it.step as ProblemStep, seed: 0 }));
        }
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, JSON.stringify(mode)]);

  const item = items?.[index];
  const topic = lib?.catalog.topics.find((tp) => tp.id === (item?.topicId ?? (mode.kind === 'lesson' ? lib.catalog.concepts[mode.conceptId]?.topicId : undefined)));

  const finish = (finalOutcomes: Outcome[]) => {
    const problems = finalOutcomes.filter((o) => o.problem);
    const durationMs = Date.now() - startedAt.current;
    const evts: NewEvent[] = [];
    if (reviewing || mode.kind === 'mistakes') {
      // a mistakes review only logs its attempts
    } else if (mode.kind === 'lesson' && items?.[0]) {
      evts.push({ type: 'concept_completed', conceptId: mode.conceptId, topicId: items[0].topicId!, problems: problems.length, firstTryCorrect: problems.filter((o) => o.firstTry).length, durationMs });
    } else if (mode.kind === 'review') {
      evts.push({ type: 'review_session_completed', items: problems.length, correct: problems.filter((o) => o.correct).length, unitId: mode.unitId });
    } else if (mode.kind === 'placement' && lib?.catalog.placement) {
      const rec = placementRecommendation(lib.catalog.placement, finalOutcomes.map((o) => o.correct));
      evts.push({ type: 'placement_completed', topicId: rec.topic, unitId: rec.unit, correct: problems.filter((o) => o.correct).length, total: problems.length });
      const path = lib.catalog.paths.find((p) => p.topics.includes(rec.topic));
      app.updateSettings({ startAt: rec, pathId: path?.id ?? app.settings.pathId, onboarded: true });
      setPlacementResult(rec);
    }
    app.addEvents(evts);
    if (mode.kind === 'lesson' && !reviewing && item) saveDepth(mode.conceptId, depthOf(item));
    play(app.settings.sound, 'complete');
    vibrate(app.settings.haptics, [20, 60, 40]);
    setDone(true);
  };

  const advance = (o: Outcome & { rating?: 1 | 2 | 3 | 4 }) => {
    if (mode.kind === 'review' && item?.itemId && o.rating === 1 && !pulledPrereqs.current && lib) {
      pulledPrereqs.current = true;
      const exclude = new Set(items!.map((i) => i.itemId!).filter(Boolean));
      const extra = prerequisiteItems(item.itemId, app.reviewItems, lib.catalog, exclude, 2);
      Promise.all(
        extra.map(async (x) => {
          const c = await lib.concept(x.conceptId);
          const step = c.steps.find((s) => s.id === x.itemId);
          const seed = randomSeed();
          return step ? ({ key: `${x.itemId}#${seed}`, step, conceptId: x.conceptId, topicId: x.topicId, itemId: x.itemId, seed } as PlayItem) : null;
        }),
      ).then((more) => setItems((cur) => (cur ? [...cur, ...(more.filter(Boolean) as PlayItem[])] : cur)));
    }
    if (o.problem) setCombo((c) => (o.firstTry ? c + 1 : 0));
    const next = [...outcomes, o];
    setOutcomes(next);
    setStepDone(false);
    if (items && index + 1 < items.length) {
      if (mode.kind === 'lesson' && !reviewing && depthOf(items[index + 1]) > depthOf(items[index])) {
        saveDepth(mode.conceptId, depthOf(items[index]));
        play(app.settings.sound, 'achievement');
        setGate({ depth: depthOf(items[index + 1]) });
      }
      setIndex(index + 1);
    } else finish(next);
  };

  const startReview = () => {
    const list = outcomes.flatMap((o) => (o.mistake ? [{ ...o.mistake.item, key: `${o.mistake.item.key}-rev`, revisit: { state: o.mistake.state } }] : [])).slice(0, MAX_REVISITS);
    if (!list.length) return;
    setLessonMistakes(list.length);
    setItems(list);
    setIndex(0);
    setOutcomes([]);
    setCombo(0);
    setStepDone(false);
    setReviewing(true);
    setDone(false);
    startedAt.current = Date.now();
  };

  const exit = () => {
    if (!done && index > 0 && !confirm(t('player.leave'))) return;
    navigate(mode.kind === 'placement' ? 'onboarding' : '');
  };

  if (error) return <div className="complete"><div className="complete-inner"><p role="alert">{error}</p><button className="btn primary" onClick={() => navigate('')}>{t('complete.home')}</button></div></div>;
  if (!items) return <div className="loading-screen"><span aria-busy="true">{t('loading')}</span></div>;
  if (done && (reviewing || mode.kind === 'mistakes')) return <MistakesDone outcomes={outcomes} topicId={topic?.id} afterLesson={reviewing ? lessonMistakes : 0} nextConcept={mode.kind === 'lesson' ? mode.conceptId : undefined} />;
  if (gate && items) {
    const rest = items.slice(index).filter((it) => depthOf(it) === gate.depth).length;
    return (
      <DepthGate
        depth={gate.depth}
        resume={!!gate.resume}
        steps={rest}
        color={topic?.color}
        onGo={() => setGate(null)}
        onStop={() => {
          if (gate.resume) {
            setIndex(0);
            setGate(null);
          } else {
            setGate(null);
            setIndex(index - 1);
            finish(outcomes);
          }
        }}
      />
    );
  }
  if (done) return <Complete mode={mode} outcomes={outcomes} xpGained={app.progress.xpTotal - xpBefore.current} placementResult={placementResult} durationMs={Date.now() - startedAt.current} topicId={topic?.id} before={before.current!} onReviewMistakes={startReview} depth={mode.kind === 'lesson' && items.length ? { reached: depthOf(items[Math.min(index, items.length - 1)]), max: Math.max(...items.map(depthOf)) } : undefined} />;

  return (
    <div className="lesson" style={topicVars(topic?.color)}>
      <div className="lesson-top">
        <div className="inner">
          <button className="icon-btn" onClick={exit} aria-label={t('player.close')}>
            <Icon name="close" size={22} />
          </button>
          <div className="seg-progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={index + 1} aria-label={t('player.progress', { n: index + 1, total: items.length })}>
            {items.map((it, i) => <span key={it.key} className={`seg d${depthOf(it)} ${i > 0 && depthOf(it) > depthOf(items[i - 1]) ? 'gate' : ''} ${i < index || (i === index && stepDone) ? 'done' : i === index ? 'current' : ''}`}><i /></span>)}
          </div>
          <AnimatePresence initial={false}>
            {combo >= 2 && (
              <motion.span key="combo" className="combo" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }} aria-label={t('player.comboN', { n: combo })}>
                <Icon name="flame" size={15} /> <motion.span key={combo} initial={reduce ? false : { y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{combo}</motion.span>
              </motion.span>
            )}
          </AnimatePresence>
          {combo < 2 && <span className="lesson-count" aria-hidden="true">{index + 1}/{items.length}</span>}
        </div>
      </div>
      {item && <StepView key={item.key} item={item} mode={mode} combo={combo} onConcluded={() => setStepDone(true)} onDone={advance} />}
    </div>
  );
}

/** Between two stages of a lesson: celebrate, say what comes next, let the learner stop here. */
function DepthGate({ depth, resume, steps, color, onGo, onStop }: { depth: number; resume: boolean; steps: number; color?: string; onGo(): void; onStop(): void }) {
  const { t, settings } = useApp();
  const reduce = prefersReducedMotion(settings);
  const d = (depth === 3 ? 3 : 2) as 2 | 3;
  return (
    <main className="complete depth-gate" id="main" style={topicVars(color)}>
      {!resume && <Confetti reduce={reduce} color={color} />}
      <div className="complete-inner">
        <div className="complete-lux"><Lux mood={resume ? 'happy' : 'cheer'} size={104} still={reduce} /></div>
        <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1, ease: EASE }}>
          <p className="eyebrow">{resume ? t('depth.resume') : t(`depth.done${(d - 1) as 1 | 2}`)}</p>
          <h1 className="display" style={{ fontSize: '1.9rem', marginTop: 8 }}>{t(`depth.title${d}`)}</h1>
          <p className="lead" style={{ margin: '8px 0 0' }}>{t(`depth.body${d}`)}</p>
        </motion.div>
        <motion.ol className="depth-ladder" aria-label={t('depth.ladder')} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25, ease: EASE }}>
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className={n < depth ? 'done' : n === depth ? 'now' : ''}>
              <span className="rung">{n < depth ? <Icon name="check" size={14} strokeWidth={3} /> : n}</span>
              <span>{t(`depth.name${n}`)}</span>
            </li>
          ))}
        </motion.ol>
        <div className="complete-actions" style={{ marginTop: 26 }}>
          <button className="btn primary lg block" autoFocus onClick={onGo}>
            {t('depth.go', { n: steps })} <Icon name="arrow" size={18} className="arrow" />
          </button>
          <button className="btn lg block quiet" onClick={onStop}>{resume ? t('depth.restart') : t('depth.stop')}</button>
        </div>
      </div>
    </main>
  );
}

type LogBase = { stepId: string; conceptId?: string; topicId?: string; context: 'lesson' | 'review' | 'unit-review' | 'placement' | 'daily' | 'mistakes'; seed: number };

function Stage({ children, reduce }: { children: React.ReactNode; reduce: boolean }) {
  return (
    <main className="lesson-stage" id="main">
      <motion.div className="stage-inner" initial={reduce ? false : { opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.32, ease: EASE }}>
        {children}
      </motion.div>
    </main>
  );
}

function StepView({ item, mode, combo, onDone, onConcluded }: { item: PlayItem; mode: PlayerMode; combo: number; onDone(o: Outcome & { rating?: 1 | 2 | 3 | 4 }): void; onConcluded(): void }) {
  const app = useApp();
  const { t, settings } = app;
  const locale = settings.locale;
  const reduce = prefersReducedMotion(settings);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepStart = useRef(Date.now());
  const [revealed, setRevealed] = useState(false);
  const [luxOpen, setLuxOpen] = useState(false);
  const [explainAuto, setExplainAuto] = useState<{ intent: LuxOpener; key: string } | null>(null);
  const askCount = useRef(0);
  const explainLux = useLux(() => {
    const s = item.step;
    const text = s.kind === 'explain' ? [s.title, s.body, revealed ? s.reveal?.body : undefined].filter(Boolean).join('\n') : '';
    return buildExplainContext(text, { locale, ...lessonTitles(app, item) });
  });
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); }, []);
  const logBase: LogBase = {
    stepId: item.step.id,
    conceptId: item.conceptId,
    topicId: item.topicId,
    context: item.revisit || mode.kind === 'mistakes' ? 'mistakes' : mode.kind === 'lesson' ? 'lesson' : mode.kind === 'placement' ? 'placement' : mode.kind === 'daily' ? 'daily' : mode.unitId ? 'unit-review' : 'review',
    seed: item.seed,
  };

  if (item.step.kind === 'explain') {
    const s = item.step;
    const needsReveal = !!s.reveal && !revealed;
    const go = () => {
      if (needsReveal) {
        setRevealed(true);
        play(settings.sound, 'reveal');
        return;
      }
      app.addEvents([{ type: 'attempt', ...logBase, problem: false, correct: true, final: true, attemptNo: 1, hintsUsed: 0, durationMs: Date.now() - stepStart.current, difficulty: 1 }]);
      onDone({ problem: false, firstTry: true, correct: true });
    };
    return (
      <>
        <Stage reduce={reduce}>
          <span className="step-chip"><Icon name={s.visual?.interactive ? 'sparkles' : s.reveal ? 'eye' : 'bulb'} size={13} /> {s.visual?.interactive ? t('player.tryIt') : s.reveal ? t('player.think') : t('player.idea')}{(s.depth ?? 1) > 1 ? ` · ${t(`depth.name${s.depth as 2 | 3}`)}` : ''}</span>
          <h1 ref={headingRef} tabIndex={-1} className={s.title ? 'explain-title' : 'sr-only'}>{s.title ?? t('player.idea')}</h1>
          <Markdown text={s.body} className="explain-body" />
          {s.visual && <Visual widget={s.visual.widget} params={s.visual.params} locale={locale} alt={s.visual.alt} interactive={s.visual.interactive} />}
          {s.image && (
            <figure className="visual">
              <img src={s.image.src} alt={s.image.alt} style={{ maxWidth: '100%', borderRadius: 16 }} />
              {s.image.caption && <figcaption className="small muted">{s.image.caption}</figcaption>}
            </figure>
          )}
          {mode.kind !== 'placement' && (
            <div className="explain-tools" role="group" aria-label={t('lux.quick')}>
              {typeof speechSynthesis !== 'undefined' && (
                <button type="button" className="tool-chip" onClick={() => speak([s.title, s.body].filter(Boolean).join('. '), locale)}>
                  <Icon name="volume" size={14} /> {t('player.readAloud')}
                </button>
              )}
              {(['simpler', 'example', 'deeper', 'quiz'] as const).map((intent) => (
                <button key={intent} type="button" className="tool-chip" onClick={() => { setExplainAuto({ intent, key: `${intent}-${++askCount.current}` }); setLuxOpen(true); }}>
                  {t(`lux.chip.${intent}`)}
                </button>
              ))}
            </div>
          )}
          {s.reveal && (
            <div className="reveal-box">
              <AnimatePresence mode="wait" initial={false}>
                {revealed ? (
                  <motion.div key="body" className="reveal-body" initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }} role="status">
                    <Markdown text={s.reveal.body} />
                  </motion.div>
                ) : (
                  <motion.button key="btn" type="button" className="reveal-btn" onClick={go} exit={{ opacity: 0 }}>
                    <Icon name="eye" size={18} /> {s.reveal.label ?? t('player.reveal')}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}
        </Stage>
        <Footer state="idle" onEnter={luxOpen ? undefined : go}>
          <div className="foot-actions">
            {mode.kind !== 'placement' && <LuxButton onClick={() => setLuxOpen(true)} label={t('lux.ask')} reduce={reduce} />}
            <button className={`btn grow ${needsReveal ? 'ghost' : 'primary'}`} onClick={go} autoFocus>{needsReveal ? t('player.reveal') : t('player.continue')}</button>
          </div>
        </Footer>
        <LuxChat open={luxOpen} onClose={() => setLuxOpen(false)} lux={explainLux} status="explain" autoIntent={explainAuto?.intent} autoKey={explainAuto?.key} reduce={reduce} />
      </>
    );
  }
  return <ProblemView item={item} mode={mode} combo={combo} logBase={logBase} onDone={onDone} onConcluded={onConcluded} headingRef={headingRef} stepStart={stepStart} />;
}

/** Fixed bottom bar; Enter triggers the primary action unless focus is on an interactive element. */
function Footer({ state, children, onEnter }: { state: 'idle' | 'correct' | 'wrong' | 'revealed'; children: React.ReactNode; onEnter?: () => void }) {
  useEffect(() => {
    if (!onEnter) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'slider')) return;
      e.preventDefault();
      onEnter();
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [onEnter]);
  return (
    <div className="lesson-foot" data-state={state}>
      <div className="foot-inner">{children}</div>
    </div>
  );
}

function ProblemView({
  item,
  mode,
  combo,
  logBase,
  onDone,
  onConcluded,
  headingRef,
  stepStart,
}: {
  item: PlayItem;
  mode: PlayerMode;
  combo: number;
  logBase: LogBase;
  onDone(o: Outcome & { rating?: 1 | 2 | 3 | 4 }): void;
  onConcluded(): void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  stepStart: React.RefObject<number>;
}) {
  const app = useApp();
  const { t, settings, lib, progress, today } = app;
  const locale = settings.locale;
  const placement = mode.kind === 'placement';
  const reduce = prefersReducedMotion(settings);
  const rp: ResolvedProblem | null = useMemo(() => {
    try {
      return resolveProblem(item.step as ProblemStep, item.seed, locale);
    } catch {
      return null;
    }
  }, [item, locale]);
  const revisit = item.revisit;
  const [state, setState] = useState<unknown>(() => {
    if (!rp) return null;
    if (revisit && !(rp.widget.validateState?.(revisit.state, rp.params) ?? []).length) return revisit.state;
    return initialState(rp);
  });
  const [phase, setPhase] = useState<Phase>(() => (revisit && rp ? 'wrong' : 'answering'));
  const [attemptNo, setAttemptNo] = useState(revisit ? 2 : 1);
  const [hints, setHints] = useState(0);
  const [shownHint, setShownHint] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => {
    if (!revisit || !rp) return null;
    try {
      return checkProblem(rp, state).feedback?.text ?? null;
    } catch {
      return null;
    }
  });
  const [anim, setAnim] = useState<'' | 'shake'>('');
  const [liveText, setLiveText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [xpFloat, setXpFloat] = useState<number | null>(null);
  const firstTry = useRef(true);
  const lastCheck = useRef(Date.now());
  const [praise] = useState(() => t('player.correctAlt'));
  const [luxOpen, setLuxOpen] = useState(false);
  const [luxAuto, setLuxAuto] = useState<{ intent: LuxOpener; key: string } | null>(null);
  /** Lux was asked for help before the task was solved (counts like a hint, allows more attempts). */
  const helped = useRef(!!revisit);
  /** The first wrong answer of this step, to revisit it with Lux at the end. */
  const firstWrong = useRef<unknown>(undefined);
  const lux = useLux(() => buildTutorContext(rp!, state, { status: TUTOR_STATUS[phase], attempts: attemptNo, hintsShown: hints, ...lessonTitles(app, item) }), { revisit: !!revisit });

  useEffect(() => {
    if (!rp || state === null) return;
    const id = setTimeout(() => setLiveText(rp.widget.describe(state, rp.params, locale)), 700);
    return () => clearTimeout(id);
  }, [state, rp, locale]);

  // Revisiting a mistake: Lux opens right away and first asks how the learner got there.
  useEffect(() => {
    if (!revisit || !rp) return;
    const id = setTimeout(() => {
      setLuxAuto({ intent: 'ask-reasoning', key: 'revisit' });
      setLuxOpen(true);
    }, reduce ? 0 : 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!anim) return;
    const id = setTimeout(() => setAnim(''), 600);
    return () => clearTimeout(id);
  }, [anim]);

  if (!rp) return <main className="lesson-stage"><p role="alert">Diese Aufgabe konnte nicht geladen werden ({item.step.id}).</p></main>;
  const View = VIEWS[rp.widget.kind];
  const answered = isAnswered(rp, state);
  const editable = phase === 'answering';
  const difficulty = (item.step as ProblemStep).difficulty ?? 1;
  const earnsXp = (mode.kind === 'lesson' && !!item.conceptId && progress.lastCompleted[item.conceptId] !== today) || mode.kind === 'daily';
  // With Lux at your side you get a few more tries before the solution is shown.
  const maxAttempts = helped.current ? 4 : 2;
  const assisted = hints + (helped.current ? 1 : 0);

  const dispatch = (a: unknown) => {
    if (!editable) return;
    setState((s: unknown) => rp.widget.applyAction(s, a, rp.params));
  };

  const log = (extra: { correct: boolean; final: boolean; revealed?: boolean }) => {
    const now = Date.now();
    app.addEvents([{ type: 'attempt', ...logBase, problem: true, attemptNo, hintsUsed: assisted, durationMs: now - lastCheck.current, difficulty, state, ...extra }]);
    lastCheck.current = now;
  };

  const reveal = (text: string | null) => {
    const sol = referenceSolve(rp);
    if (sol) setState(sol.state);
    setFeedback(text);
    setPhase('revealed');
    onConcluded();
  };

  const check = () => {
    if (!answered || !editable) return;
    const res = checkProblem(rp, state);
    if (placement) {
      log({ correct: res.correct, final: true });
      onDone({ problem: true, firstTry: res.correct, correct: res.correct });
      return;
    }
    if (res.correct) {
      log({ correct: true, final: true });
      setPhase('correct');
      onConcluded();
      if (earnsXp && firstTry.current) setXpFloat(difficulty);
      if (rp.widget.kind === 'teach') setTimeout(() => openLux('teach-feedback'), reduce ? 0 : 900);
      const run = firstTry.current && assisted === 0 ? combo + 1 : 0;
      play(settings.sound, 'correct', run);
      if (run === 3 || run === 5 || run === 10 || (run > 10 && run % 5 === 0)) {
        setTimeout(() => play(settings.sound, 'streak'), 220);
        vibrate(settings.haptics, [15, 40, 15, 40, 25]);
      } else vibrate(settings.haptics, 15);
      return;
    }
    firstTry.current = false;
    if (firstWrong.current === undefined && !revisit) firstWrong.current = state;
    setAnim('shake');
    play(settings.sound, 'wrong');
    vibrate(settings.haptics, [30, 40, 30]);
    if (attemptNo < maxAttempts) {
      log({ correct: false, final: false });
      let text = res.feedback?.text;
      if (!text && rp.hints[hints]) {
        text = rp.hints[hints];
        setHints((h) => h + 1);
      }
      setFeedback(text ?? null);
      setPhase('wrong');
      return;
    }
    log({ correct: false, final: true, revealed: true });
    reveal(res.feedback?.text ?? null);
  };

  const retry = () => {
    setPhase('answering');
    setAttemptNo((a) => a + 1);
  };

  const openLux = (intent: LuxOpener | null) => {
    if (phase === 'answering' || phase === 'wrong') helped.current = true;
    setLuxAuto(intent ? { intent, key: `${phase}-${attemptNo}-${intent}` } : null);
    setLuxOpen(true);
  };

  const giveUp = () => {
    log({ correct: false, final: true, revealed: true });
    reveal(null);
  };

  const next = () => {
    const correct = phase === 'correct';
    let rating: 1 | 2 | 3 | 4 | undefined;
    if (item.itemId) {
      rating = deriveRating({ correct, revealed: phase === 'revealed', hintsUsed: assisted, attemptNo, durationMs: Date.now() - stepStart.current });
      app.addEvents([{ type: 'review', itemId: item.itemId, rating, seed: item.seed }]);
    }
    const mistake = firstWrong.current !== undefined && !placement ? { item, state: firstWrong.current } : undefined;
    onDone({ problem: true, firstTry: correct && firstTry.current && assisted === 0, correct, rating, mistake });
  };

  const showHint = () => {
    if (hints >= Math.min(2, rp.hints.length)) return;
    setShownHint(rp.hints[hints]);
    setHints(hints + 1);
  };

  const report = async () => {
    const r = await reportProblem({ stepId: item.step.id, seed: item.seed, state, describe: rp.widget.describe(state, rp.params, locale), contentVersion: lib?.manifest.version ?? '' });
    if (r === 'copied') {
      setToast(t('report.copied'));
      setTimeout(() => setToast(null), 3000);
    }
  };

  const promptId = `prompt-${item.key.replace(/[^a-z0-9]/gi, '')}`;
  const hintsLeft = !placement && phase === 'answering' && hints < Math.min(2, rp.hints.length);
  const footState = phase === 'answering' ? 'idle' : phase;
  const primary = phase === 'answering' ? check : phase === 'wrong' ? retry : next;
  const streakNow = phase === 'correct' && firstTry.current && assisted === 0 ? combo + 1 : 0;
  const title = phase === 'correct' ? (streakNow >= 3 ? t('player.comboTitle', { n: streakNow }) : praise) : phase === 'wrong' ? (revisit && attemptNo === 2 ? t('mistakes.earlier') : t('player.wrong')) : t('player.solution');
  const widgetTitle = getWidget(rp.widget.kind)?.title;

  return (
    <>
      <Stage reduce={reduce}>
        {!placement && <span className="step-chip"><Icon name={revisit ? 'reset' : 'target'} size={13} /> {revisit ? t('mistakes.chip') : mode.kind === 'review' ? t('player.reviewChip') : mode.kind === 'daily' ? t('daily.title') : t('player.task')}{widgetTitle && !['choice', 'numeric'].includes(rp.widget.kind) ? ` · ${locale.startsWith('de') ? widgetTitle.de : widgetTitle.en}` : ''}{(item.step.depth ?? 1) > 1 && mode.kind === 'lesson' ? ` · ${t(`depth.name${item.step.depth as 2 | 3}`)}` : ''}</span>}
        {rp.body && <Markdown text={rp.body} className="context" />}
        {rp.visual && <Visual key={`${rp.step.id ?? ''}-${rp.seed}`} widget={rp.visual.widget} params={rp.visual.params} locale={locale} alt={rp.visual.alt} interactive={rp.visual.interactive} />}
        <h1 ref={headingRef} tabIndex={-1} id={promptId} className="prompt">
          {inline(rp.prompt, 'p')}
        </h1>
        {placement && <p className="small muted">{t('player.placementNote')}</p>}
        <div className={`widget-area ${reduce ? '' : anim}`}>
          {View ? (
            <View
              params={rp.params}
              state={state}
              dispatch={dispatch}
              readOnly={!editable}
              locale={locale}
              result={phase === 'correct' || phase === 'revealed' ? 'ok' : phase === 'wrong' ? 'bad' : null}
              labelledBy={promptId}
              onSubmit={primary}
            />
          ) : (
            <p role="alert">Widget {rp.widget.kind} has no UI.</p>
          )}
        </div>
        <AnimatePresence>
          {shownHint && phase === 'answering' && (
            <motion.div className="hint-card" role="status" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
              <span className="ico"><Icon name="bulb" size={17} /></span>
              <div>
                <strong>{t('player.hintN', { n: hints })}</strong>
                <Markdown text={shownHint} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="sr-only" aria-live="polite">{liveText}</div>
      </Stage>
      <AnimatePresence>
        {xpFloat !== null && !reduce && (
          <motion.div key="xp" className="xp-float" style={{ left: 'calc(50% - 34px)', bottom: 150 }} initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: [0, 1, 1, 0], y: -50, scale: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} onAnimationComplete={() => setXpFloat(null)} aria-hidden="true">
            +{xpFloat} XP
          </motion.div>
        )}
      </AnimatePresence>
      <Footer state={footState} onEnter={luxOpen ? undefined : phase === 'answering' ? (answered ? check : undefined) : primary}>
        <div role="status" aria-live="assertive">
          <AnimatePresence mode="wait" initial={false}>
            {phase !== 'answering' && (
              <motion.div key={phase} className="foot-feedback" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE }}>
                <motion.span className="badge-ico" aria-hidden="true" initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.05 }}>
                  <Icon name={phase === 'correct' ? 'check' : phase === 'wrong' ? 'close' : 'info'} size={19} strokeWidth={2.8} />
                </motion.span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{title}</div>
                  <div className="text">
                    {phase === 'wrong' && feedback && <Markdown text={feedback} />}
                    {phase === 'revealed' && feedback && <p>{feedback}</p>}
                    {(phase === 'correct' || phase === 'revealed') && rp.explanation && <Markdown text={rp.explanation} />}
                    {phase === 'revealed' && <p className="small faint">{t('player.solutionShown')}</p>}
                  </div>
                  {phase === 'wrong' && (
                    <button type="button" className="lux-cta" onClick={() => openLux('ask-reasoning')}>
                      <Lux mood="oops" size={28} still={reduce} /> {t('lux.walk')}
                    </button>
                  )}
                  {(phase === 'correct' || phase === 'revealed') && (
                    <button type="button" className="lux-cta quiet" onClick={() => openLux(rp.widget.kind === 'teach' ? 'teach-feedback' : 'why-right')}>
                      <Lux mood={phase === 'correct' ? 'happy' : 'idle'} size={24} still={reduce} /> {t(rp.widget.kind === 'teach' ? 'lux.teachFeedback' : 'lux.why')}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {toast && <p className="small muted">{toast}</p>}
        </div>
        <div className="foot-actions">
          {phase === 'answering' && !placement && (
            <>
              <button className="icon-btn" onClick={() => { setState(initialState(rp)); setShownHint(null); }} aria-label={t('player.reset')} title={t('player.reset')}>
                <Icon name="reset" size={19} />
              </button>
              <LuxButton onClick={() => openLux(null)} label={t('lux.ask')} reduce={reduce} badge={attemptNo > 1 && !lux.used} />
              <button className="btn ghost" onClick={showHint} disabled={!hintsLeft} aria-label={hintsLeft ? t('player.hint') : t('player.noMoreHints')}>
                <Icon name="bulb" size={17} /> {t('player.hint')}
              </button>
            </>
          )}
          {phase === 'wrong' && (
            <button className="btn ghost" onClick={giveUp}>{t('player.showSolution')}</button>
          )}
          {(phase === 'correct' || phase === 'revealed') && (
            <button className="icon-btn" onClick={report} aria-label={t('player.report')} title={t('player.report')}>
              <Icon name="flag" size={18} />
            </button>
          )}
          <button
            className={`btn grow ${phase === 'correct' ? 'ok' : phase === 'wrong' ? 'bad' : phase === 'revealed' ? 'warn' : 'primary'}`}
            onClick={primary}
            disabled={phase === 'answering' && !answered}
            autoFocus={phase !== 'answering'}
          >
            {phase === 'answering' ? t('player.check') : phase === 'wrong' ? t('player.retry') : t('player.continue')}
          </button>
        </div>
      </Footer>
      {!placement && (
        <LuxChat
          open={luxOpen}
          onClose={() => setLuxOpen(false)}
          lux={lux}
          status={TUTOR_STATUS[phase]}
          autoIntent={luxAuto?.intent}
          autoKey={luxAuto?.key}
          action={phase === 'wrong' ? { label: t('lux.retry'), onClick: () => { setLuxOpen(false); retry(); } } : phase === 'answering' ? { label: t('lux.back'), onClick: () => setLuxOpen(false) } : null}
          reduce={reduce}
        />
      )}
    </>
  );
}

interface Snapshot {
  level: number;
  xp: number;
  unlocked: Set<string>;
  questsDone: Set<string>;
  minutes: number;
}

function snapshot(app: ReturnType<typeof useApp>): Snapshot {
  const catalog = app.lib?.catalog ?? null;
  return {
    level: levelInfo(app.progress.xpTotal).level,
    xp: app.progress.xpTotal,
    unlocked: new Set(deriveAchievements(app.events, catalog, app.progress).filter((a) => a.unlocked).map((a) => a.def.id)),
    questsDone: new Set(dailyQuests(app.events, app.today, { dailyGoal: app.settings.dailyGoal, catalog }).filter((q) => q.done).map((q) => q.kind)),
    minutes: app.progress.minutesToday,
  };
}

function Complete({ mode, outcomes, xpGained, placementResult, durationMs, topicId, before, onReviewMistakes, depth }: { mode: PlayerMode; outcomes: Outcome[]; xpGained: number; placementResult: { topic: string; unit?: string } | null; durationMs: number; topicId?: string; before: Snapshot; onReviewMistakes(): void; depth?: { reached: number; max: number } }) {
  const app = useApp();
  const { t, lib, progress, reviewItems, settings, today } = app;
  const reduce = prefersReducedMotion(settings);
  const de = settings.locale.startsWith('de');
  const problems = outcomes.filter((o) => o.problem);
  const acc = problems.length ? Math.round((100 * problems.filter((o) => o.firstTry).length) / problems.length) : 100;
  const perfect = problems.length > 0 && acc === 100;
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const topic = lib?.catalog.topics.find((tp) => tp.id === topicId);
  const after = useMemo(() => snapshot(app), [app.events]); // eslint-disable-line react-hooks/exhaustive-deps
  const lvl = levelInfo(progress.xpTotal);
  const levelUp = lvl.level > before.level;
  const newBadges = useMemo(() => deriveAchievements(app.events, lib?.catalog ?? null, progress).filter((a) => a.unlocked && !before.unlocked.has(a.def.id)), [app.events]); // eslint-disable-line react-hooks/exhaustive-deps
  const quests = dailyQuests(app.events, today, { dailyGoal: settings.dailyGoal, catalog: lib?.catalog });
  const newQuests = quests.filter((q) => q.done && !before.questsDone.has(q.kind));
  const goalNow = before.minutes < settings.dailyGoal && after.minutes >= settings.dailyGoal;
  const dailyOk = mode.kind === 'daily' && outcomes.some((o) => o.correct);
  const sessionMistakes = outcomes.filter((o) => o.mistake).length;
  const topicConcepts = topic ? topic.units.flatMap((u) => u.concepts) : [];
  const courseDone = topicConcepts.length > 0 && topicConcepts.every((c) => progress.completedConcepts.has(c));
  const courseOpen = topicId && courseDone ? openMistakes(app.events, { topicId }).length : 0;

  useEffect(() => {
    const timers: number[] = [];
    if (levelUp) timers.push(window.setTimeout(() => play(settings.sound, 'levelUp'), 700));
    else if (newBadges.length || newQuests.length) timers.push(window.setTimeout(() => play(settings.sound, 'achievement'), 900));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let nextConcept: string | null = null;
  let reviewIn: number | null = null;
  let conceptTitle = '';
  if (mode.kind === 'lesson' && lib) {
    const meta = lib.catalog.concepts[mode.conceptId];
    conceptTitle = meta?.title ?? '';
    const order = topic?.units.flatMap((u) => u.concepts) ?? [];
    nextConcept = order.find((id, i) => i > order.indexOf(mode.conceptId) && !progress.completedConcepts.has(id)) ?? null;
    const dues = meta?.srsCards.map((id) => reviewItems.get(id)?.card.due).filter(Boolean).map((d) => new Date(d!).getTime()) ?? [];
    if (dues.length) reviewIn = Math.max(1, Math.round((Math.min(...dues) - Date.now()) / 86400000));
  }
  const nextMeta = nextConcept ? lib?.catalog.concepts[nextConcept] : null;
  const title = mode.kind === 'lesson' ? (perfect ? t('complete.perfect') : t('complete.title')) : mode.kind === 'review' ? t('complete.review') : mode.kind === 'daily' ? (dailyOk ? t('daily.doneTitle') : t('daily.title')) : t('complete.placement');
  const recTopic = placementResult && lib?.catalog.topics.find((tp) => tp.id === placementResult.topic);
  const recUnit = recTopic && placementResult?.unit ? recTopic.units.find((u) => u.id === placementResult.unit) : null;
  const monday = weekKey(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const names = de ? ['M', 'D', 'M', 'D', 'F', 'S', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const frozen = new Set(progress.streak.frozenDays);
  const active = (d: string) => {
    const a = progress.days[d];
    return !!a && (a.conceptsCompleted > 0 || a.problemsSolved >= 3 || a.reviewSessions > 0);
  };
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay, ease: EASE } });
  const fromPct = levelUp ? 0 : Math.max(0, Math.min(100, ((before.xp - (lvl.nextAt - lvl.span)) / lvl.span) * 100));
  const toPct = Math.min(100, lvl.progress * 100);
  const chips = [
    perfect && mode.kind === 'lesson' ? { icon: 'sparkles', text: t('complete.chipPerfect') } : null,
    depth && depth.max > 1 ? { icon: depth.reached >= depth.max ? 'trophy' : 'layers', text: depth.reached >= depth.max ? t('depth.chipAll') : t('depth.chip', { n: depth.reached, total: depth.max }) } : null,
    goalNow ? { icon: 'target', text: t('complete.chipGoal') } : null,
    ...newQuests.map((q) => ({ icon: 'calendar', text: `${t('complete.chipQuest')}: ${de ? q.title.de : q.title.en}` })),
  ].filter(Boolean) as { icon: string; text: string }[];

  return (
    <main className="complete" id="main" style={topicVars(topic?.color)}>
      <Confetti reduce={reduce} color={topic?.color} />
      <div className="complete-inner">
        <div className="complete-lux"><Lux mood="cheer" size={116} still={reduce} /></div>
        <motion.div {...rise(0.15)}>
          {topic && <p className="eyebrow">{mode.kind === 'daily' ? t('daily.title') : topic.title}</p>}
          <h1 className="display" style={{ fontSize: '2rem', marginTop: 8 }}>{title}</h1>
          {conceptTitle && <p className="lead" style={{ margin: '6px 0 0' }}>{conceptTitle}</p>}
          {mode.kind === 'daily' && <p className="lead" style={{ margin: '6px 0 0' }}>{t('daily.tomorrow')}</p>}
        </motion.div>
        {recTopic ? (
          <motion.p className="card accent" style={{ margin: '20px 0 0', textAlign: 'left' }} {...rise(0.3)}>{t('complete.recommend', { topic: `${recTopic.title}${recUnit ? ` – ${recUnit.title}` : ''}` })}</motion.p>
        ) : (
          <motion.div className="result-grid" role="list" {...rise(0.3)}>
            <div className="result xp" role="listitem"><span className="v"><CountUp to={xpGained} reduce={reduce} prefix="+" /></span><span className="l">XP</span></div>
            <div className="result" role="listitem"><span className="v"><CountUp to={acc} reduce={reduce} />%</span><span className="l">{t('complete.accuracyShort')}</span></div>
            <div className="result" role="listitem"><span className="v">{minutes}′</span><span className="l">{t('complete.time')}</span></div>
          </motion.div>
        )}
        {mode.kind !== 'placement' && (sessionMistakes > 0 || courseOpen > 0) && (
          <motion.section className="lux-review" {...rise(0.36)}>
            <Lux mood={sessionMistakes > 0 ? 'idle' : 'happy'} size={52} still={reduce} />
            <div className="lr-body">
              <strong>{sessionMistakes > 0 ? t('mistakes.title') : t('mistakes.courseTitle')}</strong>
              <p>{sessionMistakes > 0 ? t('mistakes.body', { n: sessionMistakes }) : t('mistakes.courseBody', { n: courseOpen })}</p>
              <div className="lr-actions">
                {sessionMistakes > 0 && <button className="btn primary" onClick={onReviewMistakes}><Icon name="chat" size={17} /> {t('mistakes.start')}</button>}
                {courseOpen > 0 && courseDone && <button className={`btn ${sessionMistakes > 0 ? 'quiet' : 'primary'}`} onClick={() => navigate(`mistakes/${topicId}`)}>{t('mistakes.course', { n: courseOpen })}</button>}
              </div>
            </div>
          </motion.section>
        )}
        {mode.kind !== 'placement' && (
          <motion.div className={`level-card ${levelUp ? 'up' : ''}`} {...rise(0.38)}>
            <div className="lv-row">
              <span className="lv-badge"><span>{lvl.level}</span></span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <strong>{levelUp ? t('level.up', { n: lvl.level }) : t('level.label', { n: lvl.level })}</strong>
                <span className="small faint" style={{ display: 'block' }}>{t('level.toNext', { xp: lvl.span - lvl.inLevel, n: lvl.level + 1 })}</span>
              </span>
            </div>
            <div className="lv-bar" aria-hidden="true">
              <motion.div initial={reduce ? false : { width: `${fromPct}%` }} animate={{ width: `${toPct}%` }} transition={{ duration: 1.1, delay: 0.6, ease: EASE }} />
            </div>
          </motion.div>
        )}
        {chips.length > 0 && (
          <motion.div className="chip-list" {...rise(0.46)}>
            {chips.map((c) => <span key={c.text} className="win-chip"><Icon name={c.icon} size={14} /> {c.text}</span>)}
          </motion.div>
        )}
        {newBadges.map((b, i) => (
          <motion.div key={b.def.id} className="badge-unlock" initial={reduce ? false : { opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.9 + i * 0.15 }}>
            <span className="medal" style={{ ['--tier' as string]: TIER_COLORS[b.def.tier] }}><Icon name={b.def.icon} size={22} strokeWidth={2.2} /></span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span className="eyebrow">{t('badges.new')}</span>
              <strong style={{ display: 'block' }}>{de ? b.def.title.de : b.def.title.en}</strong>
              <span className="small faint">{de ? b.def.desc.de : b.def.desc.en}</span>
            </span>
          </motion.div>
        ))}
        {progress.streak.current > 0 && (
          <motion.div className="streak-card" {...rise(0.52)}>
            <strong><Icon name="flame" size={18} /> {t('complete.streak', { n: progress.streak.current })}</strong>
            <div className="week-strip" aria-hidden="true">
              {week.map((d, i) => (
                <div className="d" key={d}>
                  <span className={`c ${active(d) ? 'on' : frozen.has(d) ? 'frozen' : ''} ${d === today ? 'today' : ''}`}>{active(d) ? <Icon name="check" size={12} strokeWidth={3} /> : null}</span>
                  {names[i]}
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {nextMeta && topic && (
          <motion.div className="next-card" {...rise(0.58)}>
            <span className="thumb"><Cover motif={topic.icon} color={topic.color} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="eyebrow">{t('complete.upNext')}</span>
              <strong style={{ display: 'block', marginTop: 2 }}>{nextMeta.title}</strong>
            </span>
            <span className="small faint">{t('home.minutes', { n: nextMeta.estimated_minutes })}</span>
          </motion.div>
        )}
        {reviewIn !== null && <motion.p className="small faint" style={{ marginTop: 14 }} {...rise(0.6)}>{t('complete.reviewSoon', { n: reviewIn })}</motion.p>}
        <motion.div className="complete-actions" {...rise(0.64)}>
          {nextConcept && (
            <button className="btn primary lg block" autoFocus onClick={() => navigate(`learn/${nextConcept}`)}>
              {t('complete.next')} <Icon name="arrow" size={18} className="arrow" />
            </button>
          )}
          <button className={`btn lg block ${nextConcept ? 'quiet' : 'primary'}`} autoFocus={!nextConcept} onClick={() => navigate('', true)}>
            {t('complete.home')}
          </button>
        </motion.div>
      </div>
    </main>
  );
}

/** After Lux walked through the mistakes. */
function MistakesDone({ outcomes, topicId, afterLesson, nextConcept }: { outcomes: Outcome[]; topicId?: string; afterLesson: number; nextConcept?: string }) {
  const { t, lib, settings } = useApp();
  const reduce = prefersReducedMotion(settings);
  const total = outcomes.filter((o) => o.problem).length;
  const solved = outcomes.filter((o) => o.problem && o.correct).length;
  const all = total > 0 && solved === total;
  let next: string | null = null;
  if (nextConcept && lib) {
    const topic = lib.catalog.topics.find((tp) => tp.id === topicId);
    const list = topic ? topic.units.flatMap((u) => u.concepts) : [];
    const i = list.indexOf(nextConcept);
    next = i >= 0 && i + 1 < list.length ? list[i + 1] : null;
  }
  return (
    <main className="complete" id="main">
      {all && <Confetti reduce={reduce} />}
      <div className="complete-inner">
        <div className="complete-lux"><Lux mood={all ? 'cheer' : 'happy'} size={112} still={reduce} /></div>
        <h1 className="display" style={{ fontSize: '2rem', marginTop: 8 }}>{all ? t('mistakes.doneTitle') : t('mistakes.partTitle')}</h1>
        <p className="lead" style={{ margin: '6px 0 0' }}>{t('mistakes.doneBody', { solved, total })}</p>
        {!all && <p className="small muted" style={{ marginTop: 10 }}>{t('mistakes.keep')}</p>}
        <div className="complete-actions" style={{ marginTop: 28 }}>
          {afterLesson > 0 && next && (
            <button className="btn primary lg block" autoFocus onClick={() => navigate(`learn/${next}`)}>
              {t('complete.next')} <Icon name="arrow" size={18} className="arrow" />
            </button>
          )}
          {topicId && <button className={`btn lg block ${afterLesson > 0 && next ? 'quiet' : 'primary'}`} onClick={() => navigate(`topic/${topicId}`, true)}>{t('mistakes.toCourse')}</button>}
          <button className="btn lg block quiet" onClick={() => navigate('', true)}>{t('complete.home')}</button>
        </div>
      </div>
    </main>
  );
}
