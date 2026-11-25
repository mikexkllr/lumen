import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { lumenContent } from './vite-plugin-lumen-content.ts';
import { readFileSync } from 'node:fs';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const version = (JSON.parse(readFileSync(new URL('../mobile/package.json', import.meta.url), 'utf8')) as { version: string }).version;
// Release name in crash reports; CI sets it per platform (lumen-web@<sha>, lumen-ios@<version>+<build>).
const release = process.env.LUMEN_RELEASE || `lumen@${version}`;
// Readable stack traces in Sentry: with SENTRY_AUTH_TOKEN (CI only) the build injects debug IDs
// and uploads its sourcemaps; without it the plugin does nothing.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  // Served from a sub-path in production (e.g. LUMEN_BASE=/app/ next to the landing page).
  base: process.env.LUMEN_BASE ?? '/',
  define: { __LUMEN_VERSION__: JSON.stringify(version), __LUMEN_RELEASE__: JSON.stringify(release) },
  plugins: [
    react(),
    lumenContent(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Lumen – learn by doing',
        short_name: 'Lumen',
        description: 'A free alternative to Brilliant.org: interactive lessons in math, science, computer science and AI.',
        lang: 'en',
        start_url: '.',
        display: 'standalone',
        background_color: '#fbf8f2',
        theme_color: '#1c1a3a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
    sentryVitePlugin({
      disable: !sentryToken,
      authToken: sentryToken,
      org: process.env.SENTRY_ORG ?? 'mike-keller-2t',
      project: process.env.SENTRY_PROJECT ?? 'lumen-app',
      telemetry: false,
      release: { name: release, inject: false, deploy: process.env.LUMEN_DEPLOY_ENV ? { env: process.env.LUMEN_DEPLOY_ENV } : false },
      // the store apps don't need to ship their maps once Sentry has them
      sourcemaps: process.env.LUMEN_DELETE_SOURCEMAPS ? { filesToDeleteAfterUpload: ['**/*.map'] } : undefined,
      // component names on click breadcrumbs ("clicked SignInOptions > button")
      reactComponentAnnotation: { enabled: true },
      bundleSizeOptimizations: { excludeTracing: true, excludeReplayCanvas: true, excludeReplayIframe: true, excludeReplayShadowDom: true, excludeReplayWorker: true },
    }),
  ],
  server: {
    port: 5173,
    // Lumen server (accounts, Lux, community) in development: npm run server.
    // `vite preview` uses the same proxy; the end-to-end tests point it at their own server.
    proxy: { '/api': { target: process.env.LUMEN_API_PROXY ?? 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  build: { target: 'es2022', sourcemap: true },
});
