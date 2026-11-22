import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppContext as Ctx } from './context.ts';
import { dayKey, deriveProgress, deriveReviewItems, type LumenEvent, type ProgressSummary, type ReviewItemState } from '@lumen/engine';
import { ContentLibrary } from './content.ts';
import { clearEvents, loadEvents, newEventId, putEvents, type StoredEvent } from './db.ts';
import { translate, type TKey } from './i18n.ts';
import { applyDocumentSettings, loadSettings, saveSettings, type Settings } from './settings.ts';
import { syncNow } from './sync.ts';

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
  /** Syncs now if a sync code is set (also runs automatically after new events). */
  runSync(): Promise<void>;
  /** Increments after every successful sync, so server-backed screens can refresh. */
  syncNonce: number;
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
      .catch((e) => !cancelled && setContentError(String(e.message ?? e)));
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

  const reloadEvents = useCallback(async () => setEvents(await loadEvents()), []);

  const runSync = useCallback(async () => {
    const s = settingsRef.current.sync;
    if (!s || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const r = await syncNow(s.serverUrl, s.token, s.cursor, dayKey(new Date()));
      setSettings((prev) => (prev.sync && prev.sync.token === s.token ? { ...prev, sync: { ...prev.sync, lastSync: Date.now(), cursor: r.cursor } } : prev));
      if (r.sent || r.received) setEvents(await loadEvents());
      setSyncNonce((n) => n + 1);
    } catch {
      /* offline or server unreachable: the next change retries */
    } finally {
      syncing.current = false;
    }
  }, []);

  // Automatic sync: on start, when the app comes back to the foreground, and a few seconds after new events.
  const syncToken = settings.sync?.token ?? null;
  useEffect(() => {
    if (!loaded || !syncToken) return;
    void runSync();
    const vis = () => document.visibilityState === 'visible' && void runSync();
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

  const progress = useMemo(() => deriveProgress(events, today), [events, today]);
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
