import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.ts';
import { sqliteStore } from '../src/store.ts';
import { REPORT_RETENTION_DAYS, tutorReportStore } from '../src/reports.ts';

const ADMIN = { authorization: 'Bearer admin-secret-0123456789' };
const report = { reason: 'solution', reply: 'Die Antwort ist 8.', question: 'Tipp?', task: 'Wie viele Zeilen…', kind: 'numeric', locale: 'de', model: 'tiny' };

function app() {
  return buildServer({ store: sqliteStore(':memory:'), reports: tutorReportStore(':memory:'), adminToken: 'admin-secret-0123456789', rateLimit: 1000, tutor: { url: 'https://openrouter.ai/api/v1', model: 'tiny', provider: 'OpenRouter', maxTokens: 10, temperature: 0, timeoutMs: 100 } });
}

describe('Lux reports', () => {
  it('names model and provider for the consent dialog', async () => {
    const res = (await app().inject({ method: 'GET', url: '/v1/tutor' })).json();
    expect(res).toMatchObject({ model: 'tiny', local: false, provider: 'OpenRouter', reports: true });
  });

  it('stores a report without any account and lists it for moderators', async () => {
    const a = app();
    expect((await a.inject({ method: 'POST', url: '/v1/tutor/reports', payload: report })).statusCode).toBe(200);
    expect((await a.inject({ method: 'POST', url: '/v1/tutor/reports', payload: { ...report, reason: 'spam' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'POST', url: '/v1/tutor/reports', payload: { reason: 'wrong', reply: '' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'GET', url: '/v1/admin/tutor-reports' })).statusCode).toBe(401);
    const list = (await a.inject({ method: 'GET', url: '/v1/admin/tutor-reports', headers: ADMIN })).json().reports;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'solution', reply: 'Die Antwort ist 8.', model: 'tiny', resolved: false });
    await a.inject({ method: 'POST', url: `/v1/admin/tutor-reports/${list[0].id}/resolve`, headers: ADMIN });
    expect((await a.inject({ method: 'GET', url: '/v1/admin/tutor-reports', headers: ADMIN })).json().reports).toHaveLength(0);
  });

  it('rate limits reports per IP', async () => {
    const a = app();
    for (let i = 0; i < 20; i++) await a.inject({ method: 'POST', url: '/v1/tutor/reports', payload: report });
    expect((await a.inject({ method: 'POST', url: '/v1/tutor/reports', payload: report })).statusCode).toBe(429);
  });

  it('deletes old reports', () => {
    const s = tutorReportStore(':memory:');
    s.add({ ...report }, Date.now() - (REPORT_RETENTION_DAYS + 1) * 86_400_000);
    s.add({ ...report });
    expect(s.list()).toHaveLength(1);
  });
});
