# @lumen/mobile – iOS and Android apps (Capacitor)

This workspace wraps the Lumen PWA (`apps/web`) in a native shell with
[Capacitor 8](https://capacitorjs.com). The apps contain the complete web build
including all content bundles, so every lesson works offline from the first start.
Sync, Lux (language model) and social features talk to your Lumen server.

Store checklist (accounts, privacy answers, age rating, review guidelines):
[docs/store-release.md](../../docs/store-release.md) (German).

## Requirements

- Node.js ≥ 24 and `npm install` at the repository root
- Android: Android Studio with a current SDK and JDK (as required by Capacitor 8); minimum Android 7 (API 24)
- iOS: a Mac with Xcode (as required by Capacitor 8); minimum iOS 15
- A public Lumen server with HTTPS (see [docs/deploy-vps.md](../../docs/deploy-vps.md)) whose
  `LUMEN_CORS_ORIGINS` contains `capacitor://localhost` (iOS) and `https://localhost` (Android).
  `docker-compose.prod.yml` adds both by default.

## One-time setup

1. **Choose the app id.** Replace `org.lumen.app` in `capacitor.config.ts` with a
   reverse-domain id you control (e.g. `de.example.lumen`). It becomes the bundle id
   (iOS) and applicationId (Android) and cannot change after the first store upload.
   Respect [TRADEMARK.md](../../TRADEMARK.md) when you pick the store name.
2. **Build the web app** with an absolute API URL and your legal details
   (all commands from the repository root):

   ```bash
   export VITE_LUMEN_API_URL=https://lumen.example.org/api
   export VITE_LUMEN_OPERATOR="Erika Mustermann"
   export VITE_LUMEN_OPERATOR_ADDRESS='Musterstraße 1\n12345 Musterstadt'
   export VITE_LUMEN_CONTACT=kontakt@example.org
   npm run build:web -w @lumen/mobile
   ```

   `build:web` refuses relative or `http://` API URLs (set `LUMEN_ALLOW_HTTP=1` only for
   tests on a local network – the stores need HTTPS).
3. **Native projects:** `android/` and `ios/` are in the repository (generated once with
   `cap add`, then edited like ordinary source code: manifest, Info.plist, signing, icons).
   The copied web build inside them (`android/app/src/main/assets/public`,
   `ios/App/App/public`) is excluded by the `.gitignore` files that Capacitor generates.
4. **iOS additions** (Xcode, target *App*):
   - copy `ios-PrivacyInfo.xcprivacy` to `ios/App/App/PrivacyInfo.xcprivacy` and add it
     to the target; check it against Xcode's privacy report before each submission;
   - in `Info.plist` set `ITSAppUsesNonExemptEncryption` to `NO` (Lumen only uses HTTPS
     and the operating system's standard cryptography);
   - add the `Push Notifications` capability only if you later add remote push – local
     notifications do not need it.
5. **Icons and splash screens:** all of them are drawn from Lux, the robot, by
   `node scripts/build-icons.ts` (iOS app icon and splash, Android adaptive/themed/legacy
   icons, notification icon and splash, the Google Play icon and feature graphics in
   `store/play/`). Commit the generated files.

## Everyday workflow

```bash
npm run sync -w @lumen/mobile          # build:web + cap sync (copies web build and plugins)
npm run open:android -w @lumen/mobile  # Android Studio: run on a device, build the AAB
npm run open:ios -w @lumen/mobile      # Xcode: run on a device, Product → Archive
```

Run `sync` after every change to the web app or the content; the store build always
contains the content of that moment. The version comes from `package.json` (both apps);
CI sets the build number (iOS) and `versionCode` (Android, `-PlumenVersionCode`).

## Releases (CI)

| | push to `main` | tag `v1.2.3` |
|---|---|---|
| iOS (job `ios`) | TestFlight | App Review, released after approval (`scripts/asc.ts`) |
| Android (job `android`) | Google Play internal testing | closed testing (track `alpha`, reviewed by Google) (`scripts/play.ts`) |

Store screenshots and the Play listing: *Actions → Store screenshots* (`e2e/store.spec.ts`,
texts in `store/listing.json` and `store/play/listing.json`).

## Signing

- **Android:** upload key (PKCS12, alias `upload`) outside the repository (`*.jks` is never
  committed), Play App Signing re-signs for the store. `android/app/build.gradle` signs the
  release with `LUMEN_UPLOAD_KEYSTORE` (path), `LUMEN_UPLOAD_STORE_PASSWORD` (and optionally
  `LUMEN_UPLOAD_KEY_ALIAS`, `LUMEN_UPLOAD_KEY_PASSWORD`):
  `./gradlew bundleRelease -PlumenVersionCode=<n>` in `android/` (JDK 21, e.g. Android
  Studio's `Contents/jbr`). CI gets the key from the `google-play` environment.
- **iOS:** automatic signing in Xcode with your Apple Developer team; upload via
  *Product → Archive → Distribute App*.

## Plugins

| Plugin | Purpose |
|---|---|
| `@capacitor/app` | back button and app state (Android) |
| `@capacitor/splash-screen` | launch screen in the brand colour |
| `@capacitor/status-bar` | status bar style for light/dark mode |
| `@capacitor/local-notifications` | daily streak reminders, scheduled on the device (no server, no push service) |

Streak reminders are wired up in `apps/web/src/lib/reminders.ts`: when a learner picks a
time under *Profile → Reminder*, the app asks for notification permission and schedules
the next 14 days locally; today's reminder is dropped as soon as the streak is safe, and
everything is rescheduled whenever the app opens. In the browser the setting is shown but
disabled.

Android: the plugin declares the notification permission (Android 13+). Reminders are
scheduled as inexact alarms (`isExactNotification: false`), so a reminder may arrive a few
minutes late – fine for a daily nudge – and the manifest removes `SCHEDULE_EXACT_ALARM`,
which Google Play reserves for alarm and calendar apps (with exact alarms the plugin would
open the "Alarms & reminders" settings on every reschedule). The small icon is
`ic_stat_lumen` (Lux in one colour). Backups are off (`allowBackup="false"`): the WebView
storage holds the account's sign-in token.

## Notes

- The web build is the same for web and apps except for `VITE_LUMEN_API_URL`. Do not
  deploy the app build (absolute API URL) to the website unless that URL is your own
  origin.
- The PWA service worker is not needed inside the apps, because all files are already
  local; the web app should skip registering it when `window.Capacitor?.isNativePlatform()`
  is true, so an app update never serves files from an old service-worker cache.
- No third-party SDKs (analytics, ads, crash reporting) are included; keep it that way,
  or update the privacy manifest and the store privacy answers.
