import { SystemBars, SystemBarsStyle } from '@capacitor/core';

/**
 * Status and navigation bar icons follow the app's own theme (Profile → Appearance), not just
 * the device's: dark app on a light phone needs light icons. Native apps only (Android, iOS).
 * The plugin is called directly, never returned from an async function (see reminders.ts).
 */
export function syncSystemBars(theme: 'system' | 'light' | 'dark'): void {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.() !== true) return;
  const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default;
  SystemBars.setStyle({ style }).catch(() => {});
}
