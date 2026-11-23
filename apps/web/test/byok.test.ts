import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTutorContext, resolveProblem, ProblemStepSchema, type ProblemStep } from '@lumen/engine';
import { askByok, isValidByok, providerLabel, testByok } from '../src/lib/byok.ts';
import { apiBase, isValidServerUrl, setServerOverride } from '../src/lib/api.ts';

const step = { ...ProblemStepSchema.parse({ kind: 'problem', widget: 'numeric', prompt: 'Wie viele Zeilen hat eine Wahrheitstafel mit 3 Aussagen?', answer: { value: 8 }, hints: ['Jede Aussage ist wahr oder falsch.'] }), id: 't/s' } as ProblemStep;
const ctx = buildTutorContext(resolveProblem(step), { input: '6' }, { status: 'wrong', attempts: 1, hintsShown: 0 });
const cfg = { url: 'https://openrouter.ai/api/v1', model: 'some/model', key: 'sk-test' };

function fakeFetch(replies: (string | number)[], seen: { url: string; init: RequestInit }[] = []) {
  let i = 0;
  return vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (typeof r === 'number') return new Response('{}', { status: r });
    return new Response(JSON.stringify({ choices: [{ message: { content: r } }] }), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('bring your own key', () => {
  it('asks the provider directly with the learner’s key and the Lux prompt', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', fakeFetch(['Wie viele Fälle gibt es bei 2 Aussagen?'], seen));
    const ans = await askByok(cfg, ctx, [], 'why-wrong');
    expect(ans).toMatchObject({ source: 'llm', model: 'some/model' });
    expect(seen[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(seen[0].init.body));
    expect(body.model).toBe('some/model');
    expect(body.messages[0].role).toBe('system');
  });

  it('keeps the leak guard: a model that gives the answer away twice is replaced by the rule tutor', async () => {
    vi.stubGlobal('fetch', fakeFetch(['Es sind 8 Zeilen.', 'Die Antwort ist 8.']));
    const ans = await askByok(cfg, ctx, [], 'hint');
    expect(ans).toMatchObject({ source: 'rules', fallback: 'leak' });
  });

  it('falls back to the rule tutor when the provider fails, and reports the status in the test', async () => {
    vi.stubGlobal('fetch', fakeFetch([401]));
    expect((await askByok(cfg, ctx, [], 'hint')).source).toBe('rules');
    expect(await testByok(cfg)).toBe(401);
  });

  it('validates the configuration', () => {
    expect(isValidByok(cfg)).toBe(true);
    expect(isValidByok({ ...cfg, url: 'http://insecure.example/v1' })).toBe(false);
    expect(isValidByok({ ...cfg, key: ' ' })).toBe(false);
    expect(providerLabel('https://openrouter.ai/api/v1')).toBe('OpenRouter');
    expect(providerLabel('https://llm.example.org/v1')).toBe('llm.example.org');
  });
});

describe('server address', () => {
  it('uses the build default until the learner picks another server', () => {
    const def = apiBase();
    setServerOverride('https://lumen.example.org/api/');
    expect(apiBase()).toBe('https://lumen.example.org/api');
    setServerOverride(null);
    expect(apiBase()).toBe(def);
  });

  it('accepts https and local development servers only', () => {
    expect(isValidServerUrl('https://lumen.example.org/api')).toBe(true);
    expect(isValidServerUrl('http://localhost:8787')).toBe(true);
    expect(isValidServerUrl('http://lumen.example.org/api')).toBe(false);
    expect(isValidServerUrl('lumen.example.org')).toBe(false);
  });
});
