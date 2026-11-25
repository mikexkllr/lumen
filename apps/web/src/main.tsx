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
import { ErrorBoundary, initMonitoring, reactErrorHandler } from './lib/monitoring.ts';

initMonitoring(`lumen@${__LUMEN_VERSION__}`);

/** Shown instead of a blank page if a screen crashes; the report has already gone to Sentry. */
function Crashed() {
  const de = navigator.language.toLowerCase().startsWith('de');
  return (
    <main className="loading-screen" role="alert">
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem' }}>{de ? 'Da ist etwas schiefgelaufen.' : 'Something went wrong.'}</h1>
        <p className="small muted">{de ? 'Dein Fortschritt ist gesichert. Lade die App neu, um weiterzulernen.' : 'Your progress is safe. Reload the app to keep learning.'}</p>
        <button className="btn primary" onClick={() => location.reload()}>{de ? 'Neu laden' : 'Reload'}</button>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!, { onUncaughtError: reactErrorHandler() }).render(
  <StrictMode>
    <ErrorBoundary fallback={<Crashed />}>
      <AppProvider>
        <SocialProvider>
          <App />
        </SocialProvider>
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline support: register the service worker in production builds only – not inside the
// native apps, which ship their files with each update (a stale SW cache would shadow them).
const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
if (import.meta.env.PROD && !native && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
