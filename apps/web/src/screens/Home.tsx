import { useEffect } from 'react';
import { addDays, buildReviewSession, dueItems, sessionSize, weekKey, type Catalog, type ProgressSummary, type Topic } from '@lumen/engine';
import { Cover, topicVars } from '../components/art.tsx';
import { Icon, Ring } from '../components/ui.tsx';
import { href, navigate } from '../lib/router.ts';
import type { Settings } from '../lib/settings.ts';
import { useApp } from '../lib/store.tsx';
import { useGamification } from '../lib/gamify.ts';
import { useState } from 'react';
import { Lux } from '../components/Lux.tsx';
import { prefersReducedMotion } from '../lib/settings.ts';

export type NodeState = 'done' | 'next' | 'later' | 'locked';

export interface PathUnit {
  topicId: string;
  topicTitle: string;
  unitId: string;
  unitIndex: number;
  title: string;
  nodes: { conceptId: string; title: string; summary?: string; minutes: number; state: NodeState }[];
  review: { state: 'done' | 'open' | 'later'; cards: string[] } | null;
}

export function buildPath(catalog: Catalog, pathId: string, progress: ProgressSummary, startAt: Settings['startAt'], reviewedUnits: Set<string>): { units: PathUnit[]; next: string | null } {
  const path = catalog.paths.find((p) => p.id === pathId) ?? catalog.paths[0];
  const units: PathUnit[] = [];
  let next: string | null = null;
  let reachedStart = !startAt || !path.topics.includes(startAt.topic);
  for (const tid of path.topics) {
    const topic = catalog.topics.find((tp) => tp.id === tid);
    if (!topic) continue;
    const prereqsDone = topic.prerequisites.every((p) => {
      const tp = catalog.topics.find((x) => x.id === p);
      return !tp || tp.units.flatMap((u) => u.concepts).every((c) => progress.completedConcepts.has(c));
    });
    topic.units.forEach((u, ui) => {
      if (!reachedStart && startAt && startAt.topic === tid && (!startAt.unit || startAt.unit === u.id)) reachedStart = true;
      const nodes = u.concepts.map((cid) => {
        const meta = catalog.concepts[cid];
        let state: NodeState;
        if (progress.completedConcepts.has(cid)) state = 'done';
        else if (!next && reachedStart) {
          next = cid;
          state = 'next';
        } else state = prereqsDone || next === null ? 'later' : 'locked';
        return { conceptId: cid, title: meta?.title ?? cid, summary: meta?.summary, minutes: meta?.estimated_minutes ?? 5, state };
      });
      const cards = u.concepts.flatMap((c) => catalog.concepts[c]?.srsCards ?? []);
      const allDone = u.concepts.every((c) => progress.completedConcepts.has(c));
      units.push({
        topicId: tid,
        topicTitle: topic.title,
        unitId: u.id,
        unitIndex: ui + 1,
        title: u.title,
        nodes,
        review: u.review && cards.length ? { state: reviewedUnits.has(u.id) ? 'done' : allDone ? 'open' : 'later', cards } : null,
      });
    });
  }
  if (!next) {
    for (const u of units) for (const n of u.nodes) if (!next && n.state !== 'done') { next = n.conceptId; n.state = 'next'; }
  }
  return { units, next };
}

const conceptsOf = (tp: Topic) => tp.units.flatMap((u) => u.concepts);

function greeting(locale: string): string {
  const h = new Date().getHours();
  const de = locale.startsWith('de');
  if (h < 5) return de ? 'Noch wach?' : 'Still up?';
  if (h < 11) return de ? 'Guten Morgen' : 'Good morning';
  if (h < 17) return de ? 'Guten Tag' : 'Good afternoon';
  return de ? 'Guten Abend' : 'Good evening';
}

export function StatPills() {
  const { t, progress } = useApp();
  const { level } = useGamification();
  return (
    <div className="stat-pills">
      <a className="pill level" href={href('profile')} aria-label={t('level.aria', { n: level.level, xp: level.span - level.inLevel })}>
        <Ring value={level.progress} size={20} stroke={3}>{''}</Ring> {t('level.short', { n: level.level })}
      </a>
      <a className={`pill streak ${progress.streak.todayDone ? 'on' : ''}`} href={href('profile')} title={progress.streak.todayDone ? t('home.streakSafe') : t('home.streakOpen')} aria-label={t('home.streakN', { n: progress.streak.current })}>
        <Icon name="flame" size={17} /> {progress.streak.current}
      </a>
      <a className="pill xp" href={href('profile')} aria-label={`${progress.xpThisWeek} ${t('home.xp')}`}>
        <Icon name="bolt" size={17} /> {progress.xpThisWeek}
      </a>
    </div>
  );
}

/** Units of one course as a vertical lesson timeline. */
export function UnitList({ topic, units }: { topic: Topic; units: PathUnit[] }) {
  const { t } = useApp();
  return (
    <div style={topicVars(topic.color)}>
      {units.map((u) => {
        const done = u.nodes.filter((n) => n.state === 'done').length;
        return (
          <section key={u.unitId} className="unit-block" aria-labelledby={`u-${u.unitId}`}>
            <div className="unit-head">
              <span className="unit-no">{String(u.unitIndex).padStart(2, '0')}</span>
              <div>
                <h3 id={`u-${u.unitId}`}>{u.title}</h3>
                <p>{t('home.unitProgress', { done, n: u.nodes.length })}</p>
              </div>
            </div>
            <ol className="lesson-list">
              {u.nodes.map((n, i) => (
                <li key={n.conceptId}>
                  <a className="lesson-row" data-state={n.state} href={href(`learn/${n.conceptId}`)} aria-label={`${n.title} – ${t(`node.${n.state}` as 'node.done')}`}>
                    <span className="node">{n.state === 'done' ? <Icon name="check" size={17} strokeWidth={2.6} /> : n.state === 'next' ? <Icon name="play" size={15} strokeWidth={2.4} /> : n.state === 'locked' ? <Icon name="lock" size={15} /> : i + 1}</span>
                    <span className="lr-body">
                      <span className="t">{n.title}</span>
                      <span className="s">{n.summary ? `${n.summary} · ` : ''}{t('home.minutes', { n: n.minutes })}</span>
                    </span>
                    <span className="lr-cta">{n.state === 'next' ? t('home.start') : n.state === 'done' ? <Icon name="reset" size={15} /> : <Icon name="chevron" size={16} />}</span>
                  </a>
                </li>
              ))}
              {u.review && (
                <li>
                  <a className="lesson-row review-row" data-state={u.review.state === 'done' ? 'done' : 'later'} href={href(`practice/unit/${u.unitId}`)}>
                    <span className="node"><Icon name={u.review.state === 'done' ? 'check' : 'review'} size={16} /></span>
                    <span className="lr-body">
                      <span className="t">{t('node.review')}</span>
                      <span className="s">{u.review.state === 'done' ? t('node.reviewDone') : u.review.state === 'open' ? t('node.reviewOpen') : t('home.reviewLater')}</span>
                    </span>
                    <span className="lr-cta"><Icon name="chevron" size={16} /></span>
                  </a>
                </li>
              )}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function CourseRow({ topic, done }: { topic: Topic; done: number }) {
  const { t } = useApp();
  const all = conceptsOf(topic);
  return (
    <a className="course-row" href={href(`topic/${topic.id}`)} style={topicVars(topic.color)}>
      <span className="thumb"><Cover motif={topic.icon} color={topic.color} /></span>
      <span className="cr-body">
        <strong>{topic.title}</strong>
        <span>{t('discover.concepts', { n: all.length })} · {done ? t('home.doneN', { n: done }) : topic.level}</span>
        <div className="progress-bar" aria-hidden="true"><div style={{ width: `${(100 * done) / Math.max(1, all.length)}%` }} /></div>
      </span>
      <Icon name="chevron" size={18} className="faint" />
    </a>
  );
}

export function Home() {
  const app = useApp();
  const { t, lib, progress, settings, reviewItems, events, today } = app;
  const [picker, setPicker] = useState(false);
  if (!lib) return null;
  const catalog = lib.catalog;
  const pathId = settings.pathId ?? catalog.paths[0]?.id;
  const path = catalog.paths.find((p) => p.id === pathId) ?? catalog.paths[0];
  const reviewedUnits = new Set(events.flatMap((e) => (e.type === 'review_session_completed' && e.unitId ? [e.unitId] : [])));
  const { units, next } = buildPath(catalog, pathId, progress, settings.startAt, reviewedUnits);
  const due = dueItems(reviewItems, new Date()).length;
  const nextMeta = next ? catalog.concepts[next] : null;
  const currentTopic = catalog.topics.find((tp) => tp.id === (nextMeta?.topicId ?? path?.topics[0]));
  const topicConcepts = currentTopic ? conceptsOf(currentTopic) : [];
  const topicDone = topicConcepts.filter((c) => progress.completedConcepts.has(c)).length;
  const lessonNo = next ? topicConcepts.indexOf(next) + 1 : topicConcepts.length;
  const unitOfNext = currentTopic?.units.findIndex((u) => next && u.concepts.includes(next)) ?? -1;
  const doneIn = (tp: Topic) => conceptsOf(tp).filter((c) => progress.completedConcepts.has(c)).length;
  const pathTopics = (path?.topics ?? []).map((id) => catalog.topics.find((tp) => tp.id === id)).filter(Boolean) as Topic[];
  const interests = new Set(settings.interests);
  const explore = catalog.topics.filter((tp) => !path?.topics.includes(tp.id)).sort((a, b) => Number(interests.has(b.area)) - Number(interests.has(a.area))).slice(0, 8);
  const minutes = Math.floor(progress.minutesToday);
  const monday = weekKey(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const frozen = new Set(progress.streak.frozenDays);
  const active = (d: string) => {
    const a = progress.days[d];
    return !!a && (a.conceptsCompleted > 0 || a.problemsSolved >= 3 || a.reviewSessions > 0);
  };
  const dateLabel = new Date().toLocaleDateString(settings.locale, { weekday: 'short', day: 'numeric', month: 'short' });

  const startReview = () => {
    const session = buildReviewSession(reviewItems, new Date(), sessionSize(settings.dailyGoal));
    navigate(`practice/review/${session.map((s) => encodeURIComponent(s.itemId)).join(',')}`);
  };

  return (
    <main id="main" className="fade-in">
      <header className="home-head">
        <div className="hh-top">
          <p className="eyebrow">{dateLabel}</p>
          <StatPills />
        </div>
        <div className="hh-greet">
          <h1 className="display">{greeting(settings.locale)}</h1>
          <Lux mood="idle" size={56} still={prefersReducedMotion(settings)} label={t('lux.role')} />
        </div>
      </header>

      {nextMeta && currentTopic ? (
        <section className="continue-card" style={topicVars(currentTopic.color)} aria-labelledby="cc-title">
          <a className="cc-art cover-frame" href={href(`topic/${currentTopic.id}`)} aria-label={currentTopic.title}><Cover motif={currentTopic.icon} color={currentTopic.color} /></a>
          <div className="cc-body">
            <p className="eyebrow">{currentTopic.title}{unitOfNext >= 0 ? ` · ${t('home.unitN', { n: unitOfNext + 1 })}` : ''}</p>
            <h2 id="cc-title">{nextMeta.title}</h2>
            {nextMeta.summary && <p className="cc-sum">{nextMeta.summary}</p>}
            <div className="cc-meta"><span>{t('home.lessonOf', { n: lessonNo, total: topicConcepts.length })}</span><span>{t('home.minutes', { n: nextMeta.estimated_minutes })}</span></div>
            <div className="progress-bar" aria-hidden="true"><div style={{ width: `${(100 * topicDone) / Math.max(1, topicConcepts.length)}%` }} /></div>
            <button className="btn primary lg" onClick={() => navigate(`learn/${nextMeta.id}`)}>
              {progress.completedConcepts.size ? t('home.continue') : t('home.start')} <Icon name="arrow" size={18} className="arrow" />
            </button>
          </div>
        </section>
      ) : (
        <div className="card accent"><p style={{ margin: 0 }}>{t('home.allDone')}</p></div>
      )}

      <DailyAndQuests />

      <div className="home-grid">
        <section className="mini-card" aria-label={t('home.goal')}>
          <Ring value={minutes / settings.dailyGoal} size={46} stroke={5}>{minutes}</Ring>
          <div>
            <div className="mc-t">{minutes >= settings.dailyGoal ? t('home.goalDone') : t('home.goal')}</div>
            <div className="mc-s">{minutes} / {settings.dailyGoal} {t('home.minShort')}</div>
          </div>
        </section>
        <section className="mini-card" aria-label={t('home.streak')}>
          <div style={{ minWidth: 0 }}>
            <div className="mc-t">{t('home.streakN', { n: progress.streak.current })}</div>
            <div className="week-dots" aria-hidden="true">
              {week.map((d) => <span key={d} className={`${active(d) ? 'on' : frozen.has(d) ? 'frozen' : ''} ${d === today ? 'today' : ''}`} />)}
            </div>
          </div>
        </section>
      </div>

      {due > 0 && (
        <button className="review-strip" onClick={startReview}>
          <span className="ri"><Icon name="review" size={20} /></span>
          <span style={{ flex: 1 }}>
            <strong>{t('home.reviewDue', { n: due })}</strong>
            <span className="small muted">{t('home.reviewFirst')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      {currentTopic && (
        <section aria-labelledby="path-h">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('home.currentCourse')}</p>
              <h2 id="path-h" style={{ marginTop: 4 }}><a href={href(`topic/${currentTopic.id}`)}>{currentTopic.title}</a></h2>
            </div>
            <button className="btn ghost small" onClick={() => setPicker(true)} aria-haspopup="dialog">
              <Icon name="layers" size={15} /> {path?.title}
            </button>
          </div>
          <UnitList topic={currentTopic} units={units.filter((u) => u.topicId === currentTopic.id)} />
        </section>
      )}

      {pathTopics.length > 1 && (
        <section aria-labelledby="inpath-h">
          <div className="section-head"><h2 id="inpath-h">{t('home.inPath', { path: path.title })}</h2><span className="count">{pathTopics.length}</span></div>
          <div className="course-rows">{pathTopics.map((tp) => <CourseRow key={tp.id} topic={tp} done={doneIn(tp)} />)}</div>
        </section>
      )}

      {explore.length > 0 && (
        <section aria-labelledby="explore-h">
          <div className="section-head"><h2 id="explore-h">{t('home.explore')}</h2><a className="btn quiet small" href={href('discover')}>{t('home.allCourses')} <Icon name="chevron" size={15} /></a></div>
          <div className="shelf-row">{explore.map((tp) => <CourseCard key={tp.id} topic={tp} done={doneIn(tp)} />)}</div>
        </section>
      )}

      {picker && <PathPicker onClose={() => setPicker(false)} />}
    </main>
  );
}

export function CourseCard({ topic, done }: { topic: Topic; done: number }) {
  const { t, lib } = useApp();
  const all = conceptsOf(topic);
  const minutes = all.reduce((s, c) => s + (lib?.catalog.concepts[c]?.estimated_minutes ?? 0), 0);
  return (
    <a className="course-card" href={href(`topic/${topic.id}`)} style={topicVars(topic.color)}>
      <div className="cover cover-frame"><Cover motif={topic.icon} color={topic.color} /></div>
      <div className="body">
        <strong>{topic.title}</strong>
        <span className="meta">{t('discover.concepts', { n: all.length })} · {minutes} {t('home.minShort')}</span>
        {done > 0 && <div className="progress-wrap"><div className="progress-bar" aria-label={`${done}/${all.length}`}><div style={{ width: `${(100 * done) / Math.max(1, all.length)}%` }} /></div></div>}
      </div>
    </a>
  );
}

export function PathPicker({ onClose }: { onClose(): void }) {
  const { t, lib, settings, updateSettings, progress } = useApp();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  if (!lib) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t('home.pickPath')}>
        <div className="grab" />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('home.pickPath')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('player.close')}><Icon name="close" /></button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {lib.catalog.paths.map((p) => {
            const concepts = p.topics.flatMap((tid) => lib.catalog.topics.find((tp) => tp.id === tid)?.units.flatMap((u) => u.concepts) ?? []);
            const done = concepts.filter((c) => progress.completedConcepts.has(c)).length;
            return (
              <button key={p.id} className="path-option" aria-current={settings.pathId === p.id} onClick={() => { updateSettings({ pathId: p.id, startAt: null }); onClose(); }}>
                <span className="thumb"><Cover motif={p.icon} color={p.color} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{p.title}</strong>
                  <span>{t('discover.pathMeta', { n: p.topics.length, done, total: concepts.length })}</span>
                </span>
                {settings.pathId === p.id && <Icon name="check" size={18} />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const QUEST_ICONS: Record<string, string> = { solve: 'target', combo: 'flame', lesson: 'book', minutes: 'clock', xp: 'bolt', daily: 'puzzle', perfect: 'sparkles', review: 'review' };

export function DailyAndQuests() {
  const { t, lib, settings } = useApp();
  const { quests, daily, dailyState } = useGamification();
  if (!lib) return null;
  const topic = daily ? lib.catalog.topics.find((tp) => tp.id === daily.topicId) : null;
  const de = settings.locale.startsWith('de');
  const doneCount = quests.filter((q) => q.done).length;
  return (
    <div className="today-grid">
      {daily && topic && (
        <a className="daily-card" href={href('daily')} style={topicVars(topic.color)} data-state={dailyState}>
          <span className="daily-art cover-frame"><Cover motif={topic.icon} color={topic.color} /></span>
          <span className="daily-body">
            <span className="eyebrow">{t('daily.title')}</span>
            <strong>{dailyState === 'open' ? t('daily.cta') : dailyState === 'solved' ? t('daily.solved') : t('daily.revealed')}</strong>
            <span className="small faint">{t('daily.from', { topic: topic.title })}</span>
          </span>
          <span className="daily-state">{dailyState === 'solved' ? <Icon name="check" size={18} strokeWidth={2.6} /> : <Icon name="puzzle" size={18} />}</span>
        </a>
      )}
      <section className="quests" aria-labelledby="quests-h">
        <div className="q-head">
          <h3 id="quests-h">{t('quests.title')}</h3>
          <span className={`q-count ${doneCount === quests.length ? 'all' : ''}`}>{doneCount === quests.length ? <><Icon name="gift" size={14} /> {t('quests.all')}</> : `${doneCount}/${quests.length}`}</span>
        </div>
        <ul>
          {quests.map((q) => (
            <li key={q.kind} className="quest" data-done={q.done}>
              <span className="q-ico"><Icon name={q.done ? 'check' : QUEST_ICONS[q.kind] ?? 'target'} size={15} strokeWidth={q.done ? 2.8 : 2} /></span>
              <span className="q-body">
                <span className="q-t">{de ? q.title.de : q.title.en}</span>
                <span className="progress-bar" aria-hidden="true"><div style={{ width: `${(100 * q.value) / q.target}%` }} /></span>
              </span>
              <span className="q-val tnum">{q.value}/{q.target}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
