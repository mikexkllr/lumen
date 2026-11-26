import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Android System WebView before Chrome 103 (minSdk 24 devices) has AbortSignal but no AbortSignal.timeout.
const original = AbortSignal.timeout;

describe('AbortSignal.timeout polyfill', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    // @ts-expect-error simulating an old WebView
    delete AbortSignal.timeout;
  });
  afterEach(() => {
    AbortSignal.timeout = original;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reproduces LUMEN-APP-2 without the polyfill: tutorStatus throws synchronously', async () => {
    const { tutorStatus } = await import('../src/lib/tutor.ts');
    expect(() => tutorStatus()).toThrow(/AbortSignal.timeout is not a function/);
  });

  it('adds a working AbortSignal.timeout', async () => {
    await import('../src/lib/polyfills.ts');
    const signal = AbortSignal.timeout(4000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe('TimeoutError');
  });

  it('lets tutorStatus fall back to null instead of crashing the screen', async () => {
    await import('../src/lib/polyfills.ts');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const { tutorStatus } = await import('../src/lib/tutor.ts');
    await expect(tutorStatus()).resolves.toBeNull();
  });

  it('keeps the native implementation where there is one', async () => {
    const native = vi.fn(() => new AbortController().signal);
    AbortSignal.timeout = native;
    await import('../src/lib/polyfills.ts');
    AbortSignal.timeout(1);
    expect(native).toHaveBeenCalledOnce();
  });
});
