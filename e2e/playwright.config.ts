/**
 * End-to-end UI tests: the production build of the web app (built with VITE_LUMEN_E2E=1, see
 * `npm run e2e`) served by `vite preview`, talking to a real Lumen server on in-memory SQLite
 * (e2e/server.ts). Phone layout in German for every feature, desktop in English as a smoke test.
 */
import { defineConfig, devices } from '@playwright/test';

const WEB = Number(process.env.E2E_WEB_PORT ?? 4180);
const API = Number(process.env.E2E_API_PORT ?? 8790);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results/e2e',
  fullyParallel: true,
  workers: CI ? 2 : 4,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: '../test-results/e2e-report' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone-de',
      grepInvert: /@desktop|@gallery|@store/,
      use: { ...devices['Pixel 7'], locale: 'de-DE', timezoneId: 'Europe/Berlin' },
    },
    {
      name: 'desktop-en',
      grep: /@desktop/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 820 }, locale: 'en-US', timezoneId: 'Europe/Berlin' },
    },
    {
      // screenshots for a visual review, not part of the normal run: --project gallery
      name: 'gallery',
      grep: /@gallery/,
      use: { ...devices['Pixel 7'], locale: 'de-DE', timezoneId: 'Europe/Berlin' },
    },
    // App Store screenshots (6.9" iPhone 1320×2868, 13" iPad 2064×2752): --project store-iphone --project store-ipad
    { name: 'store-iphone', grep: /@store/, timeout: 180_000, use: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'store-ipad', grep: /@store/, timeout: 180_000, use: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'node e2e/server.ts',
      cwd: '..',
      url: `http://127.0.0.1:${API}/healthz`,
      env: { E2E_API_PORT: String(API), E2E_TUTOR: process.env.E2E_TUTOR ?? '' },
      reuseExistingServer: !CI,
      stdout: 'ignore',
    },
    {
      command: `npm run preview -w @lumen/web -- --host 127.0.0.1 --port ${WEB} --strictPort`,
      cwd: '..',
      url: `http://127.0.0.1:${WEB}/`,
      env: { LUMEN_API_PROXY: `http://127.0.0.1:${API}` },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
