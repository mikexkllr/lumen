/**
 * Optional sync: a random sync code (20 chars, 100 bit) is the only credential. The server
 * stores events under SHA-256(code) – no email, no password, no profile.
 */
import type { LumenEvent } from '@lumen/engine';
import { loadEvents, putEvents, type StoredEvent } from './db.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return chars.match(/.{1,4}/g)!.join('-');
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') ?? '';
}

export interface SyncResult {
  sent: number;
  received: number;
  cursor: number;
}

export async function syncNow(serverUrl: string, token: string, cursor: number): Promise<SyncResult> {
  const all = await loadEvents();
  const pending = all.filter((e) => !e.synced);
  const base = serverUrl.replace(/\/$/, '');
  let sent = 0;
  let received = 0;
  let next = cursor;
  // push in chunks, pull with the cursor
  for (let i = 0; i === 0 || i < pending.length; i += 500) {
    const chunk = pending.slice(i, i + 500).map(({ synced: _s, ...e }) => e);
    const res = await fetch(`${base}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${normalizeCode(token)}` },
      body: JSON.stringify({ events: chunk, since: next }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { events: LumenEvent[]; cursor: number };
    sent += chunk.length;
    const known = new Set(all.map((e) => e.id));
    const incoming = body.events.filter((e) => !known.has(e.id));
    received += incoming.length;
    await putEvents([...chunk.map((e) => ({ ...e, synced: 1 as const })), ...incoming.map((e) => ({ ...e, synced: 1 as const }) as StoredEvent)]);
    next = body.cursor;
    if (!pending.length) break;
  }
  // keep pulling while the server reports more pages
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${base}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${normalizeCode(token)}` },
      body: JSON.stringify({ events: [], since: next }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { events: LumenEvent[]; cursor: number; more?: boolean };
    const known = new Set((await loadEvents()).map((e) => e.id));
    const incoming = body.events.filter((e) => !known.has(e.id));
    received += incoming.length;
    await putEvents(incoming.map((e) => ({ ...e, synced: 1 as const }) as StoredEvent));
    next = body.cursor;
    if (!body.more) break;
  }
  return { sent, received, cursor: next };
}

export async function deleteServerData(serverUrl: string, token: string): Promise<void> {
  const res = await fetch(`${serverUrl.replace(/\/$/, '')}/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${normalizeCode(token)}` } });
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
}
