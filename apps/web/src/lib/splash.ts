/**
 * Native apps only: the launch screen stays up (launchAutoHide: false in
 * apps/mobile/capacitor.config.ts) until the content catalogue is loaded, so the
 * app never flashes an empty WebView. A timeout hides it anyway if loading hangs.
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './reminders.ts';

const SplashScreen = registerPlugin<{ hide(opts?: { fadeOutDuration?: number }): Promise<void> }>('SplashScreen');
let hidden = false;

export function hideSplash(): void {
  if (hidden || !isNativeApp()) return;
  hidden = true;
  SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
}

if (isNativeApp()) setTimeout(hideSplash, 8000);
