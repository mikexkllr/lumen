/** Course page, catalogue (Kurse) and review tab. */
import { useMemo, useState } from 'react';
import { buildReviewSession, dueItems, LEVELS, levelIndex, nextDue, openMistakes, retrievability, sessionSize, type Topic } from '@lumen/engine';
import { Cover, topicVars } from '../components/art.tsx';
import { Icon, relativeDay, Ring } from '../components/ui.tsx';
import { Lux } from '../components/Lux.tsx';
import { href, navigate } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';
import { buildPath, CourseCard, UnitList } from './Home.tsx';

const conceptsOf = (tp: Topic) => tp.units.flatMap((u) => u.concepts);

export function TopicScreen({ topicId }: { topicId: string }) {
  const { t, lib, progress, events } = useApp();
  const topic = lib?.catalog.topics.find((tp) => tp.id === topicId);
  if (!lib || !topic) return <main id="main"><p>{t('discover.none')}</p></main>;
  const all = conceptsOf(topic);
  const done = all.filter((c) => progress.completedConcepts.has(c)).length;
  const next = all.find((c) => !progress.completedConcepts.has(c));
  const minutes = all.reduce((s, c) => s + (lib.catalog.concepts[c]?.estimated_minutes ?? 0), 0);
  const problems = all.reduce((s, c) => s + (lib.catalog.concepts[c]?.problems ?? 0), 0);
  const reviewed = new Set(events.flatMap((e) => (e.type === 'review_session_completed' && e.unitId ? [e.unitId] : [])));
  // Render this course's units with the same lesson states as on the home path.
  const fakePath = { ...lib.catalog, paths: [{ id: '__t', type: 'path', title: '', description: '', locale: 'de', topics: [topic.id] } as never] };
  const { units } = buildPath(fakePath, '__t', progress, null, reviewed);
  const prereq = topic.prerequisites.map((p) => lib.catalog.topics.find((x) => x.id === p)).filter(Boolean) as Topic[];
  const mistakes = openMistakes(events, { topicId: topic.id }).length;
  return (
    <main id="main" style={topicVars(topic.color)} className="fade-in">
      <div className="topic-hero cover-frame">
        <Cover motif={topic.icon} color={topic.color} title={topic.title} />
        <button className="icon-btn glass back" onClick={() => (history.length > 1 ? history.back() : navigate('discover'))} aria-label={t('onb.back')}><Icon name="back" /></button>
      </div>
      <div className="topic-head">
        <p className="eyebrow"><a href={href(`discover/${topic.area}`)}>{t(`areaLong.${topic.area}` as 'areaLong.math')}</a> · {t('stage.n', { n: levelIndex(topic.level) + 1 })} · {t(`stage.${topic.level}` as 'stage.Einstieg')}</p>
        <h1 className="display" style={{ marginTop: 8 }}>{topic.title}</h1>
        <p className="lead">{topic.description}</p>
        <div className="meta-row">
          <span><Icon name="book" size={16} /> {t('discover.concepts', { n: all.length })}</span>
          <span><Icon name="target" size={16} /> {problems} {t('topic.problems')}</span>
          <span><Icon name="clock" size={16} /> ≈ {minutes} {t('home.minShort')}</span>
        </div>
        <div className="progress-line">
          <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done} aria-label={`${done}/${all.length}`}>
            <div style={{ width: `${(100 * done) / Math.max(1, all.length)}%` }} />
          </div>
          <span className="tnum">{done}/{all.length}</span>
        </div>
        {prereq.length > 0 && (
          <p className="small muted">
            {t('topic.prereq')}: {prereq.map((p, i) => <span key={p.id}>{i > 0 && ', '}<a href={href(`topic/${p.id}`)} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{p.title}</a></span>)}
          </p>
        )}
        {next && (
          <button className="btn primary lg block" style={{ marginTop: 6 }} onClick={() => navigate(`learn/${next}`)}>
            {done ? t('home.continue') : t('topic.start')} · {lib.catalog.concepts[next]?.title} <Icon name="arrow" size={18} className="arrow" />
          </button>
        )}
      </div>
      {mistakes > 0 && (
        <section className="lux-review" style={{ margin: '4px 0 18px' }}>
          <Lux mood="idle" size={48} />
          <div className="lr-body">
            <strong>{t('mistakes.topicTitle')}</strong>
            <p>{t('mistakes.topicBody', { n: mistakes })}</p>
            <div className="lr-actions"><button className="btn primary" onClick={() => navigate(`mistakes/${topic.id}`)}><Icon name="chat" size={17} /> {t('mistakes.topicStart')}</button></div>
          </div>
        </section>
      )}
      <UnitList topic={topic} units={units} />
      <p className="license">{t('topic.license', { license: topic.license, authors: topic.authors.join(', ') })}</p>
    </main>
  );
}

const SUBJECT_ORDER = ['math', 'physics', 'chemistry', 'cs', 'data', 'ai', 'logic'] as const;

/** Course catalogue: subjects overview, one zero-to-hero roadmap per subject, and search. */
export function Discover({ subject }: { subject?: string }) {
  const { t, lib, progress, settings } = useApp();
  const [q, setQ] = useState('');
  const area = subject && (SUBJECT_ORDER as readonly string[]).includes(subject) ? subject : 'all';
  const results = useMemo(() => {
    if (!lib) return [];
    const needle = q.trim().toLowerCase();
    return lib.catalog.topics
      .filter((tp) => area === 'all' || tp.area === area)
      .map((tp) => {
        const concepts = conceptsOf(tp).map((c) => lib.catalog.concepts[c]).filter(Boolean);
        const matches = needle ? concepts.filter((c) => `${c.title} ${c.summary ?? ''}`.toLowerCase().includes(needle)) : [];
        const topicHit = !needle || `${tp.title} ${tp.description}`.toLowerCase().includes(needle);
        return { tp, matches, show: topicHit || matches.length > 0 };
      })
      .filter((r) => r.show);
  }, [lib, q, area]);
  if (!lib) return null;
  const catalog = lib.catalog;
  const doneIn = (tp: Topic) => conceptsOf(tp).filter((c) => progress.completedConcepts.has(c)).length;
  const started = catalog.topics.filter((tp) => doneIn(tp) > 0 && doneIn(tp) < conceptsOf(tp).length);
  const searching = q.trim().length > 0;
  const totalLessons = Object.keys(catalog.concepts).length;
  const interests = new Set(settings.interests);
  const featured = [...catalog.topics].filter((tp) => doneIn(tp) === 0 && levelIndex(tp.level) <= 1).sort((a, b) => Number(interests.has(b.area)) - Number(interests.has(a.area)))[new Date().getDate() % 3] ?? catalog.topics[0];
  const subjects = SUBJECT_ORDER.filter((a) => catalog.topics.some((tp) => tp.area === a));
  const pathOf = (a: string) => catalog.paths.find((p) => p.area === a);
  // Courses of a subject in learning order: its path first, then anything not yet placed.
  const ordered = (a: string): Topic[] => {
    const p = pathOf(a);
    const inPath = (p?.topics ?? []).map((id) => catalog.topics.find((tp) => tp.id === id)).filter((tp): tp is Topic => !!tp);
    return [...inPath, ...catalog.topics.filter((tp) => tp.area === a && !inPath.includes(tp)).sort((x, y) => levelIndex(x.level) - levelIndex(y.level))];
  };
  const rank = new Map<string, number>();
  subjects.flatMap((a) => ordered(a)).forEach((tp, i) => rank.set(tp.id, i));
  const byRank = (a: Topic, b: Topic) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999);
  const go = (a: string) => {
    setQ('');
    navigate(a === 'all' ? 'discover' : `discover/${a}`);
    scrollTo({ top: 0 });
  };
  return (
    <main id="main" className="fade-in">
      <header className="page-head">
        <h1 className="display">{t('discover.title')}</h1>
        <p className="muted">{t('discover.stats', { n: catalog.topics.length, lessons: totalLessons })}</p>
      </header>
      <div className="search-field">
        <span className="ico"><Icon name="search" size={18} /></span>
        <label htmlFor="search" className="sr-only">{t('discover.search')}</label>
        <input id="search" type="search" placeholder={t('discover.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chip-row" role="group" aria-label={t('discover.area')}>
        {['all', ...subjects].map((a) => (
          <button key={a} className="chip" aria-pressed={area === a} onClick={() => go(a)}>
            {a === 'all' ? t('discover.allSubjects') : t(`areaLong.${a}` as 'areaLong.math')}
          </button>
        ))}
      </div>

      {searching ? (
        <section>
          <div className="section-head"><h2>{t('discover.results')}</h2><span className="count">{results.length}</span></div>
          {results.length === 0 && <p className="muted">{t('discover.none')}</p>}
          <div className="course-grid">{[...results].sort((x, y) => byRank(x.tp, y.tp)).map(({ tp }) => <CourseCard key={tp.id} topic={tp} done={doneIn(tp)} />)}</div>
          {results.some((r) => r.matches.length) && (
            <>
              <div className="section-head"><h2>{t('discover.lessons')}</h2></div>
              <div className="course-rows">
                {results.flatMap((r) => r.matches.map((c) => (
                  <a key={c.id} className="course-row" href={href(`learn/${c.id}`)} style={topicVars(r.tp.color)}>
                    <span className="thumb" style={{ width: 48, height: 48 }}><Cover motif={r.tp.icon} color={r.tp.color} /></span>
                    <span className="cr-body"><strong>{c.title}</strong><span>{r.tp.title}</span></span>
                    <Icon name="play" size={16} />
                  </a>
                )))}
              </div>
            </>
          )}
        </section>
      ) : area === 'all' ? (
        <>
          <section>
            <div className="section-head"><h2>{t('discover.subjects')}</h2><span className="count">{subjects.length}</span></div>
            <div className="subject-grid">
              {subjects.map((a) => {
                const list = ordered(a);
                const p = pathOf(a);
                const concepts = list.flatMap(conceptsOf);
                const done = concepts.filter((c) => progress.completedConcepts.has(c)).length;
                return (
                  <button key={a} className="subject-card" aria-current={!!p && settings.pathId === p.id} onClick={() => go(a)}>
                    <span className="cover-bg"><Cover motif={p?.icon} color={p?.color} /></span>
                    <strong>{t(`areaLong.${a}` as 'areaLong.math')}</strong>
                    <span className="sc-meta">{t('discover.subjectMeta', { n: list.length, lessons: concepts.length })}</span>
                    <span className="stage-dots" aria-hidden="true">
                      {LEVELS.map((l) => {
                        const inStage = list.filter((tp) => tp.level === l);
                        const finished = inStage.length > 0 && inStage.every((tp) => doneIn(tp) >= conceptsOf(tp).length);
                        return <i key={l} data-has={inStage.length > 0} data-done={finished} />;
                      })}
                    </span>
                    {done > 0 && <span className="sc-meta">{t('discover.subjectDone', { done, total: concepts.length })}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {started.length > 0 && (
            <section>
              <div className="section-head"><h2>{t('discover.inProgress')}</h2></div>
              <div className="shelf-row">{[...started].sort(byRank).map((tp) => <CourseCard key={tp.id} topic={tp} done={doneIn(tp)} />)}</div>
            </section>
          )}

          {featured && (
            <a className="feature-card" href={href(`topic/${featured.id}`)} style={{ ...topicVars(featured.color), marginTop: 28 }}>
              <div className="fc-art cover-frame"><Cover motif={featured.icon} color={featured.color} /></div>
              <div className="fc-body">
                <p className="eyebrow">{t('discover.featured')} · {t(`areaLong.${featured.area}` as 'areaLong.math')}</p>
                <h2>{featured.title}</h2>
                <p className="muted">{featured.description}</p>
                <span className="btn primary" style={{ marginTop: 8 }}>{t('topic.start')} <Icon name="arrow" size={17} className="arrow" /></span>
              </div>
            </a>
          )}
        </>
      ) : (
        <Roadmap subject={area} topics={ordered(area)} doneIn={doneIn} />
      )}
    </main>
  );
}

/** One subject from zero to hero: stages in order, courses in order, the next course highlighted. */
function Roadmap({ subject, topics, doneIn }: { subject: string; topics: Topic[]; doneIn(tp: Topic): number }) {
  const { t, lib, settings, updateSettings } = useApp();
  const path = lib?.catalog.paths.find((p) => p.area === subject);
  const firstOpen = topics.find((tp) => doneIn(tp) < conceptsOf(tp).length);
  const lessons = topics.reduce((s, tp) => s + conceptsOf(tp).length, 0);
  const finished = topics.filter((tp) => doneIn(tp) >= conceptsOf(tp).length).length;
  const isMine = !!path && settings.pathId === path.id;
  return (
    <section className="roadmap" style={topicVars(path?.color)}>
      <div className="roadmap-head">
        <div className="rh-art cover-frame"><Cover motif={path?.icon} color={path?.color} /></div>
        <div className="rh-body">
          <p className="eyebrow">{t('discover.roadmap')}</p>
          <h2>{t(`areaLong.${subject}` as 'areaLong.math')}</h2>
          {path?.description && <p className="muted">{path.description}</p>}
          <div className="meta-row">
            <span><Icon name="layers" size={16} /> {t('discover.coursesN', { n: topics.length })}</span>
            <span><Icon name="book" size={16} /> {t('discover.concepts', { n: lessons })}</span>
            <span><Icon name="done" size={16} /> {finished}/{topics.length}</span>
          </div>
          {path && (
            <button className={`btn ${isMine ? 'ghost' : 'primary'}`} disabled={isMine} onClick={() => { updateSettings({ pathId: path.id, startAt: null }); navigate(''); }}>
              {isMine ? <><Icon name="check" size={17} /> {t('discover.isPath')}</> : <>{t('discover.usePath')} <Icon name="arrow" size={17} className="arrow" /></>}
            </button>
          )}
        </div>
      </div>
      <ol className="stages">
        {LEVELS.map((lvl, i) => {
          const list = topics.filter((tp) => tp.level === lvl);
          if (!list.length) return null;
          return (
            <li key={lvl} className="stage">
              <span className="stage-no" aria-hidden="true">{i + 1}</span>
              <div className="stage-head">
                <div>
                  <h3>{t('stage.n', { n: i + 1 })} · {t(`stage.${lvl}` as 'stage.Einstieg')}</h3>
                  <p>{t(`stage.desc.${lvl}` as 'stage.desc.Einstieg')}</p>
                </div>
              </div>
              <div className="stage-courses">
                {list.map((tp) => <RoadCourse key={tp.id} topic={tp} done={doneIn(tp)} next={tp === firstOpen} />)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RoadCourse({ topic, done, next }: { topic: Topic; done: number; next: boolean }) {
  const { t, lib } = useApp();
  const all = conceptsOf(topic);
  const complete = done >= all.length;
  const minutes = all.reduce((s, c) => s + (lib?.catalog.concepts[c]?.estimated_minutes ?? 0), 0);
  const state = complete ? 'done' : next ? 'next' : done > 0 ? 'started' : 'later';
  return (
    <a className="road-course" data-state={state} href={href(`topic/${topic.id}`)} style={topicVars(topic.color)}>
      <span className="thumb cover-frame"><Cover motif={topic.icon} color={topic.color} /></span>
      <span className="rc-body">
        <strong>{topic.title}</strong>
        <span className="desc">{topic.description}</span>
        <span className="meta">
          {t('discover.concepts', { n: all.length })} · {minutes} {t('home.minShort')}
          {next && <span className="next-tag"> · {done > 0 ? t('home.continue') : t('discover.nextUp')}</span>}
        </span>
        {done > 0 && !complete && <span className="progress-bar" aria-label={`${done}/${all.length}`}><span style={{ display: 'block', height: '100%', width: `${(100 * done) / all.length}%` }} /></span>}
      </span>
      <span className="rc-state" aria-label={complete ? t('discover.courseDone') : undefined}>
        <Icon name={complete ? 'check' : next ? 'play' : 'chevron'} size={16} strokeWidth={complete ? 3 : 2} />
      </span>
    </a>
  );
}

export function ReviewScreen() {
  const { t, lib, reviewItems, settings } = useApp();
  if (!lib) return null;
  const now = new Date();
  const due = dueItems(reviewItems, now);
  const nd = nextDue(reviewItems);
  const start = (ids: string[]) => navigate(`practice/review/${ids.map(encodeURIComponent).join(',')}`);
  const items = [...reviewItems.values()].sort((a, b) => retrievability(a, now) - retrievability(b, now));
  const byTopic = new Map<string, typeof items>();
  for (const it of items) byTopic.set(it.topicId, [...(byTopic.get(it.topicId) ?? []), it]);
  const avg = items.length ? Math.round((100 * items.reduce((s, it) => s + retrievability(it, now), 0)) / items.length) : 0;
  return (
    <main id="main" className="fade-in">
      <header className="page-head">
        <h1 className="display">{t('review.title')}</h1>
        <p className="muted">{t('review.intro')}</p>
      </header>
      <section className="continue-card" style={topicVars('#c2410c')}>
        <div className="cc-art cover-frame"><Cover motif="review" color="#c2410c" /></div>
        <div className="cc-body">
          {items.length === 0 ? (
            <>
              <h2>{t('review.emptyTitle')}</h2>
              <p className="cc-sum">{t('review.empty')}</p>
              <button className="btn primary lg" onClick={() => navigate('')}>{t('home.start')} <Icon name="arrow" size={18} className="arrow" /></button>
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 14 }}>
                <Ring value={avg / 100} size={56} stroke={6} color="var(--ok)">{avg}%</Ring>
                <div>
                  <p className="eyebrow">{t('review.strength')}</p>
                  <h2>{due.length ? t('review.due', { n: due.length }) : t('review.none')}</h2>
                </div>
              </div>
              {!due.length && nd && <p className="cc-sum" style={{ marginTop: 8 }}>{t('review.next', { when: relativeDay(nd, now, t) })}</p>}
              <button className="btn primary lg" onClick={() => start(due.length ? buildReviewSession(reviewItems, now, sessionSize(settings.dailyGoal)).map((i) => i.itemId) : items.slice(0, 6).map((i) => i.itemId))}>
                {due.length ? t('review.start') : t('review.practice')} <Icon name="arrow" size={18} className="arrow" />
              </button>
            </>
          )}
        </div>
      </section>
      {items.length > 0 && <div className="section-head"><h2>{t('review.items')}</h2><span className="count">{items.length}</span></div>}
      <div className="stack">
        {[...byTopic.entries()].map(([tid, list]) => {
          const topic = lib.catalog.topics.find((tp) => tp.id === tid);
          return (
            <section key={tid} className="card" style={{ ...topicVars(topic?.color), padding: 16 }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="thumb" style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', flex: 'none' }}><Cover motif={topic?.icon} color={topic?.color} /></span>
                <h3>{topic?.title}</h3>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
                {list.map((it) => {
                  const r = Math.round(retrievability(it, now) * 100);
                  const concept = lib.catalog.concepts[it.conceptId];
                  return (
                    <li key={it.itemId} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                      <span className="small" style={{ fontWeight: 550, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{concept?.title}</span>
                      <span className="row small" style={{ minWidth: 140, flex: 'none' }}>
                        <span className="progress-bar" style={{ flex: 1, ['--topic' as string]: r < 70 ? 'var(--warn)' : 'var(--ok)' }} aria-hidden="true"><div style={{ width: `${r}%` }} /></span>
                        <span aria-label={`${t('review.strength')} ${r} %`} className="tnum" style={{ fontWeight: 650, minWidth: '3.5ch', textAlign: 'right' }}>{r}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
