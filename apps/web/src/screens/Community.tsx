/**
 * Community: weekly league, friends with friend streaks, and a feed of
 * milestones – 16+, backed by the Lumen server, set up with the account.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, errorText, relTime, Sheet, TierBadge, tierName } from '../components/social.tsx';
import { BackButton, Empty, Icon, LoadingRow, Note, PageHeader, Switch, useConfirm } from '../components/ui.tsx';
import { href, navigate } from '../lib/router.ts';
import { isKid } from '../lib/settings.ts';
import {
  AVATAR_COLORS, AVATAR_ICONS, createProfile, daysLeft, inviteLink, REACTIONS, reactionEmoji, REPORT_REASONS, serverHasSocial, social, TIERS, useQuery,
  type FeedItem, type Friend, type FriendsResponse, type LeagueResponse, type Notice, type PublicUser, type SocialConn, type Tier, type UserSummary,
} from '../lib/social.ts';
import { useSocial } from '../lib/socialContext.tsx';
import { useApp } from '../lib/store.tsx';
import { ACHIEVEMENTS } from '@lumen/engine';
import type { TKey } from '../lib/i18n.ts';

type Section = 'league' | 'friends' | 'feed';

export function Community({ section }: { section?: string }) {
  const { t, settings, online } = useApp();
  const { active, me } = useSocial();
  const sec: Section = section === 'friends' || section === 'feed' ? section : 'league';
  if (isKid(settings)) return <KidsNotice />;
  if (!active) return <JoinCommunity />;
  const badge = me.data ? me.data.unseen + me.data.requests : 0;
  return (
    <main id="main" className="fade-in">
      <PageHeader title={t('social.title')} />
      {!online && <Note tone="warn" icon="offline" role="status" style={{ marginBottom: 14 }}>{t('social.offline')}</Note>}
      {me.error?.message === 'banned' && <Note tone="bad" role="alert" style={{ marginBottom: 14 }}>{t('social.err.banned')}</Note>}
      <nav className="sc-tabs" aria-label={t('social.title')}>
        {(['league', 'friends', 'feed'] as const).map((s) => (
          <a key={s} href={href(`community/${s}`)} aria-current={sec === s ? 'page' : undefined}>
            {t(`social.tab.${s}` as TKey)}
            {s === 'feed' && badge > 0 ? <span className="badge">{badge}</span> : null}
          </a>
        ))}
      </nav>
      {sec === 'league' ? <LeagueView /> : sec === 'friends' ? <FriendsView /> : <FeedView />}
    </main>
  );
}

function KidsNotice() {
  const { t } = useApp();
  return (
    <main id="main" className="fade-in">
      <PageHeader title={t('social.title')} />
      <Empty icon="users" action={<a className="btn" href={href('streak')}><Icon name="flame" size={16} /> {t('streak.title')}</a>}>{t('social.kids')}</Empty>
    </main>
  );
}

/**
 * No community profile yet (skipped in onboarding, deleted, or an account from before sign-in
 * was the way in): one name and the community is on – the account already exists.
 */
function JoinCommunity() {
  const { t, settings, updateSettings, online } = useApp();
  const { conn, me } = useSocial();
  const [name, setName] = useState(settings.communityName ?? '');
  const [age, setAge] = useState(settings.age === '16+');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = name.trim().length >= 2 && age && !!conn && online && !busy;
  const join = async () => {
    if (!conn) return;
    setBusy(true);
    setMsg(null);
    try {
      if (!(await serverHasSocial(conn.serverUrl))) throw new Error(t('social.noServer'));
      const p = await createProfile(conn, name);
      updateSettings({ social: { userId: p.id, handle: p.handle }, communityName: name.trim(), age: '16+' });
      me.reload();
    } catch (e) {
      setMsg(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main id="main" className="fade-in">
      <PageHeader title={t('social.introTitle')} sub={t('social.intro')} />
      <ul className="sc-points">
        <li><span className="si"><Icon name="trophy" size={18} /></span>{t('social.point.league')}</li>
        <li><span className="si"><Icon name="flame" size={18} /></span>{t('social.point.friends')}</li>
        <li><span className="si"><Icon name="users" size={18} /></span>{t('social.point.feed')}</li>
      </ul>
      {!online && <Note tone="warn" icon="offline" role="status" style={{ marginBottom: 14 }}>{t('social.offline')}</Note>}
      {me.loading && !me.error ? <LoadingRow /> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ok) void join(); }}>
          <div className="field">
            <label htmlFor="sc-name">{t('social.setup.name')}</label>
            <input id="sc-name" className="input" maxLength={30} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {settings.age !== '16+' && <label className="check-row small"><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> {t('social.setup.age')}</label>}
          <p className="small faint" style={{ margin: 0 }}>{t('social.privacy')}</p>
          {msg && <Note tone="bad" role="alert">{msg}</Note>}
          <button className="btn primary lg" type="submit" disabled={!ok}>{busy ? t('loading') : t('social.join')} <Icon name="arrow" size={18} className="arrow" /></button>
        </form>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- edit profile

export function ProfileEdit() {
  const { t, settings, updateSettings } = useApp();
  const { conn, me, active } = useSocial();
  const current = me.data?.profile;
  const [name, setName] = useState(current?.name ?? '');
  const [handle, setHandle] = useState(current?.handle ?? '');
  const [avatar, setAvatar] = useState(current?.avatar ?? 'c0-i0');
  const [leagues, setLeagues] = useState(current?.leagues ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (current) {
      setName(current.name);
      setHandle(current.handle);
      setAvatar(current.avatar);
      setLeagues(current.leagues);
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isKid(settings)) return <KidsNotice />;
  if (!active) return <JoinCommunity />;
  if (!current) return <main id="main"><LoadingRow /></main>;
  const [ci, ii] = (/^c(\d+)-i(\d+)$/.exec(avatar) ?? ['', '0', '0']).slice(1).map(Number);
  const canSave = name.trim().length > 0 && /^[a-z0-9_]{3,20}$/.test(handle) && !busy;

  const save = async () => {
    if (!conn) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await social.saveProfile(conn, { handle, name: name.trim(), avatar, leagues });
      updateSettings({ social: { userId: out.profile.id, handle: out.profile.handle }, communityName: name.trim() });
      me.reload();
      setMsg(t('social.setup.saved'));
    } catch (e) {
      setMsg(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="fade-in">
      <PageHeader back="profile" title={t('social.setup.title')} actions={<Avatar avatar={avatar} size={48} />} />
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (canSave) void save(); }}>
        <div className="field">
          <label htmlFor="sc-name">{t('social.setup.name')}</label>
          <input id="sc-name" className="input" maxLength={30} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sc-handle">{t('social.setup.handle')}</label>
          <div className="sc-handle"><span aria-hidden="true">@</span><input id="sc-handle" className="input" maxLength={20} autoCapitalize="none" autoComplete="username" spellCheck={false} value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} /></div>
          <span className="small faint">{t('social.setup.handleHint')}</span>
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 8 }}>{t('social.setup.avatar')}</legend>
          <div className="sc-swatches" role="radiogroup" aria-label={t('social.setup.avatarColor')}>
            {AVATAR_COLORS.map((c, i) => <button key={c} type="button" role="radio" aria-checked={i === ci} aria-label={`${t('social.setup.avatarColor')} ${i + 1}`} className="sc-swatch" style={{ background: c }} onClick={() => setAvatar(`c${i}-i${ii}`)} />)}
          </div>
          <div className="sc-glyphs" role="radiogroup" aria-label={t('social.setup.avatarIcon')}>
            {AVATAR_ICONS.map((g, i) => <button key={g} type="button" role="radio" aria-checked={i === ii} aria-label={g} onClick={() => setAvatar(`c${ci}-i${i}`)}><Avatar avatar={`c${ci}-i${i}`} size={40} /></button>)}
          </div>
        </fieldset>
        <div className="list">
          <Switch label={t('social.setup.leagues')} hint={t('social.setup.leaguesHint')} checked={leagues} onChange={setLeagues} />
        </div>
        {msg && <Note role="status">{msg}</Note>}
        <button className="btn primary lg" type="submit" disabled={!canSave}>{busy ? t('loading') : t('social.setup.save')}</button>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------- league

function LeagueView() {
  const { t, syncNonce } = useApp();
  const { conn, me } = useSocial();
  const [mode, setMode] = useState<'league' | 'friends'>('league');
  const league = useQuery<LeagueResponse>(conn ? `league:${conn.token}:${syncNonce}` : null, () => social.league(conn!));
  const friends = useQuery<FriendsResponse>(conn && mode === 'friends' ? `friends:${conn.token}:${syncNonce}` : null, () => social.friends(conn!));
  const d = league.data;
  const tier = (d?.tier ?? me.data?.profile.tier ?? 'spark') as Tier;
  const ti = TIERS.indexOf(tier);
  const left = daysLeft();
  const row = useRef<HTMLDivElement>(null);
  // On narrow screens the row scrolls: keep the current tier in view.
  useEffect(() => {
    const r = row.current;
    const el = r?.children[ti] as HTMLElement | undefined;
    if (!r || !el) return;
    const a = r.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    r.scrollLeft += b.left - a.left - a.width / 2 + b.width / 2;
  }, [ti]);
  return (
    <section aria-labelledby="league-h">
      <div className="tier-row" aria-hidden="true" ref={row}>
        {TIERS.map((x, i) => <TierBadge key={x} tier={x} size={i === ti ? 52 : 30} locked={i > ti} current={i === ti} />)}
      </div>
      <div className="league-head">
        <h2 id="league-h">{t('league.title', { tier: tierName(t, tier) })}</h2>
        <p className="small muted">{t('league.daysLeft', { n: left })}{d?.promote ? ` · ${t('league.promoteInfo', { n: d.promote })}` : ''}{d?.demote ? `, ${t('league.demoteInfo', { n: d.demote })}` : ''}</p>
      </div>
      {d?.outcome && d.outcome !== 'stayed' && <Note tone={d.outcome === 'promoted' ? 'ok' : 'warn'} icon="trophy" role="status" style={{ marginBottom: 14 }}>{t(d.outcome === 'promoted' ? 'league.promoted' : 'league.demoted', { tier: tierName(t, tier) })}</Note>}
      <div className="segmented" role="group" aria-label={t('social.tab.league')} style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={mode === 'league'} onClick={() => setMode('league')}>{t('league.mode.league')}</button>
        <button type="button" aria-pressed={mode === 'friends'} onClick={() => setMode('friends')}>{t('league.mode.friends')}</button>
      </div>
      {mode === 'league' ? (
        league.error ? <Note tone="bad" role="alert">{errorText(t, league.error)}</Note>
        : !d ? <LoadingRow />
        : d.optedOut ? <Empty icon="trophy">{t('league.optedOut')}</Empty>
        : !d.joined ? <Empty icon="trophy" action={<a className="btn primary" href={href('')}>{t('league.notJoinedCta')} <Icon name="arrow" size={17} className="arrow" /></a>}>{t('league.notJoined')}</Empty>
        : <Standings list={d.standings ?? []} />
      ) : friends.data ? <FriendsBoard data={friends.data} /> : friends.error ? <Note tone="bad" role="alert">{errorText(t, friends.error)}</Note> : <LoadingRow />}
    </section>
  );
}

function Standings({ list }: { list: NonNullable<LeagueResponse['standings']> }) {
  const { t } = useApp();
  const rows: React.ReactNode[] = [];
  list.forEach((s, i) => {
    const prev = list[i - 1];
    if (i > 0 && prev.zone === 'promote' && s.zone !== 'promote') rows.push(<li key="pz" className="zone-line up"><Icon name="arrow" size={14} /> {t('league.promoteZone')}</li>);
    if (s.zone === 'demote' && (!prev || prev.zone !== 'demote')) rows.push(<li key="dz" className="zone-line down">{t('league.demoteZone')}</li>);
    rows.push(
      <li key={s.user.id} className={`rank-row ${s.me ? 'me' : ''}`} data-zone={s.zone}>
        <span className={`rank ${s.rank <= 3 ? `top top${s.rank}` : ''}`}>{s.rank}</span>
        {s.hidden ? <span className="sc-avatar" style={{ width: 38, height: 38 }} /> : <a href={href(`u/${s.user.id}`)} aria-label={s.user.name}><Avatar avatar={s.user.avatar} size={38} /></a>}
        <span className="rr-name">{s.me ? t('league.you') : s.hidden ? t('league.hidden') : s.user.name}</span>
        <span className="rr-xp tnum">{s.xp} XP</span>
      </li>,
    );
  });
  return <ol className="rank-list">{rows}</ol>;
}

function FriendsBoard({ data }: { data: FriendsResponse }) {
  const { t } = useApp();
  if (!data.friends.length) return <Empty icon="users" action={<a className="btn primary" href={href('community/friends')}><Icon name="userPlus" size={17} /> {t('friends.add')}</a>}>{t('league.friendsEmpty')}</Empty>;
  const all = [{ ...data.me, me: true }, ...data.friends.map((f) => ({ ...f, me: false }))].sort((a, b) => b.xpWeek - a.xpWeek);
  return (
    <ol className="rank-list">
      {all.map((u, i) => (
        <li key={u.id} className={`rank-row ${u.me ? 'me' : ''}`}>
          <span className={`rank ${i < 3 ? `top top${i + 1}` : ''}`}>{i + 1}</span>
          <a href={href(`u/${u.id}`)} aria-label={u.name}><Avatar avatar={u.avatar} size={38} /></a>
          <span className="rr-name">{u.me ? t('league.you') : u.name}</span>
          <span className="rr-xp tnum">{u.xpWeek} XP</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- friends

function FriendsView() {
  const { t, syncNonce } = useApp();
  const { conn, me } = useSocial();
  const [nonce, setNonce] = useState(0);
  const q = useQuery<FriendsResponse>(conn ? `friends:${conn.token}:${syncNonce}:${nonce}` : null, () => social.friends(conn!));
  const [handle, setHandle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const reload = () => {
    setNonce((n) => n + 1);
    me.reload();
  };
  const run = async (f: () => Promise<string | null | void>) => {
    setMsg(null);
    try {
      const m = await f();
      if (m) setMsg(m);
      reload();
    } catch (e) {
      setMsg(errorText(t, e));
    }
  };
  const add = () => run(async () => {
    const r = await social.addFriend(conn!, { handle: handle.trim().replace(/^@/, '') });
    setHandle('');
    return t(r.status === 'friends' ? 'friends.nowFriends' : 'friends.requested', { name: r.user.name });
  });
  const myHandle = me.data?.profile.handle;
  const share = async () => {
    if (!myHandle) return;
    const url = inviteLink(myHandle);
    try {
      if (navigator.share) await navigator.share({ title: 'Lumen', text: t('friends.shareText'), url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg(t('friends.copied'));
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  const d = q.data;
  return (
    <>
      <section className="card stack" aria-labelledby="add-h">
        <h2 id="add-h" className="card-title">{t('friends.add')}</h2>
        <p className="small muted" style={{ margin: 0 }}>{t('friends.addHint')}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (handle.trim().length >= 3) void add(); }}>
          <input className="input" aria-label={t('social.setup.handle')} placeholder={t('friends.handlePlaceholder')} autoCapitalize="none" spellCheck={false} value={handle} onChange={(e) => setHandle(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn primary" type="submit" aria-label={t('friends.send')} disabled={handle.trim().replace(/^@/, '').length < 3}><Icon name="userPlus" size={16} /> <span className="hide-sm">{t('friends.send')}</span></button>
        </form>
        <button className="btn" onClick={share} disabled={!myHandle}><Icon name="share" size={16} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('friends.share')}{myHandle ? ` · @${myHandle}` : ''}</span></button>
        {msg && <Note role="status">{msg}</Note>}
      </section>

      {d && d.incoming.length > 0 && (
        <section aria-labelledby="in-h">
          <div className="section-head"><h2 id="in-h">{t('friends.incoming')}</h2><span className="count">{d.incoming.length}</span></div>
          <ul className="list">
            {d.incoming.map((u) => (
              <li key={u.id} className="list-row">
                <UserChip user={u} />
                <span className="row" style={{ gap: 6, flex: 'none' }}>
                  <button className="btn primary small" onClick={() => run(async () => { await social.accept(conn!, u.id); return t('friends.nowFriends', { name: u.name }); })}>{t('friends.accept')}</button>
                  <button className="btn quiet small" onClick={() => run(() => social.removeFriend(conn!, u.id).then(() => null))}>{t('friends.decline')}</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="fl-h">
        <div className="section-head"><h2 id="fl-h">{t('friends.list')}</h2>{d && <span className="count">{d.friends.length}</span>}</div>
        {q.error ? <Note tone="bad" role="alert">{errorText(t, q.error)}</Note> : !d ? <LoadingRow /> : d.friends.length === 0 ? <Empty icon="users">{t('friends.empty')}</Empty> : (
          <ul className="friend-list">{[...d.friends].sort((a, b) => b.friendStreak.current - a.friendStreak.current).map((f) => <FriendRow key={f.id} f={f} onNudge={(m) => setMsg(m)} />)}</ul>
        )}
      </section>

      {d && d.outgoing.length > 0 && (
        <section aria-labelledby="out-h">
          <div className="section-head"><h2 id="out-h">{t('friends.outgoing')}</h2></div>
          <ul className="list">
            {d.outgoing.map((u) => (
              <li key={u.id} className="list-row">
                <UserChip user={u} />
                <button className="btn quiet small" onClick={() => run(() => social.removeFriend(conn!, u.id).then(() => null))}>{t('friends.cancel')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function UserChip({ user, sub }: { user: PublicUser; sub?: string }) {
  return (
    <a className="user-chip" href={href(`u/${user.id}`)}>
      <Avatar avatar={user.avatar} size={38} />
      <span><strong>{user.name}</strong><span className="small faint">{sub ?? `@${user.handle}`}</span></span>
    </a>
  );
}

function FriendRow({ f, onNudge }: { f: Friend; onNudge(msg: string): void }) {
  const { t } = useApp();
  const { conn } = useSocial();
  const fs = f.friendStreak;
  const [nudged, setNudged] = useState(false);
  const status = fs.todayDone ? t('friends.bothDone') : fs.meToday ? t('friends.waitingFriend', { name: f.name }) : fs.friendToday ? t('friends.waitingMe') : t('friends.waitingBoth');
  const nudge = async () => {
    try {
      const r = await social.nudge(conn!, f.id);
      setNudged(true);
      onNudge(r.sent ? t('friends.nudged') : t('friends.nudgedAlready'));
    } catch (e) {
      onNudge(errorText(t, e));
    }
  };
  return (
    <li className="friend-row">
      <a href={href(`u/${f.id}`)} className="fr-main">
        <Avatar avatar={f.avatar} size={44} />
        <span className="fr-body">
          <strong>{f.name}</strong>
          <span className="small faint">{status}</span>
        </span>
      </a>
      <span className={`fs-flame ${fs.todayDone ? 'on' : ''}`} aria-label={`${t('friends.streak')}: ${fs.current}`} title={t('friends.streak')}>
        <Icon name="flame" size={18} /> {fs.current}
      </span>
      {!f.todayDone && (
        <button className="icon-btn" onClick={nudge} disabled={nudged} aria-label={`${t('friends.nudge')}: ${f.name}`} title={t('friends.nudge')}><Icon name="nudge" size={18} /></button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- feed

function FeedView() {
  const { t, syncNonce, settings } = useApp();
  const { conn, me } = useSocial();
  const [nonce, setNonce] = useState(0);
  const q = useQuery(conn ? `feed:${conn.token}:${syncNonce}:${nonce}` : null, () => social.feed(conn!));
  const [more, setMore] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  useEffect(() => {
    setMore([]);
    setNext(q.data?.next ?? null);
    if (q.data && q.data.notices.some((n) => !n.seen) && conn) void social.seen(conn).then(() => me.reload()).catch(() => {});
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = async () => {
    if (!next || !conn) return;
    const r = await social.feed(conn, next);
    setMore((m) => [...m, ...r.items]);
    setNext(r.next);
  };
  const items = [...(q.data?.items ?? []), ...more];
  const notices = (q.data?.notices ?? []).slice(0, 12);
  return (
    <>
      {notices.length > 0 && (
        <section aria-labelledby="nt-h">
          <div className="section-head" style={{ marginTop: 8 }}><h2 id="nt-h">{t('feed.notices')}</h2></div>
          <ul className="notice-list">{notices.map((n) => <NoticeRow key={n.id} n={n} />)}</ul>
        </section>
      )}
      <section aria-label={t('social.tab.feed')} style={{ marginTop: 16 }}>
        {q.error ? <Note tone="bad" role="alert">{errorText(t, q.error)}</Note> : !q.data ? <LoadingRow /> : items.length === 0 ? <Empty icon="sparkles">{t('feed.empty')}</Empty> : (
          <ul className="feed-list">{items.map((it) => <FeedCard key={it.id} item={it} locale={settings.locale} onChange={() => setNonce((x) => x + 1)} />)}</ul>
        )}
        {next && <button className="btn block" onClick={loadMore}>{t('feed.more')}</button>}
      </section>
    </>
  );
}

function NoticeRow({ n }: { n: Notice }) {
  const { t, settings } = useApp();
  const text = t(`notice.${n.kind}` as TKey, { name: n.from.name, emoji: reactionEmoji(n.data.reaction ?? '') });
  const target = n.kind === 'friend_request' ? 'community/friends' : n.kind === 'reaction' ? 'community/feed' : n.kind === 'nudge' ? '' : `u/${n.from.id}`;
  return (
    <li className={`notice ${n.seen ? '' : 'new'}`}>
      <a href={href(target)}>
        <Avatar avatar={n.from.avatar} size={34} />
        <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
        <span className="tiny faint">{relTime(n.createdAt, settings.locale)}</span>
      </a>
    </li>
  );
}

const FEED_ICONS: Record<string, string> = { joined: 'sparkles', streak: 'flame', level: 'star', league: 'trophy', friend_streak: 'users', course: 'book', badge: 'medal' };

function useFeedText() {
  const { t, lib, settings } = useApp();
  const de = settings.locale.startsWith('de');
  const myId = settings.social?.userId;
  return useMemo(() => (it: FeedItem): string | null => {
    // German needs a different verb form for "Du …" than for a friend's name.
    const k = (base: string) => `${base}${it.mine ? 'Me' : ''}` as TKey;
    switch (it.kind) {
      case 'joined': return t(k('feed.joined'));
      case 'streak': return t(k('feed.streak'), { n: it.data.n ?? 0 });
      case 'level': return t(k('feed.level'), { n: it.data.n ?? 0 });
      case 'league': return t(k('feed.league'), { tier: tierName(t, it.data.tier ?? 'spark') });
      case 'friend_streak':
        if (!it.data.with) return null;
        return it.data.with.id === myId ? t('feed.friendStreakWithMe', { n: it.data.n ?? 0 }) : t(k('feed.friendStreak'), { n: it.data.n ?? 0, with: it.data.with.name });
      case 'course': {
        const topic = lib?.catalog.topics.find((tp) => tp.id === it.data.ref);
        return topic ? t(k('feed.course'), { title: topic.title }) : null;
      }
      case 'badge': {
        const a = ACHIEVEMENTS.find((x) => x.id === it.data.ref);
        return a ? t(k('feed.badge'), { title: de ? a.title.de : a.title.en }) : null;
      }
      default: return null;
    }
  }, [t, lib, de, myId]);
}

function FeedCard({ item, locale, onChange }: { item: FeedItem; locale: string; onChange(): void }) {
  const { t } = useApp();
  const { conn } = useSocial();
  const text = useFeedText()(item);
  const [mine, setMine] = useState(item.myReaction);
  const [counts, setCounts] = useState(item.reactions);
  if (!text) return null;
  const toggle = async (id: string) => {
    if (!conn) return;
    const prev = mine;
    const c = { ...counts };
    if (prev) c[prev] = Math.max(0, (c[prev] ?? 1) - 1);
    const nextR = prev === id ? null : id;
    if (nextR) c[nextR] = (c[nextR] ?? 0) + 1;
    setMine(nextR);
    setCounts(c);
    try {
      if (nextR) await social.react(conn, item.id, nextR);
      else await social.unreact(conn, item.id);
    } catch {
      setMine(prev);
      setCounts(item.reactions);
      onChange();
    }
  };
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return (
    <li className="feed-card" data-kind={item.kind}>
      <div className="fc-head">
        <a href={href(`u/${item.user.id}`)} aria-label={item.user.name}><Avatar avatar={item.user.avatar} size={44} /></a>
        <p className="fc-text"><strong>{item.mine ? t('feed.you') : item.user.name}</strong> {text}</p>
        <span className="fc-ico"><Icon name={FEED_ICONS[item.kind] ?? 'sparkles'} size={18} /></span>
      </div>
      <div className="fc-foot">
        <span className="tiny faint">{relTime(item.createdAt, locale)}</span>
        {item.mine ? (
          total > 0 && <span className="small faint">{Object.entries(counts).filter(([, n]) => n > 0).map(([r, n]) => `${reactionEmoji(r)} ${n}`).join('  ')}{item.reactedBy.length ? ` · ${item.reactedBy.map((u) => u.name).join(', ')}` : ''}</span>
        ) : (
          <span className="reactions" role="group" aria-label={t('feed.react')}>
            {REACTIONS.map((r) => (
              <button key={r.id} type="button" aria-pressed={mine === r.id} aria-label={r.id} onClick={() => toggle(r.id)}>
                <span aria-hidden="true">{r.emoji}</span>{counts[r.id] ? <span className="tnum">{counts[r.id]}</span> : null}
              </button>
            ))}
          </span>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- user profile

export function UserScreen({ refId }: { refId: string }) {
  const { t, settings, syncNonce } = useApp();
  const { active, conn } = useSocial();
  const [nonce, setNonce] = useState(0);
  const q = useQuery(active && conn ? `user:${refId}:${syncNonce}:${nonce}` : null, () => social.user(conn!, refId));
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const confirm = useConfirm();
  if (isKid(settings)) return <KidsNotice />;
  if (!active) {
    return (
      <main id="main" className="fade-in">
        <Empty icon="users" action={<a className="btn primary" href={href('community')}>{t('social.join')} <Icon name="arrow" size={17} className="arrow" /></a>}>{t('user.setupFirst')}</Empty>
      </main>
    );
  }
  if (q.error) return <main id="main"><BackButton to="community/friends" className="solo" /><Note tone="bad" role="alert">{q.error.message === 'not_found' ? t('user.notFound') : errorText(t, q.error)}</Note></main>;
  if (!q.data) return <main id="main"><LoadingRow /></main>;
  const { user, relation, friendStreak: fs } = q.data;
  const stats = 'streak' in user ? (user as UserSummary) : null;
  const act = async (f: () => Promise<unknown>, done?: string) => {
    setMsg(null);
    try {
      await f();
      if (done) setMsg(done);
      setNonce((n) => n + 1);
    } catch (e) {
      setMsg(errorText(t, e));
    }
  };
  return (
    <main id="main" className="fade-in">
      <BackButton to="community/friends" className="solo" />
      <header className="user-head">
        <Avatar avatar={user.avatar} size={84} />
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{user.name}</h1>
          <p className="muted" style={{ margin: '2px 0 0' }}>@{user.handle}{stats ? ` · ${t('user.since', { date: new Date(`${stats.since}T12:00:00`).toLocaleDateString(settings.locale, { month: 'long', year: 'numeric' }) })}` : ''}</p>
        </div>
      </header>
      {relation === 'self' && <p className="small faint">{t('user.self')} <a href={href('community/edit')}>{t('settings.editProfile')}</a></p>}
      {stats ? (
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat-tile"><span className="si tone-streak"><Icon name="flame" size={17} /></span><strong>{stats.streak}</strong><span>{t('home.streak')}</span></div>
          <div className="stat-tile"><span className="si tone-accent"><Icon name="bolt" size={17} /></span><strong>{stats.xpTotal}</strong><span>{t('user.totalXp')}</span></div>
          <div className="stat-tile"><span className="si tone-ok"><Icon name="star" size={17} /></span><strong>{stats.level}</strong><span>{t('level.label', { n: '' }).trim()}</span></div>
          <div className="stat-tile"><TierBadge tier={stats.tier} size={30} /><strong style={{ fontSize: '1rem' }}>{tierName(t, stats.tier)}</strong><span>{t('user.league')}</span></div>
        </div>
      ) : <p className="small faint" style={{ marginTop: 14 }}>{t('user.private')}</p>}
      {fs && (
        <div className="card fs-card" style={{ marginTop: 14 }}>
          <span className={`fs-flame big ${fs.todayDone ? 'on' : ''}`}><Icon name="flame" size={26} /> {fs.current}</span>
          <div><strong>{t('friends.streak')}</strong><span className="small faint" style={{ display: 'block' }}>{fs.todayDone ? t('friends.bothDone') : fs.meToday ? t('friends.waitingFriend', { name: user.name }) : fs.friendToday ? t('friends.waitingMe') : t('friends.waitingBoth')}</span></div>
        </div>
      )}
      {relation !== 'self' && (
        <div className="stack" style={{ marginTop: 18 }}>
          {relation === 'none' && <button className="btn primary lg" onClick={() => act(() => social.addFriend(conn!, { userId: user.id }), t('friends.requested', { name: user.name }))}><Icon name="userPlus" size={18} /> {t('user.addFriend')}</button>}
          {relation === 'requested' && <button className="btn lg" onClick={() => act(() => social.removeFriend(conn!, user.id))}>{t('user.pending')} · {t('friends.cancel')}</button>}
          {relation === 'incoming' && <button className="btn primary lg" onClick={() => act(() => social.accept(conn!, user.id), t('friends.nowFriends', { name: user.name }))}>{t('friends.accept')}</button>}
          {relation === 'friend' && fs && !fs.friendToday && <button className="btn" onClick={() => act(async () => { const r = await social.nudge(conn!, user.id); setMsg(r.sent ? t('friends.nudged') : t('friends.nudgedAlready')); })}><Icon name="nudge" size={16} /> {t('friends.nudge')}</button>}
          <div className="row wrap" style={{ gap: 8 }}>
            {relation === 'friend' && <button className="btn quiet small" onClick={async () => { if (await confirm({ title: t('friends.remove'), body: t('friends.removeConfirm', { name: user.name }), confirm: t('friends.remove'), danger: true })) void act(() => social.removeFriend(conn!, user.id)); }}>{t('friends.remove')}</button>}
            <button className="btn quiet small" onClick={() => setReport(true)}><Icon name="flag" size={14} /> {t('user.report')}</button>
            <button className="btn quiet small danger" onClick={async () => { if (await confirm({ title: t('user.block'), body: t('user.blockConfirm', { name: user.name }), confirm: t('user.block'), danger: true })) void act(async () => { await social.block(conn!, user.id); navigate('community/friends', true); }); }}><Icon name="ban" size={14} /> {t('user.block')}</button>
          </div>
        </div>
      )}
      {msg && <Note role="status" style={{ marginTop: 14 }}>{msg}</Note>}
      {report && <ReportSheet user={user} onClose={() => setReport(false)} onDone={(m, blocked) => { setReport(false); setMsg(m); if (blocked) navigate('community/friends', true); }} />}
    </main>
  );
}

function ReportSheet({ user, onClose, onDone }: { user: PublicUser; onClose(): void; onDone(msg: string, blocked: boolean): void }) {
  const { t } = useApp();
  const { conn } = useSocial();
  const [reason, setReason] = useState<string>('name');
  const [block, setBlock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    try {
      await social.report(conn!, user.id, reason, { block });
      onDone(t('report.thanks'), block);
    } catch (e) {
      setErr(errorText(t, e));
    }
  };
  return (
    <Sheet label={t('user.reportTitle', { name: user.name })} onClose={onClose}>
      <div className="stack" style={{ gap: 6 }} role="radiogroup" aria-label={t('user.report')}>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="check-row"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {t(`report.${r}` as TKey)}</label>
        ))}
        <label className="check-row small"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} /> {t('report.alsoBlock')}</label>
        {err && <Note tone="bad" role="alert">{err}</Note>}
        <button className="btn primary lg" onClick={send}>{t('report.send')}</button>
      </div>
    </Sheet>
  );
}
