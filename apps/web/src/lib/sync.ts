/**
 * Background backup of the learning events to the learner's Lumen account. The device code
 * the server hands out at sign-in is the only credential; the server keeps the events under
 * SHA-256 of it. Events are append-only with UUIDs, so pushing and pulling is idempotent.
 */
import type { LumenEvent } from '@lumen/engine';
import { loadEvents, putEvents, type StoredEvent } from './db.ts';

/** Device codes are shown and sent in groups of four (ABCD-EFGH-…). */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') ?? '';
}

export interface SyncResult {
  sent: number;
  received: number;
  cursor: number;
}

export class SyncError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const CHUNK = 500;

/** Pushes unsynced events and pulls new ones. `today` is the learner's local day (streaks, leagues). */
export async function syncNow(serverUrl: string, token: string, cursor: number, today?: string, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const all = await loadEvents();
  const known = new Set(all.map((e) => e.id));
  const pending = all.filter((e) => !e.synced);
  const url = `${serverUrl.replace(/\/$/, '')}/v1/sync`;
  let sent = 0;
  let received = 0;
  let next = cursor;
  let more = true;
  const post = async (events: LumenEvent[]) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${normalizeCode(token)}` },
      body: JSON.stringify({ events, since: next, today }),
    });
    if (!res.ok) throw new SyncError(res.status);
    const body = (await res.json()) as { events: LumenEvent[]; cursor: number; more?: boolean };
    const incoming = body.events.filter((e) => !known.has(e.id));
    for (const e of incoming) known.add(e.id);
    received += incoming.length;
    await putEvents([...events.map((e) => ({ ...e, synced: 1 as const })), ...incoming.map((e) => ({ ...e, synced: 1 as const }) as StoredEvent)]);
    sent += events.length;
    next = body.cursor;
    more = body.more === true;
  };
  for (let i = 0; i < pending.length; i += CHUNK) await post(pending.slice(i, i + CHUNK).map(({ synced: _s, ...e }) => e as LumenEvent));
  // Pull the rest (or everything, when nothing was pending) while the server reports more pages.
  if (!pending.length) await post([]);
  for (let page = 0; more && page < 50; page++) await post([]);
  return { sent, received, cursor: next };
}

/** Deletes the account on the server: events, community profile, sign-in links (Apple is revoked). */
export async function deleteAccount(serverUrl: string, token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${serverUrl.replace(/\/$/, '')}/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${normalizeCode(token)}` } });
  if (!res.ok && res.status !== 404) throw new SyncError(res.status);
}
