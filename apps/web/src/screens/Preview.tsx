/**
 * Authoring preview: every step of a concept rendered live, with the same
 * evals that run in CI. Under `lumen dev`, saving a YAML file reloads the page.
 */
import { useMemo, useState } from 'react';
import { evalConcept, initialState, randomSeed, referenceSolve, resolveProblem, type Concept, type Issue, type ProblemStep } from '@lumen/engine';
import { Icon, PageHeader } from '../components/ui.tsx';
import { inline, Markdown } from '../lib/markdown.tsx';
import { href } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';
import { VIEWS, Visual } from '../widgets/index.tsx';
import { useEffect } from 'react';

export function PreviewIndex() {
  const { t, lib } = useApp();
  if (!lib) return null;
  return (
    <main id="main">
      <PageHeader back="profile" title={t('preview.title')} sub={t('preview.intro')} />
      <p className="small">Content-Version: <code>{lib.manifest.version}</code> · Schema {lib.manifest.schema}</p>
      {lib.catalog.topics.map((tp) => (
        <section key={tp.id} className="card flat" style={{ marginBottom: 12 }}>
          <h2>{tp.title} <span className="small muted">({tp.id})</span></h2>
          {tp.units.map((u) => (
            <div key={u.id}>
              <h3 className="small muted" style={{ marginTop: 8 }}>{u.title}</h3>
              <ul>
                {[...new Set(u.concepts.map((c) => lib.catalog.concepts[c]?.group ?? c))].map((g) => (
                  <li key={g}><a href={href(`preview/${g}`)}>{lib.catalog.concepts[lib.lessonsOf(g)[0]]?.title}</a> <code className="small">{g}</code> <span className="small muted">· {lib.lessonsOf(g).length} {lib.lessonsOf(g).length === 1 ? 'lesson' : 'lessons'}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}

export function PreviewConcept({ conceptId }: { conceptId: string }) {
  const { t, lib } = useApp();
  const [concept, setConcept] = useState<Concept | null>(null);
  // authors see the concept as they wrote it; `lessons` shows how it is cut for learners
  const lessons = lib?.lessonsOf(lib.catalog.concepts[conceptId]?.group ?? conceptId) ?? [];
  useEffect(() => {
    lib?.group(lib.catalog.concepts[conceptId]?.group ?? conceptId).then(setConcept);
  }, [lib, conceptId]);
  const issues = useMemo(() => (concept ? evalConcept(concept, undefined, { variantSamples: 4, fuzzRuns: 6 }) : []), [concept]);
  if (!concept) return <main id="main"><p>{t('loading')}</p></main>;
  const byStep = new Map<string, Issue[]>();
  for (const i of issues) byStep.set(i.step ?? '', [...(byStep.get(i.step ?? '') ?? []), i]);
  return (
    <main id="main">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <a className="icon-btn" style={{ marginLeft: -10 }} href={href('preview')} aria-label={t('onb.back')}><Icon name="back" /></a>
        <span className="row wrap" style={{ gap: 6 }}>
          {lessons.map((id) => {
            const m = lib?.catalog.concepts[id];
            return <a key={id} className="btn primary small" href={href(`learn/${id}`)}>▶ {m && (m.depth ?? 1) > 1 ? t(`depth.name${m.depth}`) : `${m?.part ?? 1}/${m?.parts ?? 1}`} · {m?.steps}</a>;
          })}
        </span>
      </div>
      <h1>{concept.title}</h1>
      <p className="small muted">{concept.id} · {concept.license} · {concept.authors.join(', ')} · Skills: {concept.skills.join(', ')}</p>
      {(byStep.get('') ?? []).map((i, k) => <IssueLine key={k} issue={i} />)}
      {!issues.some((i) => i.level !== 'info') && <p className="feedback ok"><span className="fb-icon">✓</span> {t('preview.ok')}</p>}
      {concept.steps.map((s, idx) => (
        <section key={s.id} className="card" style={{ margin: '12px 0' }}>
          <p className="small muted" style={{ marginTop: 0 }}>#{idx} · {s.kind} {s.kind === 'problem' ? `· ${s.widget}` : ''} · <code>{s.id}</code></p>
          {s.kind === 'explain' ? (
            <>
              <Markdown text={s.body} />
              {s.visual && <Visual widget={s.visual.widget} params={s.visual.params} locale={concept.locale} />}
            </>
          ) : (
            <ProblemPreview step={s} locale={concept.locale} />
          )}
          {(byStep.get(s.id) ?? []).map((i, k) => <IssueLine key={k} issue={i} />)}
        </section>
      ))}
    </main>
  );
}

function IssueLine({ issue }: { issue: Issue }) {
  return <div className={`issue ${issue.level}`}><strong>{issue.level}</strong> [{issue.code}] {issue.message}</div>;
}

function ProblemPreview({ step, locale }: { step: ProblemStep; locale: string }) {
  const { t } = useApp();
  const [seed, setSeed] = useState(0);
  const rp = useMemo(() => {
    try {
      return resolveProblem(step, seed, locale);
    } catch (e) {
      return e as Error;
    }
  }, [step, seed, locale]);
  const [state, setState] = useState<unknown>(() => (rp instanceof Error ? null : initialState(rp)));
  useEffect(() => {
    if (!(rp instanceof Error)) setState(initialState(rp));
  }, [rp]);
  if (rp instanceof Error) return <div className="issue error">{rp.message}</div>;
  const View = VIEWS[rp.widget.kind];
  return (
    <div>
      {rp.body && <Markdown text={rp.body} />}
      {rp.visual && <Visual widget={rp.visual.widget} params={rp.visual.params} locale={locale} />}
      <p style={{ fontWeight: 700 }}>{inline(rp.prompt)}</p>
      {View && <View params={rp.params} state={state} dispatch={(a) => setState((s: unknown) => rp.widget.applyAction(s, a, rp.params))} readOnly={false} locale={locale} />}
      <p className="small muted">{rp.widget.describe(state, rp.params, locale)}</p>
      {rp.hints.length > 0 && <p className="small">💡 {rp.hints.join(' · ')}</p>}
      <div className="row wrap">
        <button className="btn small" onClick={() => { const s = referenceSolve(rp); if (s) setState(s.state); }}>{t('preview.solve')}</button>
        {step.variants && <button className="btn small" onClick={() => setSeed(randomSeed())}>{t('preview.variant')} {seed ? `(seed ${seed})` : ''}</button>}
        <button className="btn small" onClick={() => setState(initialState(rp))}>{t('player.reset')}</button>
      </div>
    </div>
  );
}
