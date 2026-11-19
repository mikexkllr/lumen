import { useState } from 'react';
import { Cover, topicVars } from '../components/art.tsx';
import { Icon, Logo } from '../components/ui.tsx';
import { navigate } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';
import { Lux } from '../components/Lux.tsx';

export function Welcome() {
  const { t } = useApp();
  const art = [
    { motif: 'function', color: '#0f766e' },
    { motif: 'neural', color: '#6d28d9' },
    { motif: 'cube', color: '#1d4ed8' },
  ];
  return (
    <main className="welcome" id="main">
      <div className="welcome-art" aria-hidden="true">
        {art.map((a) => <div className="float" key={a.motif}><Cover motif={a.motif} color={a.color} /></div>)}
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
        <button className="btn primary lg block" onClick={() => navigate('onboarding')} autoFocus>
          {t('welcome.start')} <Icon name="arrow" size={18} className="arrow" />
        </button>
        <p className="fine">{t('welcome.privacy')}</p>
      </div>
    </main>
  );
}

const AREAS = [
  { id: 'math', motif: 'function', color: '#4f46e5' },
  { id: 'physics', motif: 'space', color: '#c2410c' },
  { id: 'chemistry', motif: 'atom', color: '#15803d' },
  { id: 'cs', motif: 'code', color: '#0e7490' },
  { id: 'data', motif: 'bell', color: '#be185d' },
  { id: 'ai', motif: 'neural', color: '#7c3aed' },
  { id: 'logic', motif: 'puzzle', color: '#334155' },
] as const;

export function Onboarding() {
  const { t, settings, updateSettings, lib } = useApp();
  const [step, setStep] = useState(0);
  const total = 4;
  const available = new Set(lib?.catalog.topics.map((tp) => tp.area) ?? []);
  const countIn = (area: string) => lib?.catalog.topics.filter((tp) => tp.area === area).length ?? 0;

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
  const canNext = (step === 0 && settings.interests.length > 0) || (step === 1 && !!settings.goal) || step === 2;

  return (
    <main className="onb" id="main">
      <div className="onb-top">
        {step > 0 ? (
          <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label={t('onb.back')}><Icon name="back" /></button>
        ) : (
          <span style={{ width: 40 }} />
        )}
        <div className="seg-progress compact" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-label={t('onb.step', { n: step + 1, total })}>
          {Array.from({ length: total }, (_, i) => <span key={i} className={`seg ${i <= step ? 'done' : ''}`}><i /></span>)}
        </div>
        <span style={{ width: 40 }} />
      </div>
      <div className="onb-body fade-in" key={step}>
        {step === 0 && (
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
        {step === 1 && (
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
        {step === 2 && (
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
        {step === 3 && (
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
      {step < 3 && (
        <div className="onb-foot">
          <div className="inner">
            <button className="btn primary lg grow" onClick={() => setStep(step + 1)} disabled={!canNext}>
              {t('onb.next')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
