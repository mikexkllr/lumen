import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { cleanBreadcrumb, cleanEvent, initMonitoring, scrub } from '../src/lib/monitoring.ts';

describe('crash reports (app)', () => {
  it('stay off without a DSN', () => {
    expect(initMonitoring('lumen@test')).toBe(false);
  });

  it('remove email addresses and device codes from text', () => {
    expect(scrub('no account for ada.l@example.org (ABCD-EFGH-JKLM-NPQR-STUV)')).toBe('no account for [email] ([code])');
    expect(scrub('code ABCDEFGHJKLMNPQRSTUV')).toBe('code [code]');
    expect(scrub('TypeError: x is undefined')).toBe('TypeError: x is undefined');
  });

  it('send the error but nothing about the learner', () => {
    const event = {
      message: 'failed for bo@example.org',
      user: { id: 'u1', email: 'bo@example.org', ip_address: '1.2.3.4' },
      request: { url: 'https://x/api?today=1', headers: { Authorization: 'Bearer ABCD-EFGH-JKLM-NPQR-STUV' } },
      server_name: 'phone',
      exception: { values: [{ type: 'Error', value: 'sync failed for ABCD-EFGH-JKLM-NPQR-STUV' }] },
      extra: { body: { email: 'bo@example.org', code: '123456' }, note: 'mail bo@example.org' },
      breadcrumbs: [
        { category: 'console', message: 'debug bo@example.org', data: { arguments: ['bo@example.org'] } },
        { category: 'fetch', data: { url: '/api/v1/social/users/@bo?today=2026-11-25', method: 'GET', status_code: 500, body: '{"email":"x@y.de"}' } },
        { category: 'navigation', message: 'to #/u/@bo' },
      ],
    } as unknown as ErrorEvent;
    const out = cleanEvent(event)!;
    expect(out.user).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.message).toBe('failed for [email]');
    expect(out.exception!.values![0].value).toBe('sync failed for [code]');
    expect(out.extra).toEqual({ body: { email: '[removed]', code: '[removed]' }, note: 'mail [email]' });
    expect(out.breadcrumbs![0]).toEqual({ category: 'console', message: undefined, data: undefined });
    expect(out.breadcrumbs![1].data).toEqual({ url: '/api/v1/social/users/@bo', method: 'GET', status_code: 500 });
    expect(JSON.stringify(out)).not.toMatch(/example\.org|ABCD-EFGH|Bearer|1\.2\.3\.4|123456/);
  });

  it('keep useful breadcrumbs', () => {
    expect(cleanBreadcrumb({ category: 'ui.click', message: 'button.btn.primary' })).toEqual({ category: 'ui.click', message: 'button.btn.primary' });
  });
});
