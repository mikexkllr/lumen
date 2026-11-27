import { useEffect, useRef, useState } from 'react';
import { addDays, type LumenEvent } from '@lumen/engine';
import { Icon, Note, Segmented, Switch, useConfirm } from '../components/ui.tsx';
import { href, navigate } from '../lib/router.ts';
import { isKid, type Account } from '../lib/settings.ts';
import { useApp } from '../lib/store.tsx';
import { TIER_COLORS, useGamification } from '../lib/gamify.ts';
import { API_BASE } from '../lib/api.ts';
import { BYOK_PROVIDERS, isValidByok, providerLabel, testByok } from '../lib/byok.ts';
import { tutorStatus, type TutorStatusInfo } from '../lib/tutor.ts';
import { isNativeApp, requestReminderPermission } from '../lib/reminders.ts';
import { social, type PublicUser } from '../lib/social.ts';
import { useSocial } from '../lib/socialContext.tsx';
import { Avatar, errorText } from '../components/social.tsx';
import { SignInOptions } from '../components/SignIn.tsx';
import { PROVIDERS, type Linked } from '../lib/signIn.ts';
import type { TKey } from '../lib/i18n.ts';

const WEEKS = 18;

function Heatmap() {
  const { progress, today, settings, t } = useApp();
  // Grid ends with the current week; columns = weeks, rows = Mon..Sun.
  const d = new Date(`${today}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  const start = addDays(today, -dow - (WEEKS - 1) * 7);
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));
  const level = (day: string) => {
    const xp = progress.days[day]?.xp ?? 0;
    return xp === 0 ? 0 : xp < 10 ? 1 : xp < 25 ? 2 : xp < 50 ? 3 : 4;
  };
  const activeDays = cells.filter((c) => level(c) > 0).length;
  return (
    <>
      <div className="heatmap" role="img" aria-label={t('profile.activeDays', { n: activeDays, weeks: WEEKS })}>
        {cells.map((c) => <span key={c} data-l={level(c)} className={c > today ? 'future' : undefined} title={`${new Date(`${c}T12:00:00`).toLocaleDateString(settings.locale)} · ${progress.days[c]?.xp ?? 0} XP`} />)}
      </div>
      <div className="heat-legend">
        <span>{t('profile.activeDays', { n: activeDays, weeks: WEEKS })}</span>
        <span className="row" style={{ gap: 3 }} aria-hidden="true">{[0, 1, 2, 3, 4].map((l) => <i key={l} className="hm-sq" data-l={l} />)}</span>
      </div>
    </>
  );
}

export function Profile() {
  const app = useApp();
  const { t, progress, settings, updateSettings } = app;
  const { me } = useSocial();
  const who = isKid(settings) ? undefined : me.data?.profile;
  const acc = progress.firstTryAccuracy;
  const stats = [
    { icon: 'flame', v: progress.streak.current, l: t('home.streak'), tone: 'streak', to: 'streak' },
    { icon: 'bolt', v: progress.xpTotal, l: t('profile.xpTotal'), tone: 'accent' },
    { icon: 'done', v: progress.completedConcepts.size, l: t('profile.concepts'), tone: 'ok' },
    { icon: 'target', v: acc === null ? '–' : `${Math.round(acc * 100)}%`, l: t('profile.accuracy'), tone: 'info' },
  ];
  return (
    <main id="main" className="fade-in">
      <header className="profile-head">
        {who ? <Avatar avatar={who.avatar} size={60} /> : <span className="avatar" aria-hidden="true"><Icon name="profile" size={26} /></span>}
        <div className="ph-body">
          <h1 className="page-title">{t('profile.title')}</h1>
          <p className="muted small">{who ? `@${who.handle}` : t('profile.local')}</p>
        </div>
      </header>
      <LevelCard />

      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className="sr-only">{t('profile.stats')}</h2>
        <div className="stat-grid">
          {stats.map((s) => {
            const body = <><span className={`si tone-${s.tone}`}><Icon name={s.icon} size={17} /></span><strong>{s.v}</strong><span>{s.l}</span></>;
            return s.to ? <a className="stat-tile" key={s.l} href={href(s.to)}>{body}</a> : <div className="stat-tile" key={s.l}>{body}</div>;
          })}
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h3>{t('profile.activity')}</h3>
            <span className="small faint">{t('profile.longest')}: {progress.streak.longest}</span>
          </div>
          <Heatmap />
          <p className="small faint row" style={{ margin: '12px 0 0', gap: 8, alignItems: 'flex-start' }}><Icon name="snow" size={15} /> <span>{t('profile.freezes', { n: progress.streak.freezesLeftThisWeek })}</span></p>
        </div>
      </section>

      <Badges />

      <section className="settings-group" aria-labelledby="set-h">
        <h2 id="set-h">{t('settings.title')}</h2>
        <div className="list">
          <div className="list-row"><span className="lbl">{t('settings.theme')}</span><Segmented label={t('settings.theme')} value={settings.theme} options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))} onChange={(v) => updateSettings({ theme: v })} /></div>
          <div className="list-row"><span className="lbl">{t('settings.language')}</span><Segmented label={t('settings.language')} value={settings.locale} options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} onChange={(v) => updateSettings({ locale: v })} /></div>
          <div className="list-row"><span className="lbl">{t('settings.dailyGoal')}</span><Segmented label={t('settings.dailyGoal')} value={settings.dailyGoal} options={[5, 10, 15, 20].map((m) => ({ value: m, label: `${m}′` }))} onChange={(v) => updateSettings({ dailyGoal: v })} /></div>
          <div className="list-row" style={{ flexWrap: 'wrap' }}><span className="lbl">{t('settings.depth')}</span><Segmented label={t('settings.depth')} value={settings.depth} options={([1, 2, 3] as const).map((d) => ({ value: d, label: t(`depth.name${d}`) }))} onChange={(v) => updateSettings({ depth: v })} /><span className="small faint" style={{ flexBasis: '100%' }}>{t('settings.depthNote')}</span></div>
          <div className="list-row"><span className="lbl">{t('settings.fontSize')}</span><Segmented label={t('settings.fontSize')} value={settings.fontScale} options={[{ value: 0.9, label: 'S' }, { value: 1, label: 'M' }, { value: 1.15, label: 'L' }, { value: 1.3, label: 'XL' }]} onChange={(v) => updateSettings({ fontScale: v })} /></div>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          <Switch label={t('settings.sound')} checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
          <Switch label={t('settings.haptics')} checked={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} />
          {!isKid(settings) && <Switch label={t('settings.tutor')} hint={`${t('settings.tutorHint')}${settings.tutor !== false && !settings.tutorConsent ? ` ${t('tutor.consentOff')}` : ''}`} checked={settings.tutor !== false} onChange={(v) => updateSettings(v ? { tutor: true } : { tutor: false, tutorConsent: false })} />}
          <Switch label={t('settings.motion')} checked={settings.reduceMotion === 'reduce'} onChange={(v) => updateSettings({ reduceMotion: v ? 'reduce' : 'system' })} />
          <Switch label={t('settings.contrast')} checked={settings.highContrast} onChange={(v) => updateSettings({ highContrast: v })} />
          <Switch label={t('settings.font')} checked={settings.hyperlegible} onChange={(v) => updateSettings({ hyperlegible: v })} />
          <ReminderRow />
        </div>
      </section>

      {!isKid(settings) && <LuxModelSection />}
      {!isKid(settings) && <CommunitySection />}
      <AccountSection />
      <DataSection />

      <section className="settings-group">
        <h2>{t('settings.about')}</h2>
        <div className="list">
          <div className="list-pad small muted">{t('settings.aboutText')}</div>
          <a className="list-row" href={href('preview')}><span className="lbl">{t('settings.author')}</span><Icon name="chevron" size={17} className="faint" /></a>
          <a className="list-row" href={href('legal/privacy')}><span className="lbl">{t('legal.privacy')}</span><Icon name="chevron" size={17} className="faint" /></a>
          <a className="list-row" href={href('legal/terms')}><span className="lbl">{t('legal.terms')}</span><Icon name="chevron" size={17} className="faint" /></a>
          <a className="list-row" href={href('legal/imprint')}><span className="lbl">{t('legal.imprint')}</span><Icon name="chevron" size={17} className="faint" /></a>
        </div>
      </section>
    </main>
  );
}

function LuxModelSection() {
  const { t, settings, updateSettings } = useApp();
  const b = settings.tutorByok;
  const [info, setInfo] = useState<TutorStatusInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<'server' | 'own'>(b ? 'own' : 'server');
  const [provider, setProvider] = useState<string>(b ? (BYOK_PROVIDERS.find((p) => p.url && p.url === b.url)?.id ?? 'custom') : 'openrouter');
  const [url, setUrl] = useState(b?.url ?? '');
  const [model, setModel] = useState(b?.model ?? '');
  const [key, setKey] = useState(b?.key ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void tutorStatus().then(setInfo);
  }, [settings.serverUrl]);
  const cfg = { url: provider === 'custom' ? url.trim() : BYOK_PROVIDERS.find((p) => p.id === provider)!.url, model: model.trim(), key: key.trim() };
  const save = async () => {
    setMsg(null);
    if (!isValidByok(cfg)) return setMsg(t('byok.invalid'));
    setBusy(true);
    const status = await testByok(cfg);
    setBusy(false);
    if (status === null) {
      updateSettings({ tutorByok: cfg, tutorConsent: true });
      setMsg(t('byok.saved', { model: cfg.model }));
    } else setMsg(status === 0 ? t('byok.failedNet') : status === 401 || status === 403 ? t('byok.failedKey', { status }) : status === 404 || status === 400 ? t('byok.failedModel', { status }) : t('byok.failed', { status }));
  };
  const remove = () => {
    updateSettings({ tutorByok: null });
    setKey('');
    setMsg(t('byok.removed'));
  };
  return (
    <section className="settings-group" aria-labelledby="byok-h">
      <h2 id="byok-h">{t('byok.title')}</h2>
      <div className="list">
        <div className="list-row">
          <Segmented label={t('byok.title')} value={mode} options={[{ value: 'server', label: t('byok.server') }, { value: 'own', label: t('byok.own') }]} onChange={(v) => { setMode(v); if (v === 'server' && b) remove(); }} />
        </div>
        {settings.tutor === false && <div className="list-pad small faint">{t('byok.tutorOff')}</div>}
        {mode === 'server' ? (
          <div className="list-pad small muted">{info === undefined ? t('loading') : info?.model ? t('byok.serverModel', { model: info.model }) : t('byok.serverNone')}</div>
        ) : (
          <div className="list-pad stack">
            <span className="small muted">{t('byok.intro')}</span>
            <Segmented label={t('byok.provider')} value={provider} options={BYOK_PROVIDERS.map((p) => ({ value: p.id as string, label: p.label || t('byok.other') }))} onChange={(v) => setProvider(String(v))} />
            {provider === 'custom' && (
              <div className="field"><label htmlFor="byok-url">{t('byok.url')}</label><input id="byok-url" className="input" type="url" autoCapitalize="none" spellCheck={false} placeholder="https://…/v1" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            )}
            <div className="field"><label htmlFor="byok-model">{t('byok.model')}</label><input id="byok-model" className="input" autoCapitalize="none" spellCheck={false} value={model} onChange={(e) => setModel(e.target.value)} /><span className="small faint">{t('byok.modelHint')}</span></div>
            <div className="field"><label htmlFor="byok-key">{t('byok.key')}</label><input id="byok-key" className="input" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} /></div>
            <p className="small faint" style={{ margin: 0 }}>{t('byok.note', { provider: cfg.url ? providerLabel(cfg.url) : t('byok.provider') })}</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary small" disabled={busy} onClick={() => void save()}>{busy ? t('loading') : t('byok.save')}</button>
              {b && <button className="btn small" onClick={remove}>{t('byok.remove')}</button>}
            </div>
          </div>
        )}
        {msg && <div className="list-pad"><Note role="status">{msg}</Note></div>}
      </div>
    </section>
  );
}

function ReminderRow() {
  const { t, settings, updateSettings } = useApp();
  const [denied, setDenied] = useState(false);
  const native = isNativeApp();
  const set = async (value: string) => {
    updateSettings({ reminder: value || null });
    setDenied(value ? native && !(await requestReminderPermission()) : false);
  };
  const note = !native ? t('reminder.webOnly') : denied ? t('reminder.denied') : settings.reminder ? t('reminder.on', { time: settings.reminder }) : t('settings.reminderNote');
  return (
    <label className="switch-row">
      <span><span className="lbl" style={{ fontWeight: 550 }}>{t('settings.reminder')}</span><span className="small faint" style={{ display: 'block' }} role={denied ? 'alert' : undefined}>{note}</span></span>
      <span className="row" style={{ gap: 4 }}>
        <input className="input" type="time" value={settings.reminder ?? ''} onChange={(e) => void set(e.target.value)} style={{ width: 120 }} disabled={!native && !settings.reminder} />
        {settings.reminder && <button type="button" className="icon-btn" aria-label={t('onb.reminder.none')} onClick={() => void set('')}><Icon name="close" size={16} /></button>}
      </span>
    </label>
  );
}

function CommunitySection() {
  const { t, updateSettings } = useApp();
  const confirm = useConfirm();
  const { active, conn, me } = useSocial();
  const [blocked, setBlocked] = useState<PublicUser[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const p = me.data?.profile;
  const setLeagues = async (leagues: boolean) => {
    if (!conn || !p) return;
    try {
      await social.saveProfile(conn, { handle: p.handle, name: p.name, avatar: p.avatar, leagues });
      me.reload();
    } catch (e) {
      setMsg(errorText(t, e));
    }
  };
  return (
    <section className="settings-group" aria-labelledby="com-h">
      <h2 id="com-h">{t('settings.community')}</h2>
      <div className="list">
        {!active ? (
          <div className="list-pad stack">
            <span className="small muted">{t('settings.communityOff')}</span>
            <a className="btn primary" href={href('community')}>{t('social.join')} <Icon name="arrow" size={17} className="arrow" /></a>
          </div>
        ) : (
          <>
            {p && (
              <a className="list-row" href={href(`u/${p.id}`)}>
                <span className="row" style={{ gap: 12 }}><Avatar avatar={p.avatar} size={36} /><span><strong>{p.name}</strong><span className="small faint" style={{ display: 'block' }}>@{p.handle}</span></span></span>
                <Icon name="chevron" size={17} className="faint" />
              </a>
            )}
            <a className="list-row" href={href('community/edit')}><span className="lbl">{t('settings.editProfile')}</span><Icon name="chevron" size={17} className="faint" /></a>
            {p && <Switch label={t('social.setup.leagues')} hint={t('social.setup.leaguesHint')} checked={p.leagues} onChange={setLeagues} />}
            <button className="list-row" onClick={async () => { try { setBlocked((await social.blocks(conn!)).blocked); } catch (e) { setMsg(errorText(t, e)); } }}>
              <span className="lbl">{t('settings.blocked')}</span><Icon name="ban" size={17} />
            </button>
            {blocked && blocked.map((u) => (
              <div key={u.id} className="list-row">
                <span className="row" style={{ gap: 10 }}><Avatar avatar={u.avatar} size={30} /> {u.name} <span className="small faint">@{u.handle}</span></span>
                <button className="btn small" onClick={async () => { await social.unblock(conn!, u.id); setBlocked(blocked.filter((x) => x.id !== u.id)); }}>{t('settings.unblock')}</button>
              </div>
            ))}
            <button className="list-row danger" onClick={async () => {
              if (!conn || !(await confirm({ title: t('settings.deleteSocial'), body: t('settings.deleteSocialConfirm'), confirm: t('settings.deleteSocial'), danger: true }))) return;
              try { await social.deleteProfile(conn); updateSettings({ social: null, communityName: null }); setMsg(t('settings.deleted')); } catch (e) { setMsg(errorText(t, e)); }
            }}>
              <span className="lbl">{t('settings.deleteSocial')}</span><Icon name="trash" size={17} />
            </button>
          </>
        )}
        {msg && <div className="list-pad"><Note role="status">{msg}</Note></div>}
      </div>
    </section>
  );
}

const VIA = { apple: 'account.viaApple', google: 'account.viaGoogle', email: 'account.viaEmail' } as const;

/** "Signed in with Apple", "… with Google and email": what is linked, else how this device signed in. */
export function signedInVia(linked: Linked | null, method: Account['method'], t: (k: TKey, v?: Record<string, string>) => string): string | null {
  const list = linked ? PROVIDERS.filter((p) => linked[p]) : [];
  if (list.length > 1) {
    const names = list.map((p) => t(`account.name.${p}` as TKey));
    return t('account.viaMany', { list: `${names.slice(0, -1).join(', ')} ${t('account.and')} ${names[names.length - 1]}` });
  }
  const one = list[0] ?? (method === 'code' ? null : method);
  return one ? t(VIA[one]) : null;
}

function AccountSection() {
  const { t, settings, signOut, deleteAccount } = useApp();
  const confirm = useConfirm();
  const acc = settings.account;
  const [linked, setLinked] = useState<Linked | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!acc) return null;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
      navigate('welcome', true);
    } catch (e) {
      setMsg((e as Error).message === 'sync_failed' ? t('account.signOutOffline') : t('account.failed'));
    } finally {
      setBusy(false);
    }
  };
  const via = signedInVia(linked, acc.method, t);
  const custom = acc.serverUrl !== API_BASE;
  return (
    <section className="settings-group" aria-labelledby="acc-h">
      <h2 id="acc-h">{t('account.title')}</h2>
      <div className="list">
        <div className="list-row">
          <span className="row" style={{ gap: 10 }}><Icon name="done" size={18} /> <span className="lbl">{via ?? t('account.signedIn')}</span></span>
          {custom && <span className="small faint" style={{ wordBreak: 'break-all', textAlign: 'right' }}>{acc.serverUrl}</span>}
        </div>
        <div className="list-pad stack" style={{ gap: 8 }}>
          <span className="small faint">{linked && !PROVIDERS.some((p) => linked[p]) ? t('account.linkFirst') : t('signin.linkedTitle')}</span>
          <SignInOptions serverUrl={acc.serverUrl} token={acc.token} onLinked={setLinked} />
        </div>
        <button className="list-row" disabled={busy} onClick={async () => { if (await confirm({ title: t('account.signOut'), body: t('account.signOutConfirm'), confirm: t('account.signOut') })) void run(signOut); }}>
          <span className="lbl">{t('account.signOut')}</span><Icon name="logout" size={17} />
        </button>
        <button className="list-row danger" disabled={busy} onClick={async () => { if (await confirm({ title: t('account.delete'), body: t('account.deleteConfirm'), confirm: t('account.delete'), danger: true })) void run(deleteAccount); }}>
          <span className="lbl">{t('account.delete')}</span><Icon name="trash" size={17} />
        </button>
        {msg && <div className="list-pad"><Note tone="bad" role="alert">{msg}</Note></div>}
      </div>
    </section>
  );
}

function DataSection() {
  const { t, events, replaceAllEvents } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ format: 'lumen-events', version: 1, exportedAt: new Date().toISOString(), events: events.map(({ synced: _s, ...e }) => e) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lumen-daten-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as { events?: LumenEvent[] };
      const evts = (data.events ?? []).filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string' && typeof e.ts === 'number');
      await replaceAllEvents(evts.map((e) => ({ ...e, synced: 0 as const })));
      setMsg(t('settings.imported', { n: evts.length }));
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };
  return (
    <section className="settings-group" aria-labelledby="data-h">
      <h2 id="data-h">{t('settings.data')}</h2>
      <div className="list">
        <button className="list-row" onClick={exportData}><span className="lbl">{t('settings.export')}</span><Icon name="download" size={17} /></button>
        <button className="list-row" onClick={() => file.current?.click()}><span className="lbl">{t('settings.import')}</span><Icon name="upload" size={17} /></button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importData(f); }} />
        {msg && <div className="list-pad"><Note role="status">{msg}</Note></div>}
      </div>
    </section>
  );
}

function LevelCard() {
  const { t } = useApp();
  const { level } = useGamification();
  return (
    <section className="level-card big" aria-label={t('level.label', { n: level.level })}>
      <div className="lv-row">
        <span className="lv-badge"><span>{level.level}</span></span>
        <span style={{ flex: 1 }}>
          <strong>{t('level.label', { n: level.level })}</strong>
          <span className="small faint" style={{ display: 'block' }}>{t('level.toNext', { xp: level.span - level.inLevel, n: level.level + 1 })}</span>
        </span>
      </div>
      <div className="lv-bar" aria-hidden="true"><div style={{ width: `${level.progress * 100}%` }} /></div>
    </section>
  );
}

/** Badges, earned ones first; the long tail stays folded until asked for. */
function Badges() {
  const { t, settings } = useApp();
  const { achievements } = useGamification();
  const [all, setAll] = useState(false);
  const de = settings.locale.startsWith('de');
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const sorted = [...achievements].sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.value / b.def.target - a.value / a.def.target);
  return (
    <section aria-labelledby="badges-h">
      <div className="sub-head"><h2 id="badges-h">{t('badges.title')} · {unlocked}/{achievements.length}</h2></div>
      <div className={`badge-grid ${all ? '' : 'collapsed'}`} id="badge-grid">
        {sorted.map((a) => (
          <div key={a.def.id} className={`badge-tile ${a.unlocked ? 'on' : ''}`} title={de ? a.def.desc.de : a.def.desc.en}>
            <span className="medal" style={{ ['--tier' as string]: TIER_COLORS[a.def.tier] }}><Icon name={a.def.icon} size={20} strokeWidth={2.2} /></span>
            <strong>{de ? a.def.title.de : a.def.title.en}</strong>
            {a.unlocked ? <span className="tiny faint">{de ? a.def.desc.de : a.def.desc.en}</span> : (
              <span className="badge-progress" aria-label={`${a.value}/${a.def.target}`}><i style={{ width: `${(100 * a.value) / a.def.target}%` }} /></span>
            )}
          </div>
        ))}
      </div>
      {achievements.length > 6 && (
        <button type="button" className="btn small more-row" aria-expanded={all} aria-controls="badge-grid" onClick={() => setAll(!all)}>
          {all ? t('badges.less') : t('badges.all', { n: achievements.length })} <Icon name="down" size={15} />
        </button>
      )}
    </section>
  );
}
