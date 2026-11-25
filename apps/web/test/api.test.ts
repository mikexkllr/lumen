import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, apiBase, apiUrl, isValidServerUrl, normalizeServerUrl, onServerChange, probeServer, setServerOverride } from '../src/lib/api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  setServerOverride(null);
});

describe('server address', () => {
  it('accepts https everywhere and plain http only on this machine', () => {
    expect(isValidServerUrl('https://lumen.example.org/api/')).toBe(true);
    expect(isValidServerUrl('http://localhost:8787')).toBe(true);
    expect(isValidServerUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isValidServerUrl('http://lumen.example.org')).toBe(false);
    expect(isValidServerUrl('ftp://x')).toBe(false);
    expect(isValidServerUrl('not a url')).toBe(false);
    expect(normalizeServerUrl('  https://a.b/api/// ')).toBe('https://a.b/api');
    expect(apiUrl('https://a.b/api/', '/v1/x')).toBe('https://a.b/api/v1/x');
  });

  it('an override wins over the build default and notifies listeners once per change', () => {
    const f = vi.fn();
    const off = onServerChange(f);
    expect(apiBase()).toBe(API_BASE);
    setServerOverride('https://self.example/api/');
    setServerOverride('https://self.example/api');
    expect(apiBase()).toBe('https://self.example/api');
    expect(f).toHaveBeenCalledTimes(1);
    off();
    setServerOverride(null);
    expect(f).toHaveBeenCalledTimes(1);
    expect(apiBase()).toBe(API_BASE);
  });

  it('probes whether a URL is a Lumen server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sync: true, tutor: true, social: false }), { status: 200 })));
    expect(await probeServer('https://x.example/api')).toEqual({ sync: true, tutor: true, social: false });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    expect(await probeServer('https://x.example/api')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns'); }));
    expect(await probeServer('https://x.example/api')).toBeNull();
  });
});
