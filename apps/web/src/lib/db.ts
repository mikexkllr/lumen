/** Local-first event store (IndexedDB). Events are append-only and carry a UUID. */
import { openDB, type IDBPDatabase } from 'idb';
import type { LumenEvent } from '@lumen/engine';

export type StoredEvent = LumenEvent & { synced?: 0 | 1 };

let dbp: Promise<IDBPDatabase> | null = null;
let memory: StoredEvent[] | null = null;

function db() {
  dbp ??= openDB('lumen', 1, {
    upgrade(d) {
      const s = d.createObjectStore('events', { keyPath: 'id' });
      s.createIndex('synced', 'synced');
    },
  });
  return dbp;
}

async function withFallback<T>(f: (d: IDBPDatabase) => Promise<T>, fallback: () => T): Promise<T> {
  if (memory) return fallback();
  try {
    return await f(await db());
  } catch {
    // IndexedDB blocked (e.g. some private modes): keep working in memory.
    memory = [];
    return fallback();
  }
}

export function loadEvents(): Promise<StoredEvent[]> {
  return withFallback((d) => d.getAll('events') as Promise<StoredEvent[]>, () => [...memory!]);
}

export function putEvents(events: StoredEvent[]): Promise<void> {
  return withFallback(
    async (d) => {
      const tx = d.transaction('events', 'readwrite');
      for (const e of events) await tx.store.put(e);
      await tx.done;
    },
    () => {
      const ids = new Set(events.map((e) => e.id));
      memory = [...memory!.filter((e) => !ids.has(e.id)), ...events];
    },
  );
}

export function clearEvents(): Promise<void> {
  return withFallback((d) => d.clear('events'), () => { memory = []; });
}

export function newEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
