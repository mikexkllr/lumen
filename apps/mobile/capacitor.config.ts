import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // iOS bundle identifier and Android applicationId of the public Lumen apps.
  // Cannot be changed after the first store upload; forks use their own id.
  appId: 'cloud.mikekeller.lumen',
  appName: 'Lumen',
  // The PWA build (npm run build:web). Content bundles are copied into the app,
  // so lessons work offline from the first start.
  webDir: '../web/dist',
  // Origins the WebView serves the app from. The Lumen server must list them in
  // LUMEN_CORS_ORIGINS: capacitor://localhost (iOS) and https://localhost (Android).
  server: { androidScheme: 'https', iosScheme: 'capacitor', hostname: 'localhost' },
  plugins: {
    SplashScreen: {
      // Hidden by the web app once the content is loaded (apps/web/src/lib/splash.ts).
      launchAutoHide: false,
      backgroundColor: '#fbf8f2',
      showSpinner: false,
    },
    LocalNotifications: {
      // Android: Lux as a one-colour status bar icon (drawn by scripts/build-icons.ts)
      smallIcon: 'ic_stat_lumen',
      iconColor: '#6c5ce7',
    },
  },
};

export default config;
