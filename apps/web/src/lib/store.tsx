import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppContext as Ctx } from './context.ts';
import { dayKey, deriveProgress, deriveReviewItems, type LumenEvent, type ProgressSummary, type ReviewItemState } from '@lumen/engine';
import { ContentLibrary } from './content.ts';
import { clearEvents, loadEvents, newEventId, putEvents, type StoredEvent } from './db.ts';
import { translate, type TKey } from './i18n.ts';
import { applyDocumentSettings, loadSettings, saveSettings, signedOutSettings, type Account, type Settings } from './settings.ts';
import { deleteAccount as deleteServerAccount, syncNow, SyncError } from './sync.ts';
import { setServerOverride } from './api.ts';
import { reportHandled } from './monitoring.ts';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type NewEvent = DistributiveOmit<LumenEvent, 'id' | 'ts' | 'day'>;

interface AppState {
  settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
  lib: ContentLibrary | null;
  contentError: string | null;
  reloadContent(): void;
  events: StoredEvent[];
  loaded: boolean;
  addEvents(evts: NewEvent[]): LumenEvent[];
  replaceAllEvents(evts: StoredEvent[]): Promise<void>;
  reloadEvents(): Promise<void>;
  resetAll(): Promise<void>;
  today: string;
  progress: ProgressSummary;
  reviewItems: Map<string, ReviewItemState>;
  online: boolean;
  /** Backs up and pulls progress now if signed in (also runs automatically after new events). */
  runSync(): Promise<boolean>;
  /** Increments after every successful sync, so server-backed screens can refresh. */
  syncNonce: number;
  /** Stores the account after Sign in with Apple or an email code and pulls its progress. */
  signIn(account: Account): Promise<void>;
  /** Backs up, then removes the account and all progress from this device. */
  signOut(): Promise<void>;
  /** Deletes the account on the server and everything on this device. */
  deleteAccount(): Promise<void>;
  t(key: TKey, vars?: Record<string, string | number>): string;
}


export function makeEvent(e: NewEvent, now = new Date()): LumenEvent {
  return { ...e, id: newEventId(), ts: now.getTime(), day: dayKey(now) } as LumenEvent;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [lib, setLib] = useState<ContentLibrary | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [contentNonce, setContentNonce] = useState(0);
  const [syncNonce, setSyncNonce] = useState(0);
  // Every API call reads the server from here; set it before children render.
  setServerOverride(settings.serverUrl);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncing = useRef(false);

  useEffect(() => {
    applyDocumentSettings(settings);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    setContentError(null);
    ContentLibrary.load(settings.locale)
      .then((l) => {
        if (cancelled) return;
        setLib(l);
        l.prefetchAll();
      })
      .catch((e) => {
        if (cancelled) return;
        setContentError(String(e.message ?? e));
        reportHandled(e, 'content', { locale: settings.locale, online: navigator.onLine });
      });
    return () => {
      cancelled = true;
    };
  }, [settings.locale, contentNonce]);

  useEffect(() => {
    loadEvents().then((e) => {
      setEvents(e);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const tick = () => setToday(dayKey(new Date()));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === 'visible' && tick();
    addEventListener('online', on);
    addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    const iv = setInterval(tick, 60_000);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      clearInterval(iv);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const addEvents = useCallback((evts: NewEvent[]) => {
    const made = evts.map((e) => makeEvent(e));
    setEvents((prev) => [...prev, ...made]);
    putEvents(made).catch(() => {});
    return made;
  }, []);

  const replaceAllEvents = useCallback(async (evts: StoredEvent[]) => {
    await putEvents(evts);
    setEvents(await loadEvents());
  }, []);

  // Merge instead of replace: events added while a load was in flight must not disappear.
  const mergeLoaded = useCallback(async () => {
    const loadedEvents = await loadEvents();
    setEvents((prev) => {
      const byId = new Map(loadedEvents.map((e) => [e.id, e]));
      for (const e of prev) if (!byId.has(e.id)) byId.set(e.id, e);
      return [...byId.values()].sort((a, b) => a.ts - b.ts);
    });
  }, []);
  const reloadEvents = useCallback(async () => setEvents(await loadEvents()), []);

  const runSync = useCallback(async (force = false) => {
    const s = settingsRef.current.account;
    if (!s || (syncing.current && !force) || !navigator.onLine) return false;
    while (syncing.current) await new Promise((r) => setTimeout(r, 50));
    syncing.current = true;
    try {
      const r = await syncNow(s.serverUrl, s.token, s.cursor, dayKey(new Date()));
      setSettings((prev) => (prev.account && prev.account.token === s.token ? { ...prev, account: { ...prev.account, lastSync: Date.now(), cursor: r.cursor } } : prev));
      settingsRef.current = { ...settingsRef.current, account: { ...s, lastSync: Date.now(), cursor: r.cursor } };
      if (r.sent || r.received) await mergeLoaded();
      setSyncNonce((n) => n + 1);
      return true;
    } catch (e) {
      // The account is gone on the server (deleted on another device): sign out here too.
      if (e instanceof SyncError && e.status === 401) setSettings((prev) => (prev.account?.token === s.token ? signedOutSettings(prev) : prev));
      // offline phones are normal; a server error or a bug in the sync code is not
      else if (!(e instanceof TypeError)) reportHandled(e, 'sync', { status: e instanceof SyncError ? e.status : undefined, cursor: s.cursor, method: s.method });
      return false;
    } finally {
      syncing.current = false;
    }
  }, [mergeLoaded]);

  const signIn = useCallback(async (account: Account) => {
    settingsRef.current = { ...settingsRef.current, account };
    setSettings((prev) => ({ ...prev, account }));
    // Local progress from before signing in goes up with the first sync.
    await runSync(true);
  }, [runSync]);

  const wipeDevice = useCallback(async () => {
    await clearEvents();
    setEvents([]);
    settingsRef.current = signedOutSettings(settingsRef.current);
    setSettings((prev) => signedOutSettings(prev));
  }, []);

  const signOut = useCallback(async () => {
    const pending = (await loadEvents()).some((e) => !e.synced);
    if (pending && !(await runSync(true))) throw new Error('sync_failed');
    await wipeDevice();
  }, [runSync, wipeDevice]);

  const deleteAccount = useCallback(async () => {
    const s = settingsRef.current.account;
    if (s) await deleteServerAccount(s.serverUrl, s.token);
    await wipeDevice();
  }, [wipeDevice]);

  // Automatic sync: on start, when the app comes back to the foreground, and a few seconds after new events.
  const syncToken = settings.account?.token ?? null;
  useEffect(() => {
    if (!loaded || !syncToken) return;
    void runSync();
    const vis = () => { if (document.visibilityState === 'visible') void runSync(); };
    document.addEventListener('visibilitychange', vis);
    addEventListener('online', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      removeEventListener('online', vis);
    };
  }, [loaded, syncToken, runSync]);
  useEffect(() => {
    if (!loaded || !syncToken || !events.some((e) => !e.synced)) return;
    const timer = setTimeout(() => void runSync(), 2500);
    return () => clearTimeout(timer);
  }, [events, loaded, syncToken, runSync]);

  const resetAll = useCallback(async () => {
    await clearEvents();
    setEvents([]);
  }, []);

  const progress = useMemo(() => deriveProgress(events, today, lib?.catalog), [events, today, lib]);
  const reviewItems = useMemo(() => (lib ? deriveReviewItems(events, lib.catalog) : new Map<string, ReviewItemState>()), [events, lib]);
  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(settings.locale, key, vars), [settings.locale]);

  const value: AppState = {
    settings,
    updateSettings,
    lib,
    contentError,
    reloadContent: () => setContentNonce((n) => n + 1),
    events,
    loaded,
    addEvents,
    replaceAllEvents,
    reloadEvents,
    resetAll,
    signIn,
    signOut,
    deleteAccount,
    today,
    progress,
    reviewItems,
    online,
    runSync,
    syncNonce,
    t,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx) as AppState | null;
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
