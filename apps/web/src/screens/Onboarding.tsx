import { useEffect, useState } from 'react';
import { Cover, topicVars } from '../components/art.tsx';
import { Icon, Logo } from '../components/ui.tsx';
import { href, navigate } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';
import { Lux } from '../components/Lux.tsx';
import { apiBase } from '../lib/api.ts';
import { normalizeCode } from '../lib/sync.ts';
import { SignInOptions } from '../components/SignIn.tsx';
import { ServerPicker } from '../components/ServerPicker.tsx';

export function Welcome() {
  const { t } = useApp();
  const art = [
    { motif: 'function', color: '#0f766e' },
    { motif: 'cube', color: '#1d4ed8' },
  ];
  return (
    <main className="welcome" id="main">
      <div className="welcome-art" aria-hidden="true">
        {art.map((a) => <div className="float" key={a.motif}><Cover motif={a.motif} color={a.color} /></div>)}
        <div className="welcome-hero"><Lux mood="cheer" size={132} /></div>
      </div>
      <div className="welcome-copy">
        <div className="row" style={{ gap: 10, marginBottom: 22, fontWeight: 700, fontSize: '1.125rem' }}><Logo size={34} /> Lumen</div>
        <div className="welcome-lux">
          <Lux mood="happy" size={60} />
          <p className="bubble">{t('welcome.lux')}</p>
        </div>
        <h1 className="display-xl">{t('welcome.headline')}</h1>
        <p className="lead">{t('app.tagline')}</p>
        <ul className="feature-list">
          <li><Icon name="sparkles" size={18} /> {t('welcome.f1')}</li>
          <li><Icon name="target" size={18} /> {t('welcome.f2')}</li>
          <li><Icon name="lock" size={18} /> {t('welcome.f3')}</li>
        </ul>
        <button className="btn primary lg block" onClick={() => navigate('onboarding')}>
          {t('welcome.start')} <Icon name="arrow" size={18} className="arrow" />
        </button>
        <button className="btn quiet block" style={{ marginTop: 10 }} onClick={() => navigate('login')}>{t('signin.welcome')}</button>
        <p className="fine">{t('welcome.privacy')}</p>
      </div>
    </main>
  );
}

const AREAS = [
  { id: 'math', motif: 'function', color: '#4f46e5' },
  { id: 'physics', motif: 'space', color: '#c2410c' },
  { id: 'chemistry', motif: 'atom', color: '#15803d' },
  { id: 'biology', motif: 'cell', color: '#65a30d' },
  { id: 'ee', motif: 'chip', color: '#b45309' },
  { id: 'cs', motif: 'code', color: '#0e7490' },
  { id: 'data', motif: 'bell', color: '#be185d' },
  { id: 'ai', motif: 'neural', color: '#7c3aed' },
  { id: 'logic', motif: 'puzzle', color: '#334155' },
] as const;

type Step = 'interests' | 'goal' | 'daily' | 'age' | 'account' | 'name' | 'placement';

export function Onboarding({ step: routeStep }: { step?: string }) {
  const { t, settings, updateSettings, lib, signIn } = useApp();
  // Decided once when onboarding starts, so the step list does not shift under the learner.
  const [needsAccount] = useState(() => !settings.account);
  const [isNew, setIsNew] = useState<boolean | null>(() => (settings.account ? !settings.social : null));
  const kid = settings.age === 'u13' || settings.age === '13-15';
  // The name is for the community (16+); counted until the age says otherwise, so the progress bar stays put.
  const steps: Step[] = ['interests', 'goal', 'daily', 'age', ...(needsAccount ? ['account' as const] : []), ...(!kid && isNew !== false && !settings.social ? ['name' as const] : []), 'placement'];
  const step: Step = steps.includes(routeStep as Step) ? (routeStep as Step) : 'interests';
  const index = steps.indexOf(step);
  const go = (next: Step, replace = false) => navigate(`onboarding/${next}`, replace);
  const forward = (replace = false) => go(steps[Math.min(index + 1, steps.length - 1)], replace);
  const available = new Set(lib?.catalog.topics.map((tp) => tp.area) ?? []);
  const countIn = (area: string) => lib?.catalog.topics.filter((tp) => tp.area === area).length ?? 0;
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState(settings.communityName ?? '');

  // Signed in on this step already (e.g. after coming back): nothing to do here.
  useEffect(() => {
    if (step === 'account' && settings.account) forward(true);
  }, [step, settings.account]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPath = () => {
    const paths = lib?.catalog.paths ?? [];
    for (const area of settings.interests) {
      const p = paths.find((path) => path.area === area);
      if (p) return p.id;
    }
    return paths.find((p) => p.area === 'math')?.id ?? paths[0]?.id ?? null;
  };

  const finish = (placement: boolean) => {
    updateSettings({ pathId: pickPath(), onboarded: !placement });
    navigate(placement ? 'placement' : '', true);
  };

  const toggleInterest = (id: string) => {
    const has = settings.interests.includes(id);
    updateSettings({ interests: has ? settings.interests.filter((x) => x !== id) : [...settings.interests, id] });
  };
  const nameOk = name.trim().length >= 2 && name.trim().length <= 30;
  const canNext = (step === 'interests' && settings.interests.length > 0) || (step === 'goal' && !!settings.goal) || step === 'daily' || (step === 'age' && !!settings.age) || (step === 'name' && nameOk);
  const next = () => {
    if (step === 'name') updateSettings({ communityName: name.trim() });
    forward();
  };

  return (
    <main className="onb" id="main">
      <div className="onb-top">
        {index > 0 && step !== 'name' ? (
          <button className="icon-btn" onClick={() => go(steps[index - 1], true)} aria-label={t('onb.back')}><Icon name="back" /></button>
        ) : index === 0 && !settings.account ? (
          <button className="icon-btn" onClick={() => navigate('welcome', true)} aria-label={t('onb.back')}><Icon name="back" /></button>
        ) : (
          <span style={{ width: 40 }} />
        )}
        <div className="seg-progress compact" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label={t('onb.step', { n: index + 1, total: steps.length })}>
          {steps.map((s, i) => <span key={s} className={`seg ${i <= index ? 'done' : ''}`}><i /></span>)}
        </div>
        <span style={{ width: 40 }} />
      </div>
      <div className="onb-body fade-in" key={step}>
        {step === 'interests' && (
          <>
            <h1>{t('onb.interests')}</h1>
            <p className="sub">{t('onb.interests.hint')}</p>
            <div className="choice-grid" role="group" aria-label={t('onb.interests')}>
              {AREAS.map((a) => {
                const ok = available.has(a.id);
                return (
                  <button key={a.id} type="button" className="choice-card" style={topicVars(a.color)} aria-pressed={settings.interests.includes(a.id)} disabled={!ok} onClick={() => toggleInterest(a.id)}>
                    <span className="thumb"><Cover motif={a.motif} color={a.color} /></span>
                    <span>
                      {t(`areaLong.${a.id}` as 'areaLong.math')}
                      <span className="sub2" style={{ display: 'block' }}>{ok ? t('discover.coursesN', { n: countIn(a.id) }) : t('area.soon')}</span>
                    </span>
                    <span className="check"><Icon name="check" size={14} strokeWidth={3} /></span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {step === 'goal' && (
          <>
            <h1>{t('onb.goal')}</h1>
            <p className="sub">{t('onb.goal.hint')}</p>
            <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label={t('onb.goal')}>
              {([['work', 'bolt', 'onb.goal.work.sub'], ['curious', 'sparkles', 'onb.goal.curious.sub'], ['school', 'book', 'onb.goal.school.sub']] as const).map(([g, ic, sub]) => (
                <button key={g} type="button" role="radio" className="choice-card wide" aria-checked={settings.goal === g} onClick={() => updateSettings({ goal: g })}>
                  <span className="ci"><Icon name={ic} /></span>
                  <span>
                    {t(`onb.goal.${g}`)}
                    <span className="sub2" style={{ display: 'block' }}>{t(sub)}</span>
                  </span>
                  <span className="check"><Icon name="check" size={14} strokeWidth={3} /></span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 'daily' && (
          <>
            <h1>{t('onb.daily')}</h1>
            <p className="sub">{t('onb.dailyHint')}</p>
            <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label={t('onb.daily')}>
              {[[5, 'onb.daily.casual'], [10, 'onb.daily.regular'], [15, 'onb.daily.serious'], [20, 'onb.daily.intense']].map(([m, k]) => (
                <button key={m} type="button" role="radio" className="choice-card wide" aria-checked={settings.dailyGoal === m} onClick={() => updateSettings({ dailyGoal: m as number })}>
                  <span className="ci tnum" style={{ fontWeight: 700 }}>{m}</span>
                  <span>
                    {t('onb.daily.min', { n: m })}
                    <span className="sub2" style={{ display: 'block' }}>{t(k as 'onb.daily.casual')}</span>
                  </span>
                  <span className="check"><Icon name="check" size={14} strokeWidth={3} /></span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 'age' && (
          <>
            <h1>{t('onb.age')}</h1>
            <p className="sub">{t('onb.age.hint')}</p>
            <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label={t('onb.age')}>
              {([['u13', 'onb.age.u13'], ['13-15', 'onb.age.13'], ['16+', 'onb.age.16']] as const).map(([a, k]) => (
                <button key={a} type="button" role="radio" className="choice-card wide" aria-checked={settings.age === a} onClick={() => updateSettings({ age: a })}>
                  <span>{t(k)}</span>
                  <span className="check"><Icon name="check" size={14} strokeWidth={3} /></span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 'account' && (
          <>
            <h1>{t('onb.account')}</h1>
            <p className="sub">{t('onb.account.hint')}</p>
            {kid && (
              <label className="row small consent-row">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('signin.parentConsent')}
              </label>
            )}
            <SignInOptions
              serverUrl={apiBase()}
              disabled={kid && !consent}
              onSignedIn={async (r) => {
                if (!r.token) return;
                setIsNew(r.created !== false);
                await signIn({ serverUrl: apiBase(), token: normalizeCode(r.token), lastSync: null, cursor: 0, method: r.method });
              }}
            />
            <TermsNote />
            <div style={{ marginTop: 18 }}><ServerPicker /></div>
          </>
        )}
        {step === 'name' && (
          <>
            <h1>{t('onb.name')}</h1>
            <p className="sub">{t('onb.name.hint')}</p>
            <form onSubmit={(e) => { e.preventDefault(); if (nameOk) next(); }}>
              <div className="field">
                <label htmlFor="onb-name">{t('social.setup.name')}</label>
                <input id="onb-name" className="input" maxLength={30} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
            </form>
            <p className="small faint">{t('social.privacy')}</p>
            <button type="button" className="btn quiet small" onClick={() => { updateSettings({ communityName: null }); forward(); }}>{t('onb.name.skip')}</button>
          </>
        )}
        {step === 'placement' && (
          <>
            <h1>{t('onb.placement')}</h1>
            <p className="sub">{t('onb.placement.hint')}</p>
            <div className="stack" style={{ marginTop: 16, gap: 10 }}>
              <button className="choice-card wide" onClick={() => finish(true)} disabled={!lib?.catalog.placement}>
                <span className="ci"><Icon name="target" /></span>
                <span>{t('onb.placement.start')}<span className="sub2" style={{ display: 'block' }}>{t('onb.placement.startSub')}</span></span>
                <Icon name="chevron" size={18} className="faint" />
              </button>
              <button className="choice-card wide" onClick={() => finish(false)}>
                <span className="ci"><Icon name="play" /></span>
                <span>{t('onb.placement.skip')}<span className="sub2" style={{ display: 'block' }}>{t('onb.placement.skipSub')}</span></span>
                <Icon name="chevron" size={18} className="faint" />
              </button>
            </div>
          </>
        )}
      </div>
      {!['account', 'placement'].includes(step) && (
        <div className="onb-foot">
          <div className="inner">
            <button className="btn primary lg grow" onClick={next} disabled={!canNext}>
              {t('onb.next')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Accepting the terms is part of signing in (no separate community sign-up). */
export function TermsNote() {
  const { t } = useApp();
  const links: Record<string, React.ReactNode> = {
    terms: <a key="terms" className="inline-link" href={href('legal/terms')}>{t('signin.termsLink')}</a>,
    privacy: <a key="privacy" className="inline-link" href={href('legal/privacy')}>{t('signin.privacyLink')}</a>,
  };
  return (
    <p className="small faint" style={{ marginTop: 16 }}>
      {t('signin.terms').split(/\{(terms|privacy)\}/).map((part, i) => (i % 2 ? links[part] : part))}
    </p>
  );
}
