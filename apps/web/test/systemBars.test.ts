import { afterEach, describe, expect, it, vi } from 'vitest';

const setStyle = vi.fn(async (_: { style: string }) => undefined);
vi.mock('@capacitor/core', () => ({
  SystemBars: { setStyle: (o: { style: string }) => setStyle(o) },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));
const { syncSystemBars } = await import('../src/lib/systemBars.ts');

describe('system bars', () => {
  const g = globalThis as { Capacitor?: unknown };
  afterEach(() => { delete g.Capacitor; setStyle.mockClear(); });

  it('follow the app theme in the native apps', () => {
    g.Capacitor = { isNativePlatform: () => true };
    syncSystemBars('dark');
    syncSystemBars('light');
    syncSystemBars('system');
    expect(setStyle.mock.calls.map((c) => c[0].style)).toEqual(['DARK', 'LIGHT', 'DEFAULT']);
  });

  it('are left alone in the browser', () => {
    syncSystemBars('dark');
    expect(setStyle).not.toHaveBeenCalled();
  });
});
