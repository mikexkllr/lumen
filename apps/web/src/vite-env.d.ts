/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/** Version of the store apps (apps/mobile/package.json), for crash reports. */
declare const __LUMEN_VERSION__: string;
interface ImportMetaEnv {
  /** Sentry DSN for crash reports; empty: no reports. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_LUMEN_PUBLIC_KEY?: string;
  /** '1' in end-to-end test builds (exposes a solve hook for the tests). */
  readonly VITE_LUMEN_E2E?: string;
  readonly VITE_LUMEN_ISSUES_URL?: string;
}
