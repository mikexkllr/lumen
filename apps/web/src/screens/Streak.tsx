/** Streak details: current and longest streak, a month calendar, freezes, milestones and friend streaks. */
import { useState } from 'react';
import { addDays, isActiveDay } from '@lumen/engine';
import { Avatar } from '../components/social.tsx';
import { Flame } from '../components/Flame.tsx';
import { STREAK_GOALS } from '../components/Streaks.tsx';
import { BackButton, Icon } from '../components/ui.tsx';
import { href } from '../lib/router.ts';
import { isKid, prefersReducedMotion } from '../lib/settings.ts';
import { social, useQuery, type FriendsResponse } from '../lib/social.ts';
import { useSocial } from '../lib/socialContext.tsx';
import { useApp } from '../lib/store.tsx';

export { STREAK_GOALS };

export function Streak() {
  const { t, progress, settings, syncNonce } = useApp();
  const { active, conn } = useSocial();
  const s = progress.streak;
  const friends = useQuery<FriendsResponse>(active && conn ? `friends:${conn.token}:${syncNonce}` : null, () => social.friends(conn!));
  const next = STREAK_GOALS.find((g) => g > s.current) ?? s.current + 100;
  const prev = [...STREAK_GOALS].reverse().find((g) => g <= s.current) ?? 0;
  const withStreak = (friends.data?.friends ?? []).filter((f) => f.friendStreak.current > 0 || f.friendStreak.meToday || f.friendStreak.friendToday).sort((a, b) => b.friendStreak.current - a.friendStreak.current);
  return (
    <main id="main" className="fade-in">
      <BackButton className="solo" />
      <section className={`streak-hero ${s.todayDone ? 'on' : ''}`} aria-labelledby="st-h">
        <Flame size={76} lit={s.todayDone} still={prefersReducedMotion(settings)} className={!s.todayDone && s.current > 0 ? 'ember' : ''} />
        <div>
          <h1 id="st-h" className="display"><span className="tnum">{s.current}</span> <span className="sh-unit">{t('home.streakUnit', { n: s.current })}</span></h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>{s.todayDone ? t('home.streakSafe') : t('home.streakOpen')} · {t('streak.longest')}: {s.longest}</p>
        </div>
      </section>

      <section className="card" aria-labelledby="goal-h" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="goal-h" className="card-title">{t('streak.next', { n: next })}</h2>
          <span className="small faint">{t('streak.toGo', { n: next - s.current })}</span>
        </div>
        <div className="progress-bar streak-bar" style={{ marginTop: 10 }} aria-hidden="true"><div style={{ width: `${(100 * (s.current - prev)) / Math.max(1, next - prev)}%` }} /></div>
        <ol className="milestones" aria-label={t('streak.milestones')}>
          {STREAK_GOALS.slice(0, 7).map((g) => <li key={g} className={s.longest >= g ? 'on' : ''}><Icon name={s.longest >= g ? 'check' : 'flame'} size={13} /> {g}</li>)}
        </ol>
      </section>

      <Calendar />

      <section className="card row" style={{ marginTop: 14, gap: 14, alignItems: 'flex-start' }}>
        <span className="si-round tone-info"><Icon name="snow" size={20} /></span>
        <div>
          <h2 className="card-title">{t('streak.freezeTitle')}</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{t('streak.freezeInfo', { n: s.freezesLeftThisWeek })}</p>
        </div>
      </section>

      <section className="card row" style={{ marginTop: 10, gap: 14, alignItems: 'flex-start' }}>
        <span className="si-round tone-ok"><Icon name="target" size={20} /></span>
        <div>
          <h2 className="card-title">{t('streak.howTitle')}</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{t('streak.how')}</p>
        </div>
      </section>

      {!isKid(settings) && (
        <section aria-labelledby="fs-h">
          <div className="section-head"><h2 id="fs-h">{t('streak.friendsTitle')}</h2></div>
          {active && withStreak.length > 0 ? (
            <ul className="friend-list">
              {withStreak.map((f) => (
                <li key={f.id} className="friend-row">
                  <a href={href(`u/${f.id}`)} className="fr-main">
                    <Avatar avatar={f.avatar} size={40} />
                    <span className="fr-body"><strong>{f.name}</strong><span className="small faint">{f.friendStreak.todayDone ? t('friends.bothDone') : f.friendStreak.meToday ? t('friends.waitingFriend', { name: f.name }) : t('friends.waitingMe')}</span></span>
                  </a>
                  <span className={`fs-flame ${f.friendStreak.todayDone ? 'on' : ''}`}><Icon name="flame" size={18} /> {f.friendStreak.current}</span>
                </li>
              ))}
            </ul>
          ) : (
            <a className="btn" href={href(active ? 'community/friends' : 'community')}><Icon name="users" size={16} /> {t('streak.friendsCta')}</a>
          )}
        </section>
      )}
    </main>
  );
}

function Calendar() {
  const { t, progress, today, settings } = useApp();
  const [offset, setOffset] = useState(0);
  const base = new Date(`${today}T12:00:00`);
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1, 12);
  const first = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
  const lead = (month.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const frozen = new Set(progress.streak.frozenDays);
  const weekday = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(settings.locale, { weekday: 'narrow' }));
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysIn }, (_, i) => addDays(first, i))];
  const activeCount = cells.filter((d) => d && isActiveDay(progress.days[d])).length;
  return (
    <section className="card" aria-labelledby="cal-h" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label={t('streak.prevMonth')}><Icon name="back" size={18} /></button>
        <h2 id="cal-h" className="card-title" aria-live="polite">{month.toLocaleDateString(settings.locale, { month: 'long', year: 'numeric' })}</h2>
        <button className="icon-btn" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} aria-label={t('streak.nextMonth')}><Icon name="arrow" size={18} /></button>
      </div>
      <div className="cal-grid" role="grid" aria-label={`${t('streak.calendar')}: ${activeCount}`}>
        {weekday.map((w, i) => <span key={`w${i}`} className="cal-wd" aria-hidden="true">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const on = isActiveDay(progress.days[d]);
          const fz = !on && frozen.has(d);
          const label = `${new Date(`${d}T12:00:00`).toLocaleDateString(settings.locale)}${on ? ` · ${t('streak.active')}` : fz ? ` · ${t('streak.frozen')}` : ''}`;
          return <span key={d} role="gridcell" aria-label={label} title={label} className={`cal-d ${on ? 'on' : ''} ${fz ? 'frozen' : ''} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`}>{Number(d.slice(8))}</span>;
        })}
      </div>
      <div className="cal-legend small faint"><span><i className="cal-key on" /> {t('streak.active')}</span><span><i className="cal-key frozen" /> {t('streak.frozen')}</span></div>
    </section>
  );
}
