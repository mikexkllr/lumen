/**
 * The streak, made a big deal of: the week strip, the card on the home screen
 * and the celebration that plays the first time a day counts.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { addDays, isActiveDay, weekKey } from '@lumen/engine';
import { Confetti } from './art.tsx';
import { Burst } from './celebrate.tsx';
import { Flame } from './Flame.tsx';
import { Lux, type LuxMood } from './Lux.tsx';
import { Icon } from './ui.tsx';
import { href } from '../lib/router.ts';
import { prefersReducedMotion } from '../lib/settings.ts';
import { play, vibrate } from '../lib/sound.ts';
import { useApp } from '../lib/store.tsx';

export const STREAK_GOALS = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];

/** Monday to Sunday of the current week; `pending` holds today's mark back until the celebration lights it. */
export function WeekStrip({ big = false, pending = false }: { big?: boolean; pending?: boolean }) {
  const { progress, today, settings } = useApp();
  const monday = weekKey(today);
  const frozen = new Set(progress.streak.frozenDays);
  const names = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(settings.locale, { weekday: 'narrow' })), [settings.locale]);
  return (
    <div className={`week-strip ${big ? 'big' : ''}`} aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d, i) => {
        const on = isActiveDay(progress.days[d]) && !(pending && d === today);
        return (
          <div className="d" key={d}>
            <span className={`c ${on ? 'on' : frozen.has(d) ? 'frozen' : ''} ${d === today ? 'today' : ''} ${on && d === today ? 'pop' : ''}`}>{on ? <Icon name="check" size={big ? 16 : 12} strokeWidth={3} /> : frozen.has(d) ? <Icon name="snow" size={big ? 14 : 11} /> : null}</span>
            {names[i]}
          </div>
        );
      })}
    </div>
  );
}

/** The streak on the home screen: flame, count, this week and what today still needs. */
export function StreakHero() {
  const { t, progress, settings } = useApp();
  const s = progress.streak;
  const reduce = prefersReducedMotion(settings);
  const state = s.todayDone ? 'done' : s.current > 0 ? 'open' : 'new';
  const late = state === 'open' && new Date().getHours() >= 18;
  const next = STREAK_GOALS.find((g) => g > s.current) ?? s.current + 100;
  const message = state === 'done' ? t('streakHero.done', { n: next - s.current, goal: next }) : state === 'new' ? t('streakHero.new') : late ? t('streakHero.late', { n: s.current }) : t('streakHero.open');
  return (
    <a className={`streak-hero-card ${state} ${late ? 'late' : ''}`} href={href('streak')} aria-label={`${t('home.streakN', { n: s.current })} – ${message}`}>
      <Flame size={62} lit={state === 'done'} still={reduce} className={state === 'open' ? 'ember' : ''} />
      <div className="shc-body">
        <div className="shc-count"><strong className="tnum">{s.current}</strong> <span>{t('home.streakUnit', { n: s.current })}</span></div>
        <p className="shc-msg">{message}</p>
      </div>
      <WeekStrip />
    </a>
  );
}

/**
 * Full-screen celebration when today starts or extends the streak: the flame
 * catches fire, the count rolls up, today's circle fills, Lux goes wild.
 */
export function StreakParty({ onContinue }: { onContinue(): void }) {
  const { t, progress, settings, today } = useApp();
  const reduce = prefersReducedMotion(settings);
  const n = progress.streak.current;
  const milestone = STREAK_GOALS.includes(n);
  const next = STREAK_GOALS.find((g) => g > n) ?? n + 100;
  const prev = [...STREAK_GOALS].reverse().find((g) => g <= n) ?? 0;
  // 0 = yesterday's state, 1 = the flame is lit, 2 = the count rolled up, 3 = today's circle is filled
  const [beat, setBeat] = useState(reduce ? 3 : 0);
  const [line] = useState(() => (milestone ? t('streakParty.milestone', { n }) : n === 1 ? (progress.streak.longest > 1 ? t('streakParty.again') : t('streakParty.first')) : n === 2 ? t('streakParty.second') : t('streakParty.lines')));
  // yesterday was bridged by a freeze: say so, it is why the streak is still alive
  const saved = n > 1 && progress.streak.frozenDays.includes(addDays(today, -1));

  useEffect(() => {
    if (reduce) {
      play(settings.sound, 'streak');
      return;
    }
    const timers = [
      window.setTimeout(() => { setBeat(1); play(settings.sound, 'ignite'); vibrate(settings.haptics, 30); }, 500),
      window.setTimeout(() => { setBeat(2); play(settings.sound, milestone ? 'levelUp' : 'streakUp', n); vibrate(settings.haptics, [20, 50, 20, 50, 40]); }, 1050),
      window.setTimeout(() => { setBeat(3); play(settings.sound, 'pop', 5); }, 1650),
    ];
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mood: LuxMood = beat === 0 ? 'wow' : 'party';
  const shown = beat >= 2 ? n : Math.max(0, n - 1);
  return (
    <main className={`streak-party ${beat >= 1 ? 'lit' : ''} ${milestone ? 'milestone' : ''}`} id="main">
      {milestone && beat >= 2 && <Confetti reduce={reduce} color="#f97316" />}
      {!reduce && <div className="sp-embers" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${6 + ((i * 37) % 88)}%`, animationDelay: `${(i * 0.37) % 3.2}s`, animationDuration: `${2.6 + ((i * 0.53) % 2)}s` }} />)}</div>}
      <div className="sp-inner">
        <div className="sp-stage" aria-hidden="true">
          <motion.div className="sp-flame" animate={reduce ? undefined : beat >= 1 ? { scale: [0.7, 1.22, 1], rotate: [0, -4, 0] } : { scale: 0.86 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
            <Flame size={168} lit={beat >= 1} still={reduce} />
            {beat >= 1 && !reduce && <Burst key={`ignite-${beat >= 2}`} color="#f97316" power={beat >= 2 ? 4 : 2} seed={beat} x="50%" y="55%" />}
          </motion.div>
          <motion.div className="sp-lux" initial={reduce ? false : { x: 60, opacity: 0, rotate: 14 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}>
            <Lux mood={mood} size={96} still={reduce} />
          </motion.div>
        </div>
        <p className="eyebrow sp-eyebrow">{milestone ? t('streakParty.milestoneTag') : n === 1 ? t('streakParty.started') : t('streak.extended')}</p>
        <h1 className="sp-count" aria-label={t('home.streakN', { n })}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={shown} className="tnum" aria-hidden="true" initial={reduce ? false : { y: 70, opacity: 0, scale: 0.5 }} animate={{ y: 0, opacity: 1, scale: [0.5, 1.3, 1] }} exit={{ y: -70, opacity: 0, scale: 0.7, transition: { duration: 0.2 } }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}>
              {shown}
            </motion.span>
          </AnimatePresence>
        </h1>
        <p className="sp-unit">{t('home.streakUnit', { n })}</p>
        <motion.p className="sp-line" role="status" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: beat >= 2 ? 1 : 0, y: beat >= 2 ? 0 : 10 }} transition={{ duration: 0.35 }}>{line}</motion.p>
        <div className="sp-week"><WeekStrip big pending={beat < 3} /></div>
        <div className="sp-goal">
          <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <strong>{t('streakParty.toGoal', { n: next - n, goal: next })}</strong>
            <span className="small faint tnum">{n}/{next}</span>
          </div>
          <div className="progress-bar streak-bar" aria-hidden="true"><motion.div initial={reduce ? false : { width: `${(100 * Math.max(0, n - 1 - prev)) / Math.max(1, next - prev)}%` }} animate={{ width: `${(100 * (beat >= 3 ? n - prev : Math.max(0, n - 1 - prev))) / Math.max(1, next - prev)}%` }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} /></div>
          {saved && <p className="small faint sp-saved"><Icon name="snow" size={13} /> {t('streakParty.saved')}</p>}
        </div>
        <button className="btn primary lg block sp-go" autoFocus onClick={onContinue}>
          {t('player.continue')} <Icon name="arrow" size={18} className="arrow" />
        </button>
      </div>
    </main>
  );
}
