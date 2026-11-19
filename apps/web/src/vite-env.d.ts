/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
interface ImportMetaEnv {
  readonly VITE_LUMEN_PUBLIC_KEY?: string;
  readonly VITE_LUMEN_SYNC_URL?: string;
  readonly VITE_LUMEN_ISSUES_URL?: string;
}
