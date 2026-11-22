import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';
import { App } from './App.tsx';
import { AppProvider } from './lib/store.tsx';
import { SocialProvider } from './lib/socialContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <SocialProvider>
        <App />
      </SocialProvider>
    </AppProvider>
  </StrictMode>,
);

// Offline support: register the service worker in production builds only – not inside the
// native apps, which ship their files with each update (a stale SW cache would shadow them).
const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
if (import.meta.env.PROD && !native && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
