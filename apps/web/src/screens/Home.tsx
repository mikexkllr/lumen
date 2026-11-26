import { useEffect } from 'react';
import { buildReviewSession, dueItems, isLastCorePart, lessonExtras, sessionSize, type Catalog, type LumenEvent, type ProgressSummary, type Topic } from '@lumen/engine';
import { Cover, topicVars } from '../components/art.tsx';
import { Icon, Ring } from '../components/ui.tsx';
import { href, navigate } from '../lib/router.ts';
import type { Settings } from '../lib/settings.ts';
import { useApp } from '../lib/store.tsx';
import { useGamification } from '../lib/gamify.ts';
import { useState } from 'react';
import { type LuxMood } from '../components/Lux.tsx';
import { LuxSay } from '../components/LuxMoments.tsx';
import { StreakHero, STREAK_GOALS } from '../components/Streaks.tsx';
import { depthOfLesson, lessonBlurb, lessonTag, type DepthGoal } from '../lib/lessons.ts';
import { prefersReducedMotion } from '../lib/settings.ts';
import { play } from '../lib/sound.ts';
import { useSocial } from '../lib/socialContext.tsx';
import { social, useQuery, type FriendsResponse, type LeagueResponse } from '../lib/social.ts';
import { Avatar, TierBadge, tierName } from '../components/social.tsx';

export type NodeState = 'done' | 'next' | 'later' | 'locked';

/** An optional lesson that goes deeper than the core (hangs below the last core part of its concept). */
export interface PathExtra {
  conceptId: string;
  depth: 2 | 3;
  minutes: number;
  problems: number;
  state: 'done' | 'next' | 'open';
}

export interface PathNode {
  conceptId: string;
  title: string;
  /** "Teil 2 von 3" for a concept cut into several lessons. */
  part: { n: number; total: number } | null;
  summary?: string;
  minutes: number;
  problems: number;
  state: NodeState;
  extras: PathExtra[];
}

export interface PathUnit {
  topicId: string;
  topicTitle: string;
  unitId: string;
  unitIndex: number;
  title: string;
  nodes: PathNode[];
  review: { state: 'done' | 'open' | 'later'; cards: string[] } | null;
}

/**
 * The learning path as units of lessons with their states. `goal` is how deep
 * the learner wants to go: extras up to that depth are part of the way (they
 * can become the next lesson), deeper ones stay optional.
 *
 * The next lesson is the first open one, but a course the learner never
 * touched does not pull them back when they are already further along – a
 * new course added at the front of a path must not send someone who is
 * solving equations back to counting. Such courses stay open to visit.
 */
export function buildPath(catalog: Catalog, pathId: string, progress: ProgressSummary, startAt: Settings['startAt'], reviewedUnits: Set<string>, goal: DepthGoal = 1): { units: PathUnit[]; next: string | null } {
  const path = catalog.paths.find((p) => p.id === pathId) ?? catalog.paths[0];
  const units: PathUnit[] = [];
  let next: string | null = null;
  let reachedStart = !startAt || !path.topics.includes(startAt.topic);
  const started = path.topics.map((tid) => !!catalog.topics.find((tp) => tp.id === tid)?.units.some((u) => u.concepts.some((c) => progress.completedConcepts.has(c))));
  const furthest = started.lastIndexOf(true);
  for (const [ti, tid] of path.topics.entries()) {
    const topic = catalog.topics.find((tp) => tp.id === tid);
    if (!topic) continue;
    // an untouched course behind the learner's position is not where they go next
    const onTheWay = started[ti] || ti > furthest;
    const prereqsDone = topic.prerequisites.every((p) => {
      const tp = catalog.topics.find((x) => x.id === p);
      return !tp || tp.units.flatMap((u) => u.concepts).every((c) => progress.completedConcepts.has(c));
    });
    topic.units.forEach((u, ui) => {
      if (!reachedStart && startAt && startAt.topic === tid && (!startAt.unit || startAt.unit === u.id)) reachedStart = true;
      const nodes = u.concepts.map((cid): PathNode => {
        const meta = catalog.concepts[cid];
        let state: NodeState;
        if (progress.completedConcepts.has(cid)) state = 'done';
        else if (!next && reachedStart && onTheWay) {
          next = cid;
          state = 'next';
        } else state = prereqsDone || next === null ? 'later' : 'locked';
        const extras = (isLastCorePart(catalog, cid) ? lessonExtras(catalog, cid) : []).map((id): PathExtra => {
          const em = catalog.concepts[id];
          const depth = depthOfLesson(em) as 2 | 3;
          let es: PathExtra['state'] = 'open';
          if (progress.completedConcepts.has(id)) es = 'done';
          else if (!next && reachedStart && onTheWay && depth <= goal) {
            next = id;
            es = 'next';
          }
          return { conceptId: id, depth, minutes: em?.estimated_minutes ?? 2, problems: em?.problems ?? 0, state: es };
        });
        return { conceptId: cid, title: meta?.title ?? cid, part: meta && (meta.parts ?? 1) > 1 ? { n: meta.part, total: meta.parts } : null, summary: lessonBlurb(meta), minutes: meta?.estimated_minutes ?? 5, problems: meta?.problems ?? 0, state, extras };
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

/** No path chosen on this device (e.g. after signing in): the path of the latest lesson, else math. */
export function defaultPathId(catalog: Catalog, events: readonly LumenEvent[]): string {
  let last: string | null = null;
  for (const e of events) if (e.type === 'concept_completed') last = e.topicId;
  const byTopic = last ? catalog.paths.find((p) => p.topics.includes(last)) : undefined;
  return (byTopic ?? catalog.paths.find((p) => p.area === 'math') ?? catalog.paths[0]).id;
}

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
                  <a className="lesson-row" data-state={n.state} href={href(`learn/${n.conceptId}`)} aria-label={`${n.title}${n.part ? ` – ${t('lesson.part', { n: n.part.n, total: n.part.total })}` : ''} – ${t(`node.${n.state}` as 'node.done')}`}>
                    <span className="node">{n.state === 'done' ? <Icon name="check" size={17} strokeWidth={2.6} /> : n.state === 'next' ? <Icon name="play" size={15} strokeWidth={2.4} /> : n.state === 'locked' ? <Icon name="lock" size={15} /> : i + 1}</span>
                    <span className="lr-body">
                      <span className="t">{n.title}{n.part && <span className="part-tag">{n.part.n}/{n.part.total}</span>}</span>
                      <span className="s">{n.summary ?? t('intro.problems', { n: n.problems })} · {t('home.minutes', { n: n.minutes })}</span>
                    </span>
                    <span className="lr-cta">{n.state === 'next' ? t('home.start') : n.state === 'done' ? <Icon name="reset" size={15} /> : <Icon name="chevron" size={16} />}</span>
                  </a>
                  {n.extras.length > 0 && (
                    <div className="extra-row" role="group" aria-label={t('lesson.extras')}>
                      {n.extras.map((x) => (
                        <a key={x.conceptId} className={`extra-chip d${x.depth}`} data-state={x.state} href={href(`learn/${x.conceptId}`)} aria-label={`${n.title} – ${t(`depth.name${x.depth}`)}${x.state === 'done' ? ` – ${t('node.done')}` : ''}`}>
                          <Icon name={x.state === 'done' ? 'check' : x.depth === 3 ? 'trophy' : 'layers'} size={13} strokeWidth={x.state === 'done' ? 3 : 2} />
                          {t(`depth.name${x.depth}`)}
                          <span className="x-meta">{t('home.minutes', { n: x.minutes })}</span>
                        </a>
                      ))}
                    </div>
                  )}
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
  const { t, lib, progress, settings, reviewItems, events } = app;
  const [picker, setPicker] = useState(false);
  if (!lib) return null;
  const catalog = lib.catalog;
  const pathId = settings.pathId ?? defaultPathId(catalog, events);
  const path = catalog.paths.find((p) => p.id === pathId) ?? catalog.paths[0];
  const reviewedUnits = new Set(events.flatMap((e) => (e.type === 'review_session_completed' && e.unitId ? [e.unitId] : [])));
  const { units, next } = buildPath(catalog, pathId, progress, settings.startAt, reviewedUnits, settings.depth);
  const due = dueItems(reviewItems, new Date()).length;
  const nextMeta = next ? catalog.concepts[next] : null;
  const currentTopic = catalog.topics.find((tp) => tp.id === (nextMeta?.topicId ?? path?.topics[0]));
  const topicConcepts = currentTopic ? conceptsOf(currentTopic) : [];
  const topicDone = topicConcepts.filter((c) => progress.completedConcepts.has(c)).length;
  // an extra (deeper, expert) counts as part of the core lesson it hangs below
  const nextCore = nextMeta && depthOfLesson(nextMeta) > 1 ? ([...(catalog.groups?.[nextMeta.group] ?? [])].reverse().find((id) => depthOfLesson(catalog.concepts[id]) === 1) ?? next) : next;
  const lessonNo = nextCore ? topicConcepts.indexOf(nextCore) + 1 : topicConcepts.length;
  const nextTag = lessonTag(nextMeta, t);
  const unitOfNext = currentTopic?.units.findIndex((u) => nextCore && u.concepts.includes(nextCore)) ?? -1;
  const doneIn = (tp: Topic) => conceptsOf(tp).filter((c) => progress.completedConcepts.has(c)).length;
  const pathTopics = (path?.topics ?? []).map((id) => catalog.topics.find((tp) => tp.id === id)).filter(Boolean) as Topic[];
  const interests = new Set(settings.interests);
  const explore = catalog.topics.filter((tp) => !path?.topics.includes(tp.id)).sort((a, b) => Number(interests.has(b.area)) - Number(interests.has(a.area))).slice(0, 8);
  const minutes = Math.floor(progress.minutesToday);
  const streak = progress.streak;
  const streakGoal = STREAK_GOALS.find((g) => g > streak.current) ?? streak.current + 100;
  const streakFrom = [...STREAK_GOALS].reverse().find((g) => g <= streak.current) ?? 0;
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
        <LuxHello greeting={greeting(settings.locale)} />
      </header>

      <StreakHero />

      {nextMeta && currentTopic ? (
        <section className="continue-card" style={topicVars(currentTopic.color)} aria-labelledby="cc-title">
          <a className="cc-art cover-frame" href={href(`topic/${currentTopic.id}`)} aria-label={currentTopic.title}><Cover motif={currentTopic.icon} color={currentTopic.color} /></a>
          <div className="cc-body">
            <p className="eyebrow">{currentTopic.title}{unitOfNext >= 0 ? ` · ${t('home.unitN', { n: unitOfNext + 1 })}` : ''}</p>
            <h2 id="cc-title">{nextMeta.title}</h2>
            {nextMeta.summary && <p className="cc-sum">{nextMeta.summary}</p>}
            <div className="cc-meta"><span>{t('home.lessonOf', { n: lessonNo, total: topicConcepts.length })}</span>{nextTag && <span>{nextTag}</span>}<span>{t('home.minutes', { n: nextMeta.estimated_minutes })}</span></div>
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
        <a className="mini-card" href={href('streak')} aria-label={t('streak.next', { n: streakGoal })}>
          <Ring value={(streak.current - streakFrom) / Math.max(1, streakGoal - streakFrom)} size={46} stroke={5} color="#f97316"><Icon name="flame" size={18} /></Ring>
          <div style={{ minWidth: 0 }}>
            <div className="mc-t">{t('streak.next', { n: streakGoal })}</div>
            <div className="mc-s">{t('streak.toGo', { n: streakGoal - streak.current })}</div>
          </div>
        </a>
      </div>

      <SocialStrip />

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

/**
 * Lux says hello at the top of the home screen. What he says follows the day:
 * a first hello, a nudge while today's streak is open, pride once it is safe.
 * Tap him and he reacts.
 */
function LuxHello({ greeting }: { greeting: string }) {
  const { t, progress, settings } = useApp();
  const reduce = prefersReducedMotion(settings);
  const [poke, setPoke] = useState<{ n: number; text: string; mood: LuxMood } | null>(null);
  const s = progress.streak;
  const hour = new Date().getHours();
  const fresh = progress.completedConcepts.size === 0;
  const base: { text: string; mood: LuxMood } = fresh
    ? { text: t('luxHello.first'), mood: 'wave' }
    : s.todayDone
      ? { text: t('luxHello.done'), mood: 'happy' }
      : s.current > 0
        ? hour >= 21 || hour < 5
          ? { text: t('luxHello.night', { n: s.current }), mood: 'sleepy' }
          : { text: t('luxHello.open', { n: s.current }), mood: 'wave' }
        : { text: t('luxHello.back'), mood: 'wave' };
  // the line is picked once per state, so it does not change on every render
  const [line, setLine] = useState(base);
  const stateKey = `${fresh}-${s.todayDone}-${s.current}`;
  useEffect(() => { setLine(base); setPoke(null); }, [stateKey, settings.locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTap = () => {
    const moods: LuxMood[] = ['wow', 'love', 'party', 'cheer'];
    const n = (poke?.n ?? 0) + 1;
    setPoke({ n, text: t('luxHello.poke'), mood: moods[n % moods.length] });
    play(settings.sound, 'boing');
  };
  const now = poke ?? line;
  return (
    <LuxSay className="hh-lux" mood={now.mood} size={72} still={reduce} bubbleKey={poke ? `poke-${poke.n}` : stateKey} onTap={onTap} tapLabel={t('lux.role')}>
      <h1>{greeting}</h1>
      <p>{now.text}</p>
    </LuxSay>
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

/** League rank and friend streaks at a glance (only with a community profile). */
function SocialStrip() {
  const { t, syncNonce } = useApp();
  const { active, conn } = useSocial();
  const league = useQuery<LeagueResponse>(active && conn ? `league:${conn.token}:${syncNonce}` : null, () => social.league(conn!));
  const friends = useQuery<FriendsResponse>(active && conn ? `friends:${conn.token}:${syncNonce}` : null, () => social.friends(conn!));
  if (!active || (!league.data && !friends.data)) return null;
  const lg = league.data;
  const me = lg?.standings?.find((s) => s.me);
  const fs = (friends.data?.friends ?? []).filter((f) => f.friendStreak.current > 0).sort((a, b) => b.friendStreak.current - a.friendStreak.current).slice(0, 5);
  return (
    <div className="home-grid" style={{ marginTop: 12 }}>
      {lg && !lg.optedOut && (
        <a className="mini-card" href={href('community/league')}>
          <TierBadge tier={lg.tier} size={42} />
          <div style={{ minWidth: 0 }}>
            <div className="mc-t">{t('home.league', { tier: tierName(t, lg.tier) })}</div>
            <div className="mc-s">{me ? t('home.leagueRank', { rank: me.rank, xp: me.xp }) : t('home.leagueJoin')}</div>
          </div>
        </a>
      )}
      <a className="mini-card" href={href('community/friends')}>
        <div style={{ minWidth: 0 }}>
          <div className="mc-t">{t('home.friendStreaks')}</div>
          {fs.length ? (
            <div className="fs-mini" aria-hidden="true">{fs.map((f) => <span key={f.id} className={f.friendStreak.todayDone ? 'on' : ''}><Avatar avatar={f.avatar} size={26} /><b>{f.friendStreak.current}</b></span>)}</div>
          ) : <div className="mc-s">{t('streak.friendsCta')}</div>}
        </div>
      </a>
    </div>
  );
}
