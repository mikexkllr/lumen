import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(owner): replace with your own reverse-domain id BEFORE the first `cap add`.
  // It becomes the iOS bundle identifier and the Android applicationId and cannot
  // be changed after the first store upload.
  appId: 'org.lumen.app',
  appName: 'Lumen',
  // The PWA build (npm run build:web). Content bundles are copied into the app,
  // so lessons work offline from the first start.
  webDir: '../web/dist',
  // Origins the WebView serves the app from. The Lumen server must list them in
  // LUMEN_CORS_ORIGINS: capacitor://localhost (iOS) and https://localhost (Android).
  server: { androidScheme: 'https', iosScheme: 'capacitor', hostname: 'localhost' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#fbf8f2',
      showSpinner: false,
    },
    LocalNotifications: {
      iconColor: '#f5a524',
    },
  },
};

export default config;
