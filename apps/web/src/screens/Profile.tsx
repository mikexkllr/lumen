import { useRef, useState } from 'react';
import { addDays, type LumenEvent } from '@lumen/engine';
import { Icon, Segmented, Switch } from '../components/ui.tsx';
import { href } from '../lib/router.ts';
import { isKid } from '../lib/settings.ts';
import { useApp } from '../lib/store.tsx';
import { deleteServerData, generateSyncCode, normalizeCode, syncNow } from '../lib/sync.ts';
import { TIER_COLORS, useGamification } from '../lib/gamify.ts';

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
  const acc = progress.firstTryAccuracy;
  const stats = [
    { icon: 'flame', v: progress.streak.current, l: t('home.streak'), c: '#f97316' },
    { icon: 'bolt', v: progress.xpTotal, l: t('profile.xpTotal'), c: 'var(--accent)' },
    { icon: 'done', v: progress.completedConcepts.size, l: t('profile.concepts'), c: 'var(--ok)' },
    { icon: 'target', v: acc === null ? '–' : `${Math.round(acc * 100)}%`, l: t('profile.accuracy'), c: '#0ea5e9' },
  ];
  return (
    <main id="main" className="fade-in">
      <header className="page-head row" style={{ gap: 16 }}>
        <span className="avatar" aria-hidden="true"><Icon name="profile" size={26} /></span>
        <div>
          <h1 className="display" style={{ fontSize: '1.875rem' }}>{t('profile.title')}</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{t('profile.local')}</p>
        </div>
      </header>
      <LevelAndBadges />

      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className="sr-only">{t('profile.stats')}</h2>
        <div className="stat-grid">
          {stats.map((s) => (
            <div className="stat-tile" key={s.l}>
              <span className="si" style={{ background: `color-mix(in srgb, ${s.c} 14%, transparent)`, color: s.c }}><Icon name={s.icon} size={17} /></span>
              <strong>{s.v}</strong>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h3>{t('profile.activity')}</h3>
            <span className="small faint">{t('profile.longest')}: {progress.streak.longest}</span>
          </div>
          <Heatmap />
          <p className="small faint" style={{ margin: '12px 0 0' }}><Icon name="snow" size={14} /> {t('profile.freezes', { n: progress.streak.freezesLeftThisWeek })}</p>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-h">
        <h2 id="set-h">{t('settings.title')}</h2>
        <div className="list">
          <div className="list-row"><span className="lbl">{t('settings.theme')}</span><Segmented label={t('settings.theme')} value={settings.theme} options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))} onChange={(v) => updateSettings({ theme: v })} /></div>
          <div className="list-row"><span className="lbl">{t('settings.language')}</span><Segmented label={t('settings.language')} value={settings.locale} options={[{ value: 'de', label: 'DE' }, { value: 'en', label: 'EN' }]} onChange={(v) => updateSettings({ locale: v })} /></div>
          <div className="list-row"><span className="lbl">{t('settings.dailyGoal')}</span><Segmented label={t('settings.dailyGoal')} value={settings.dailyGoal} options={[5, 10, 15, 20].map((m) => ({ value: m, label: `${m}′` }))} onChange={(v) => updateSettings({ dailyGoal: v })} /></div>
          <div className="list-row"><span className="lbl">{t('settings.fontSize')}</span><Segmented label={t('settings.fontSize')} value={settings.fontScale} options={[{ value: 0.9, label: 'S' }, { value: 1, label: 'M' }, { value: 1.15, label: 'L' }, { value: 1.3, label: 'XL' }]} onChange={(v) => updateSettings({ fontScale: v })} /></div>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          <Switch label={t('settings.sound')} checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
          <Switch label={t('settings.haptics')} checked={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} />
          {!isKid(settings) && <Switch label={t('settings.tutor')} hint={t('settings.tutorHint')} checked={settings.tutor !== false} onChange={(v) => updateSettings({ tutor: v })} />}
          <Switch label={t('settings.motion')} checked={settings.reduceMotion === 'reduce'} onChange={(v) => updateSettings({ reduceMotion: v ? 'reduce' : 'system' })} />
          <Switch label={t('settings.contrast')} checked={settings.highContrast} onChange={(v) => updateSettings({ highContrast: v })} />
          <Switch label={t('settings.font')} checked={settings.hyperlegible} onChange={(v) => updateSettings({ hyperlegible: v })} />
          <label className="switch-row">
            <span><span className="lbl" style={{ fontWeight: 550 }}>{t('settings.reminder')}</span><span className="small faint" style={{ display: 'block' }}>{t('settings.reminderNote')}</span></span>
            <input className="input" type="time" value={settings.reminder ?? ''} onChange={(e) => updateSettings({ reminder: e.target.value || null })} style={{ width: 120 }} />
          </label>
        </div>
      </section>

      <SyncSection />
      <DataSection />

      <section className="settings-group">
        <h2>{t('settings.about')}</h2>
        <div className="list">
          <div className="list-pad small muted">{t('settings.aboutText')}</div>
          <a className="list-row" href={href('preview')}><span className="lbl">{t('settings.author')}</span><Icon name="chevron" size={17} className="faint" /></a>
        </div>
      </section>
    </main>
  );
}

function SyncSection() {
  const { t, settings, updateSettings, reloadEvents } = useApp();
  const [code, setCode] = useState('');
  const [server, setServer] = useState(settings.sync?.serverUrl ?? import.meta.env.VITE_LUMEN_SYNC_URL ?? 'http://localhost:8787');
  const [msg, setMsg] = useState<string | null>(null);
  const [consent, setConsent] = useState(settings.sync?.consent ?? false);
  const kid = isKid(settings) || settings.age === null;
  const s = settings.sync;

  const connect = (token: string) => {
    if (kid && !consent) return;
    updateSettings({ sync: { serverUrl: server, token: normalizeCode(token), lastSync: null, cursor: 0, consent } });
  };
  const run = async () => {
    if (!s) return;
    setMsg(t('loading'));
    try {
      const r = await syncNow(s.serverUrl, s.token, s.cursor);
      updateSettings({ sync: { ...s, lastSync: Date.now(), cursor: r.cursor } });
      await reloadEvents();
      setMsg(t('sync.ok', { up: r.sent, down: r.received }));
    } catch (e) {
      setMsg(t('sync.error', { msg: (e as Error).message }));
    }
  };
  return (
    <section className="settings-group" aria-labelledby="sync-h">
      <h2 id="sync-h">{t('sync.title')}</h2>
      <div className="list">
        <div className="list-pad small muted">{t('sync.intro')}</div>
        {!s ? (
          <div className="list-pad stack">
            <div className="field">
              <label htmlFor="sync-server">{t('sync.server')}</label>
              <input id="sync-server" type="url" value={server} onChange={(e) => setServer(e.target.value)} />
            </div>
            {kid && <label className="row small"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('sync.consentAge')}</label>}
            <button className="btn primary" disabled={kid && !consent} onClick={() => connect(generateSyncCode())}>{t('sync.create')}</button>
            <div className="field">
              <label htmlFor="sync-code">{t('sync.join')}</label>
              <div className="row">
                <input id="sync-code" className="input" type="text" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH-…" style={{ flex: 1, minWidth: 0 }} />
                <button className="btn ghost" disabled={normalizeCode(code).length !== 24 || (kid && !consent)} onClick={() => connect(code)}>{t('sync.connect')}</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="list-pad stack">
            <div>
              <span className="small faint">{t('sync.code')}</span>
              <div className="code-box" style={{ marginTop: 6 }}>{s.token}</div>
              <p className="small faint" style={{ marginTop: 6 }}>{t('sync.codeNote')}</p>
            </div>
            <p className="small" style={{ margin: 0 }}>{s.lastSync ? t('sync.last', { when: new Date(s.lastSync).toLocaleString(settings.locale) }) : t('sync.never')} · {s.serverUrl}</p>
            <button className="btn primary" onClick={run}><Icon name="sync" size={16} /> {t('sync.now')}</button>
            <div className="row wrap">
              <button className="btn ghost small" onClick={() => updateSettings({ sync: null })}>{t('sync.disconnect')}</button>
              <button className="btn ghost small" onClick={async () => { if (confirm(t('sync.deleteServerConfirm'))) { try { await deleteServerData(s.serverUrl, s.token); setMsg(t('settings.deleted')); } catch (e) { setMsg(t('sync.error', { msg: (e as Error).message })); } } }}>{t('sync.deleteServer')}</button>
            </div>
          </div>
        )}
        {msg && <p className="list-pad small" role="status" style={{ margin: 0 }}>{msg}</p>}
      </div>
    </section>
  );
}

function DataSection() {
  const { t, events, resetAll, replaceAllEvents } = useApp();
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
        <button className="list-row btn quiet" style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, height: 'auto' }} onClick={exportData}><span className="lbl">{t('settings.export')}</span><Icon name="download" size={17} /></button>
        <button className="list-row btn quiet" style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, height: 'auto' }} onClick={() => file.current?.click()}><span className="lbl">{t('settings.import')}</span><Icon name="upload" size={17} /></button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        <button className="list-row btn quiet" style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, height: 'auto', color: 'var(--bad)' }} onClick={async () => { if (confirm(t('settings.deleteConfirm'))) { await resetAll(); setMsg(t('settings.deleted')); } }}>
          <span className="lbl">{t('settings.delete')}</span><Icon name="trash" size={17} />
        </button>
        {msg && <p className="list-pad small" role="status" style={{ margin: 0 }}>{msg}</p>}
      </div>
    </section>
  );
}

function LevelAndBadges() {
  const { t, settings } = useApp();
  const { level, achievements } = useGamification();
  const de = settings.locale.startsWith('de');
  const unlocked = achievements.filter((a) => a.unlocked).length;
  return (
    <>
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
      <section className="settings-group" aria-labelledby="badges-h" style={{ marginTop: 18 }}>
        <h2 id="badges-h">{t('badges.title')} · {unlocked}/{achievements.length}</h2>
        <div className="badge-grid">
          {achievements.map((a) => (
            <div key={a.def.id} className={`badge-tile ${a.unlocked ? 'on' : ''}`} title={de ? a.def.desc.de : a.def.desc.en}>
              <span className="medal" style={{ ['--tier' as string]: TIER_COLORS[a.def.tier] }}><Icon name={a.def.icon} size={20} strokeWidth={2.2} /></span>
              <strong>{de ? a.def.title.de : a.def.title.en}</strong>
              {a.unlocked ? <span className="tiny faint">{de ? a.def.desc.de : a.def.desc.en}</span> : (
                <span className="badge-progress" aria-label={`${a.value}/${a.def.target}`}><i style={{ width: `${(100 * a.value) / a.def.target}%` }} /></span>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
