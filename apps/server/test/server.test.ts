import { describe, expect, it } from 'vitest';
import { buildServer, accountKey } from '../src/app.ts';
import { sqliteStore } from '../src/store.ts';

const CODE = 'ABCD-EFGH-JKLM-NPQR-STUV';
const auth = { authorization: `Bearer ${CODE}` };
const ev = (id: string, day = '2026-11-18') => ({ id: `evt-${id}-0000`, type: 'attempt', ts: Date.parse(`${day}T10:00:00Z`), day, stepId: 's', problem: true, correct: true, final: true });

function server() {
  return buildServer({ store: sqliteStore(':memory:'), rateLimit: 1000 });
}

describe('sync server', () => {
  it('requires a sync code', async () => {
    const app = server();
    const res = await app.inject({ method: 'POST', url: '/v1/sync', payload: { events: [] } });
    expect(res.statusCode).toBe(401);
  });

  it('stores events idempotently and returns them by cursor', async () => {
    const app = server();
    const first = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload: { events: [ev('a'), ev('b')], since: 0 } });
    expect(first.statusCode).toBe(200);
    const body1 = first.json();
    expect(body1.events).toHaveLength(2);
    // second device sends one duplicate and one new event, pulling everything
    const second = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload: { events: [ev('b'), ev('c')], since: 0 } });
    expect(second.json().events.map((e: { id: string }) => e.id)).toEqual(['evt-a-0000', 'evt-b-0000', 'evt-c-0000']);
    // incremental pull
    const third = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload: { events: [], since: body1.cursor } });
    expect(third.json().events.map((e: { id: string }) => e.id)).toEqual(['evt-c-0000']);
  });

  it('isolates accounts and never stores the raw code', async () => {
    const store = sqliteStore(':memory:');
    const app = buildServer({ store });
    await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload: { events: [ev('a')] } });
    const other = await app.inject({ method: 'POST', url: '/v1/sync', headers: { authorization: 'Bearer ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ' }, payload: { events: [] } });
    expect(other.json().events).toEqual([]);
    expect(accountKey('ABCDEFGHJKLMNPQRSTUV')).toMatch(/^[0-9a-f]{64}$/);
    expect(store.since(accountKey('ABCDEFGHJKLMNPQRSTUV'), 0, 10).events).toHaveLength(1);
  });

  it('rejects malformed events', async () => {
    const app = server();
    const res = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload: { events: [{ id: 'x', type: 'hack', ts: 1, day: 'nope' }] } });
    expect(res.statusCode).toBe(400);
  });

  it('deletes all data of an account', async () => {
    const app = server();
    await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload: { events: [ev('a'), ev('b')] } });
    const del = await app.inject({ method: 'DELETE', url: '/v1/account', headers: auth });
    expect(del.json()).toEqual({ deleted: 2 });
    const exp = await app.inject({ method: 'GET', url: '/v1/export', headers: auth });
    expect(exp.json().events).toEqual([]);
  });

  it('answers CORS preflight and rate limits', async () => {
    const app = buildServer({ store: sqliteStore(':memory:'), rateLimit: 2 });
    const pre = await app.inject({ method: 'OPTIONS', url: '/v1/sync', headers: { origin: 'https://lumen.example' } });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('*');
    await app.inject({ method: 'GET', url: '/healthz' });
    await app.inject({ method: 'GET', url: '/healthz' });
    const limited = await app.inject({ method: 'GET', url: '/healthz' });
    expect(limited.statusCode).toBe(429);
  });
});
