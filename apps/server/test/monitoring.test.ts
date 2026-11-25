import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { buildServer } from '../src/app.ts';
import { authStore } from '../src/auth.ts';
import { cleanServerEvent, initServerMonitoring, scrub } from '../src/monitoring.ts';
import { sqliteStore } from '../src/store.ts';

describe('crash reports (server)', () => {
  it('stay off without SENTRY_DSN', () => {
    expect(initServerMonitoring({})).toBe(false);
  });

  it('keep only method and path of the request', () => {
    const e = cleanServerEvent({
      message: 'mail to ada@example.org failed',
      user: { ip_address: '1.2.3.4' },
      request: { method: 'POST', url: 'https://l/api/v1/auth/email/start?x=1', headers: { authorization: 'Bearer ABCD-EFGH-JKLM-NPQR-STUV' }, data: { email: 'ada@example.org' }, cookies: { a: 'b' } },
      exception: { values: [{ value: 'bad token ABCD-EFGH-JKLM-NPQR-STUV' }] },
      breadcrumbs: [{ message: 'http ada@example.org', data: { url: '/x', body: 'secret' } }],
    } as unknown as ErrorEvent);
    expect(e.request).toEqual({ method: 'POST', url: 'https://l/api/v1/auth/email/start' });
    expect(e.user).toBeUndefined();
    expect(e.message).toBe('mail to [email] failed');
    expect(JSON.stringify(e)).not.toMatch(/example\.org|ABCD-EFGH|Bearer|1\.2\.3\.4|secret/);
    expect(scrub('nothing here')).toBe('nothing here');
  });

  it('a failing login mail is reported, the learner gets a 502', async () => {
    const reported: unknown[] = [];
    const app = buildServer({
      store: sqliteStore(':memory:'), auth: authStore(':memory:'),
      email: { send: async () => { throw new Error('smtp: expected 250, got 554'); }, pepper: 'test-pepper-0123456789' },
      reportError: (e) => reported.push(e),
    });
    const r = await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'z@example.org' } });
    expect(r.statusCode).toBe(502);
    expect((reported[0] as Error).message).toContain('smtp');
  });

  it('the setup hook runs before the routes are added', async () => {
    const order: string[] = [];
    const app = buildServer({ store: sqliteStore(':memory:'), setup: (a) => { order.push('setup'); a.addHook('onRequest', async () => void order.push('hook')); } });
    await app.inject({ url: '/healthz' });
    expect(order).toEqual(['setup', 'hook']);
  });
});
