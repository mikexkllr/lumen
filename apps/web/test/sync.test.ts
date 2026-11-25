import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LumenEvent } from '@lumen/engine';
import { clearEvents, loadEvents, putEvents } from '../src/lib/db.ts';
import { deleteAccount, normalizeCode, syncNow, SyncError } from '../src/lib/sync.ts';

const ev = (id: string, ts = 1): LumenEvent => ({ id: `evt-${id}-0000`, type: 'concept_completed', ts, day: '2026-11-25', conceptId: 'c', topicId: 't', problems: 1, firstTryCorrect: 1, durationMs: 1000 });

/** A tiny sync server: keeps events per call order and pages them like the real one. */
function server(page = 3, initial: LumenEvent[] = []) {
  const stored: LumenEvent[] = [...initial];
  const calls: { events: LumenEvent[]; since: number; auth: string }[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { events: LumenEvent[]; since: number };
    calls.push({ ...body, auth: (init.headers as Record<string, string>).Authorization });
    for (const e of body.events) if (!stored.some((x) => x.id === e.id)) stored.push(e);
    const out = stored.slice(body.since, body.since + page);
    return new Response(JSON.stringify({ events: out, cursor: body.since + out.length, more: body.since + out.length < stored.length }), { status: 200 });
  });
  return { stored, calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

beforeEach(async () => clearEvents());

describe('background sync', () => {
  it('normalizes device codes into groups of four', () => {
    expect(normalizeCode('abcd efgh-ijkl')).toBe('ABCD-EFGH-IJKL');
    expect(normalizeCode('')).toBe('');
  });

  it('pushes unsynced events, pulls the rest page by page and marks everything synced', async () => {
    const remote = [ev('r1'), ev('r2'), ev('r3'), ev('r4')];
    await putEvents([{ ...ev('l1'), synced: 0 }, { ...ev('l2'), synced: 0 }, { ...ev('old'), synced: 1 }]);
    const s = server(3, remote);
    const r = await syncNow('https://lumen.example/api/', 'abcd-efgh', 0, '2026-11-25', s.fetchImpl);
    expect(r.sent).toBe(2);
    expect(r.received).toBe(4);
    expect(r.cursor).toBe(6);
    expect(s.calls[0].auth).toBe('Bearer ABCD-EFGH');
    const local = await loadEvents();
    expect(local.map((e) => e.id).sort()).toEqual([...remote, ev('l1'), ev('l2'), ev('old')].map((e) => e.id).sort());
    expect(local.every((e) => e.synced === 1)).toBe(true);
  });

  it('only pulls when nothing is pending, and a second run sends nothing again', async () => {
    const s = server(10, [ev('a')]);
    const first = await syncNow('/api', 'T', 0, undefined, s.fetchImpl);
    expect(first).toEqual({ sent: 0, received: 1, cursor: 1 });
    const second = await syncNow('/api', 'T', first.cursor, undefined, s.fetchImpl);
    expect(second).toEqual({ sent: 0, received: 0, cursor: 1 });
  });

  it('sends large backlogs in chunks of 500', async () => {
    await putEvents(Array.from({ length: 1200 }, (_, i) => ({ ...ev(`b${i}`), synced: 0 as const })));
    const s = server(5000);
    const r = await syncNow('/api', 'T', 0, undefined, s.fetchImpl);
    expect(r.sent).toBe(1200);
    expect(s.calls.filter((c) => c.events.length).map((c) => c.events.length)).toEqual([500, 500, 200]);
  });

  it('reports the HTTP status when the server refuses', async () => {
    await expect(syncNow('/api', 'T', 0, undefined, (async () => new Response('', { status: 401 })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 401 });
    expect(new SyncError(500).message).toBe('HTTP 500');
  });

  it('deletes the account on the server, a missing one is fine', async () => {
    const seen: string[] = [];
    const ok = (status: number) => (async (url: string, init: RequestInit) => { seen.push(`${init.method} ${url}`); return new Response('', { status }); }) as unknown as typeof fetch;
    await deleteAccount('https://l.example/api/', 'abcd', ok(200));
    expect(seen[0]).toBe('DELETE https://l.example/api/v1/account');
    await expect(deleteAccount('/api', 'abcd', ok(404))).resolves.toBeUndefined();
    await expect(deleteAccount('/api', 'abcd', ok(500))).rejects.toBeInstanceOf(SyncError);
  });
});
