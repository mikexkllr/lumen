# Lumen im App Store und bei Google Play veröffentlichen

Checkliste für die Store-Veröffentlichung der Capacitor-Apps aus `apps/mobile`
(technische Schritte: [apps/mobile/README.md](../apps/mobile/README.md)). Sie beschreibt,
was Lumen tatsächlich tut, und leitet daraus die Angaben für die Stores ab. Store-Regeln
ändern sich: vor jeder Einreichung die aktuellen Richtlinien gegenlesen. Diese Liste ist
keine Rechtsberatung – siehe [Abschnitt 9](#9-was-anwaltlich-geprüft-werden-muss).

## 1. Was Lumen an Daten verarbeitet (Grundlage für alle Angaben)

| Daten | Wann | Wohin | Verknüpft mit |
|---|---|---|---|
| Einstellungen | immer | nur lokal auf dem Gerät (WebView-Speicher) | – |
| Lernereignisse (Versuche, XP, Tage, Zeitstempel) | immer (die App startet mit der Anmeldung) | lokal und im Konto auf dem Lumen-Server | zufälliger Geräteschlüssel (gespeichert als SHA-256), keine Geräte-ID |
| E-Mail-Adresse | bei Anmeldung per E-Mail-Code | Lumen-Server → Mailserver (Code-Versand); gespeichert nur als HMAC-Prüfwert | Konto |
| Apple-Kennung (`sub`) | bei „Mit Apple anmelden“ | Lumen-Server, gespeichert als Hashwert | Konto |
| Anzeigename, Handle, Avatar (vorgegebene Auswahl) | ab 16, beim Einrichten (überspringbar) | Lumen-Server | zufällige Nutzer-ID |
| Freundschaften, Reaktionen (feste Emoji-Auswahl), Meldungen, Blockierungen | Community (ab 16) | Lumen-Server | zufällige Nutzer-ID |
| Fehlerberichte (Meldung, Stacktrace, App-Version, Gerätetyp, letzte Schritte) | bei technischen Fehlern | Sentry (EU-Region Frankfurt), Projekte `lumen-app` und `lumen-server` | nicht verknüpft: kein Nutzer, keine IP (in Sentry abgeschaltet), keine Request-Daten; E-Mails und Codes werden vorher entfernt |
| Aufgabe, Antwort, Chat-Nachrichten an Lux | nur wenn das Sprachmodell an ist (abschaltbar, unter 16 nie) | Lumen-Server → Modellanbieter; der Lumen-Server speichert sie nicht | nicht mit dem Konto verknüpft (keine Kennung in der Anfrage) |
| Aufgabe, Antwort, Chat-Nachrichten an Lux mit **eigenem Schlüssel** (optional) | nur wenn Nutzer:innen selbst einen API-Schlüssel hinterlegen | direkt vom Gerät zum selbst gewählten Anbieter; der Schlüssel bleibt auf dem Gerät | nicht mit dem Konto verknüpft |
| IP-Adresse | jede Server-Anfrage | Lumen-Server: im Arbeitsspeicher für das Rate-Limit, bei Serverfehlern im Fehlerlog (rotiert); keine Zugriffslogs | – |

Nutzer:innen können außerdem einen anderen Lumen-Server eintragen (*Profil → Server*);
dann gehen die Server-Daten aus der Tabelle an diesen Server statt an deinen. In den
Review-Notizen erwähnen: Standard ist dein Server, eigener Server und eigener KI-Schlüssel
sind optionale Einstellungen für Fortgeschrittene. Für Apple 5.1.2(i) gilt die Einrichtung
des eigenen Schlüssels als Einwilligung (der Hinweis nennt Anbieter und gesendete Daten).

Keine Werbung, kein Tracking, keine Analytics- oder Werbe-SDKs, keine Käufe. Einziges
Fremd-SDK ist Sentry für Fehlerberichte (nur Fehler, kein Tracing, kein Session-Replay).
Anmeldung nur mit Apple (Pflicht neben anderen Logins, Richtlinie 4.8) oder E-Mail-Code. Lokale Benachrichtigungen (falls aktiviert) werden auf
dem Gerät geplant, ohne Push-Dienst. Löschung: **Profil → Serverdaten löschen** entfernt
Lernereignisse und Social-Profil auf dem Server; lokal lässt sich alles in den
Einstellungen zurücksetzen.

## 2. Vorbereitung (beide Stores)

- [ ] **App-ID** festlegen (`capacitor.config.ts`, z. B. `de.example.lumen`) – danach unveränderbar
- [ ] **Store-Name** prüfen: muss im App Store eindeutig sein und darf keine fremden Marken
      enthalten (z. B. „Lumen – MINT lernen“); [TRADEMARK.md](../TRADEMARK.md) beachten
- [ ] **Keine fremden Marken in Store-Texten und Keywords** (Apple 2.3.7, Google-Play-Richtlinie
      zu Metadaten): Formulierungen wie „Alternative zu Brilliant“ aus der README nicht übernehmen
- [ ] **Produktiv-Server** läuft mit HTTPS ([deploy-vps.md](deploy-vps.md)), `LUMEN_CORS_ORIGINS`
      enthält `capacitor://localhost` und `https://localhost`, `LUMEN_ADMIN_TOKEN` ist gesetzt
- [ ] **Rechtstexte** befüllt (`VITE_LUMEN_OPERATOR`, `…_ADDRESS`, `…_CONTACT`) und geprüft.
      Datenschutz-URL für beide Stores: `https://<domain>/#/legal/privacy`
- [ ] **Support-URL** (Apple Pflicht): z. B. Issue-Tracker oder eine Kontaktseite
- [x] **Icons und Splash** zeichnet `node scripts/build-icons.ts` aus Lux (iOS, Android,
      Web, Store-Icons: Apple 1024 × 1024 ohne Transparenz, Google 512 × 512 und
      Feature-Grafik 1024 × 500 in `apps/mobile/store/play/`)
- [ ] **Screenshots** echter Bildschirme (Lektion mit interaktiver Aufgabe, Lux, Wiederholung,
      Profil/Streak, Liga); Apple: 6,9″-iPhone (1320 × 2868), bei iPad-Unterstützung auch
      13″-iPad (sonst in Xcode nur iPhone als Gerät wählen); Google: mind. 2 Telefon-Screenshots
      und eine Feature-Grafik 1024 × 500
- [x] **Streak-Erinnerungen** über `@capacitor/local-notifications` (Profil → Erinnerung:
      Uhrzeit wählen, die App fragt nach der Berechtigung). Lokal geplant für 14 Tage, entfällt
      für heute, sobald die Serie sicher ist. Auf echten Geräten testen (Android 13+: Berechtigung,
      iOS: Fokus-Modi)
- [x] **Melden-Funktion für Lux-Antworten:** »Antwort melden« unter jeder Antwort des
      Sprachmodells (Grund wählen, ohne die App zu verlassen); Moderation über
      `GET /api/v1/admin/tutor-reports` und `POST /api/v1/admin/tutor-reports/:id/resolve`
- [x] **Einwilligung vor der ersten Lux-Nutzung mit Sprachmodell:** Lux fragt vor der ersten
      Modell-Antwort, sagt, dass ein externer KI-Dienst antwortet, und bietet »Nur Hinweise aus der
      Lektion« an; widerrufbar im Profil (Apple 5.1.2(i)). Modell und Anbieter
      (`LUMEN_TUTOR_PROVIDER`, sonst der API-Host) nennt die Datenschutzerklärung, live vom Server abgefragt
- [ ] Testen auf echten Geräten: offline starten (Flugmodus), Sync, Social an/aus, Kindermodus,
      Konto löschen, helles/dunkles Design, große Schrift, Screenreader (VoiceOver/TalkBack)

## 3. Apple App Store

### Konto und Signatur

- [ ] Apple Developer Program (99 USD/Jahr); für eine Organisation wird eine D-U-N-S-Nummer gebraucht
- [ ] **EU-Händlerstatus (Digital Services Act)** in App Store Connect angeben. Als Händler
      werden Adresse, Telefonnummer und E-Mail im EU-App-Store öffentlich angezeigt
- [ ] Bundle ID im Developer-Portal anlegen (= App-ID), App in App Store Connect anlegen
- [ ] In Xcode automatische Signierung mit dem eigenen Team; Upload über *Product → Archive*
- [ ] `ios/App/App/PrivacyInfo.xcprivacy` aus `apps/mobile/ios-PrivacyInfo.xcprivacy` übernehmen
      und mit dem Privacy Report von Xcode abgleichen
- [ ] **Exportkontrolle:** `ITSAppUsesNonExemptEncryption = NO` in `Info.plist`. Lumen nutzt
      nur HTTPS und die Standard-Kryptografie des Systems (SHA-256 und Ed25519 zur Prüfung der
      Content-Bundles) – das ist von der Dokumentationspflicht ausgenommen

### App-Datenschutz („App Privacy“)

- Tracking: **Nein** (keine Verknüpfung mit Daten Dritter zu Werbezwecken, keine Datenhändler)
- Erhobene Datentypen, jeweils Zweck **App-Funktionalität**, **mit der Identität verknüpft**,
  **nicht für Tracking**:

| Apple-Kategorie | Lumen |
|---|---|
| Kontaktinformationen → Name | Anzeigename (Social, optional, kann ein echter Name sein) |
| Kennungen → Nutzer-ID | zufällige Konto-/Nutzer-ID, Handle |
| Kontaktinformationen → E-Mail-Adresse | Anmeldung per Code (nur Hashwert gespeichert) |
| Nutzungsdaten → Produktinteraktion | Lernereignisse (im Konto gesichert) |
| Nutzerinhalte → Andere Nutzerinhalte | Social-Interaktionen, Meldungen; Lux-Nachrichten |

Zusätzlich **Diagnose → Crash-Daten und Sonstige Diagnosedaten** (Sentry): Zweck App-Funktionalität, **nicht** mit der
Identität verknüpft, nicht für Tracking.

Lux-Nachrichten sind nicht mit dem Konto verknüpft; sie werden vorsichtshalber unter
„Andere Nutzerinhalte“ mitgeführt, weil der Modellanbieter sie je nach Einstellung
vorübergehend speichern kann. Angaben und Privacy Manifest müssen übereinstimmen.

### Altersfreigabe

Den Fragebogen in App Store Connect ehrlich beantworten. Relevant für Lumen: **nutzergenerierte
Inhalte** (Anzeigenamen/Handles) und **soziale Funktionen** (Freunde, Ligen, Feed; keine
Freitext-Nachrichten, keine Bilder), **KI-Chat** (Lux, mit Leak-Schutz, unter 16 nur
Regel-Tutor), keine Werbung, kein uneingeschränkter Webzugang, keine Käufe. Das Ergebnis liegt
dadurch vermutlich über 4+. Die App **nicht in der Kategorie „Kinder“** einreichen (dort
gelten zusätzliche Pflichten, z. B. Elternschranken vor externen Links und Social-Funktionen);
Kategorie **Bildung**.

### Review-Richtlinien

- **1.2 Nutzergenerierte Inhalte** – verlangt Filter, Meldefunktion mit zeitnaher Reaktion,
  Blockieren und veröffentlichte Kontaktdaten. Lumen: Namensfilter beim Speichern; keine
  freien Texte oder Bilder, Reaktionen nur aus fester Emoji-Auswahl; Melden und Blockieren in
  der App; Moderation über `/api/v1/admin/*` (Sperren, Namen zurücksetzen); Kontakt im
  Impressum. Die Nutzungsbedingungen mit Community-Regeln werden beim Anlegen des Community-Profils
  per Checkbox bestätigt (zusammen mit »mindestens 16«). Meldungen mindestens täglich
  bearbeiten – Reviewer fragen danach
- **4.2 Mindestfunktionalität** – keine reine Website-Verpackung: alle Lektionen und
  Content-Bundles sind in der App enthalten und funktionieren offline; 31 interaktive
  Aufgabentypen, Wiederholung mit FSRS, Lux. Native Ergänzung: lokale Streak-Erinnerungen
  per Benachrichtigung (Profil → Erinnerung); in den Review-Notizen erwähnen
- **5.1.1(v) Kontolöschung** – wer ein Konto anlegen kann, muss es in der App löschen können:
  **Profil → Serverdaten löschen** löscht Lernereignisse und Social-Profil. In den Review-Notizen
  den Weg beschreiben
- **5.1.1 / 5.1.2 Datenschutz** – Datenschutzerklärung in App Store Connect und in der App
  (`#/legal/privacy`); Daten nur für die App-Funktion; Weitergabe an den Modellanbieter nur
  nach Einwilligung (Abschnitt 2)
- **Sign in with Apple** – nicht nötig, Lumen hat keine Drittanbieter-Logins
- **Review-Notizen:** keine Anmeldung nötig; Social über Profil aktivieren (ab 16); wo Melden
  und Blockieren sitzen; Hinweis, dass die App offline funktioniert

### Öffentliche Instanz: App und Pipeline

Die App des öffentlichen Servers heißt **Lumen – Microlearning** (Bundle-ID `cloud.mikekeller.lumen`,
App-ID 6838845184, Team 9G5PKNZCQF). Hauptsprache Englisch (USA), zusätzlich Deutsch; Kategorie
Bildung; ausdrücklich für alle Altersgruppen, nicht in der Kategorie „Kinder“.

Gebaut, signiert und hochgeladen wird im Job `ios` von `.github/workflows/ci.yml` (macOS-Runner):

| Auslöser | Ergebnis |
|---|---|
| grüner Push auf `main` | Build in TestFlight (Buildnummer = UTC-Zeit `yymmddHHMM`, steigt immer) |
| Tag `v1.2.3` | zusätzlich Version 1.2.3 zur Prüfung eingereicht, Veröffentlichung automatisch nach Freigabe; der Text der annotierten Tag-Nachricht wird zu „Neuigkeiten“ |

Release: `version` in `apps/mobile/package.json` erhöhen, committen, dann
`git tag -a v1.2.3 -m "Was neu ist …" && git push origin v1.2.3`. Der Job bricht ab, wenn Tag und
Version nicht passen. Einreichen, Version anlegen und Build zuordnen erledigt
`apps/mobile/scripts/asc.ts` über die App Store Connect API (`status` zeigt Versionen und Builds).

Secrets in der GitHub-Umgebung **app-store**:

| Secret | Inhalt |
|---|---|
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` | API-Schlüssel „Lumen CI“ (Rolle App-Manager) |
| `APPLE_DIST_P12_BASE64`, `APPLE_DIST_P12_PASSWORD` | eigenes Apple-Distribution-Zertifikat der Pipeline |
| `APPLE_PROFILE_BASE64` | App-Store-Profil „Lumen App Store CI“ |

Ein App-Manager-Schlüssel darf keine Cloud-Signierung, darum signiert die Pipeline manuell mit
eigenem Zertifikat und Profil. **Beide laufen am 24. 11. 2027 ab.** Erneuern (ohne Schlüsselbund):

```bash
openssl genrsa -out dist.key 2048
openssl req -new -key dist.key -out dist.csr -subj "/CN=Lumen CI/O=9G5PKNZCQF/C=DE"
export ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_P8=AuthKey_….p8
node apps/mobile/scripts/asc.ts create-certificate dist.csr dist.pem      # gibt die Zertifikats-ID aus
node apps/mobile/scripts/asc.ts create-profile cloud.mikekeller.lumen <Zertifikats-ID> "Lumen App Store CI" lumen.mobileprovision
openssl pkcs12 -export -legacy -inkey dist.key -in dist.pem -out dist.p12 -name "Lumen CI"
```

Danach die drei Signatur-Secrets neu setzen (`gh secret set … --env app-store`) und die Dateien löschen.
Das alte Profil im Developer-Portal entfernen, damit der Name eindeutig bleibt.

Die nativen Ergänzungen in `ios/`: App-Icon randlos aus `apps/mobile/assets/icon-ios.svg`
(`npm run assets` erzeugt sonst das runde Logo mit hellen Ecken – danach das Icon neu rendern),
Splash bleibt stehen, bis die Inhalte geladen sind (`apps/web/src/lib/splash.ts`),
`PrivacyInfo.xcprivacy`, `ITSAppUsesNonExemptEncryption = NO`, Sprachen en/de.

### Anmeldung (Apple und E-Mail)

Seit 1.0.0 startet die App mit der Anmeldung: „Mit Apple anmelden“ (nur iOS-App) oder ein
6-stelliger E-Mail-Code (überall, auch Web und Android ohne Google-Dienste). Sync-Codes gibt
es in der Oberfläche nicht mehr; ältere Codes funktionieren als Konto weiter.
Der Server speichert nur Hashwerte (Apple-Kennung, E-Mail mit `LUMEN_EMAIL_PEPPER`), keine
Adresse, keinen Namen. Für die öffentliche Instanz:

- App-ID `cloud.mikekeller.lumen` mit der Fähigkeit *Sign in with Apple*; das Profil
  „Lumen App Store CI“ enthält sie (nach Änderungen an Fähigkeiten neu erzeugen und das
  Secret `APPLE_PROFILE_BASE64` ersetzen).
- Schlüssel „Lumen Sign in with Apple“ (Key-ID PW2KACHDLF) liegt nur in der VPS-`.env`
  (`LUMEN_APPLE_*`); der Server widerruft damit die Apple-Anmeldung beim Löschen (Richtlinie 5.1.1(v)).
- Login-Mails gehen über den eigenen Mailserver von `noreply@mikekeller.cloud`
  (SPF und DKIM für mikekeller.cloud bei IONOS).
- App Privacy: zusätzlich *Kontaktinformationen → E-Mail-Adresse* (App-Funktionalität,
  verknüpft, kein Tracking) – gespeichert wird nur ein Hashwert, die Adresse wird aber übertragen.

## 4. Google Play

### Konto, Signatur und Pipeline

- [x] Play-Console-Konto (privat, Mike Keller). Neue Apps privater Konten brauchen vor der
      Produktionsfreigabe einen **geschlossenen Test mit mindestens 12 Testenden über 14 Tage**
- [x] **Upload-Schlüssel** (PKCS12, Alias `upload`): lokal in `~/Documents/Lumen Play upload key`,
      für CI als Secrets `ANDROID_UPLOAD_KEYSTORE_BASE64` und `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
      in der GitHub-Umgebung `google-play` (nur `main` und Tags `v*`). **Play App Signing**:
      Google signiert die Store-App mit eigenem Schlüssel; ein verlorener Upload-Schlüssel lässt
      sich in der Play Console zurücksetzen (*App-Integrität*)
- [x] Android App Bundle mit `targetSdkVersion` 36 (Capacitor 8), `minSdkVersion` 24
- [x] **Play-API ohne Schlüsseldatei:** Google-Cloud-Dienstkonto, das GitHub Actions über
      Workload Identity Federation (nur dieses Repository) annimmt; Variablen
      `PLAY_WIF_PROVIDER` und `PLAY_SERVICE_ACCOUNT` in der Umgebung `google-play`. Das
      Dienstkonto in der Play Console unter *Nutzer und Berechtigungen* für die App einladen
      (Releases in Test-Tracks, Store-Eintrag bearbeiten). Solange die App ein Entwurf ist,
      braucht der Store-Eintrag zusätzlich *Entwurfs-Apps bearbeiten und löschen* – nach der
      ersten Freigabe wieder entfernen
- [x] Kein Upload von Hand nötig: das Anlegen der App reserviert den Paketnamen. Solange die
      App nie veröffentlicht war, legt `play.ts` Releases im geschlossenen Test als Entwurf an;
      den ersten (1.0.1, 311) in der Play Console einführen und unter *Veröffentlichungsübersicht*
      zur Prüfung senden (am 25.11.2026 geschehen)
- Danach: Push auf `main` → interner Test, Tag `v1.2.3` → geschlossener Test (Track `alpha`,
  Google prüft); Store-Eintrag, Icon, Feature-Grafik und Screenshots über *Actions → Store
  screenshots* (`apps/mobile/scripts/play.ts listing`)
- [ ] Händlerstatus/Kontaktdaten gemäß DSA im Konto angeben (Frist laut Play Console: 1. Februar 2027)

### Datensicherheit („Data safety“)

- Daten werden erhoben: **Ja**; mit Dritten geteilt: **Nein** (Hoster und Modellanbieter
  verarbeiten im Auftrag – das gilt bei Google nicht als „Teilen“)
- Verschlüsselung bei der Übertragung: **Ja** (nur HTTPS)
- Nutzer:innen können die Löschung beantragen: **Ja** (in der App unter *Profil → Konto
  löschen*; Web-URL mit dem Löschweg: `https://lumen.mikekeller.cloud/app/#/legal/delete`)
- Alle Datentypen dienen der **App-Funktionalität** (Absturzdaten auch der Analyse):

| Google-Kategorie | Lumen | Pflicht |
|---|---|---|
| Personenbezogene Daten → E-Mail-Adresse | Anmeldung (gespeichert nur als Hashwert) | ja |
| Personenbezogene Daten → Nutzer-IDs | zufällige Nutzer-ID, Handle | ja |
| App-Aktivitäten → App-Interaktionen | Lernereignisse (im Konto gesichert) | ja |
| App-Info und -Leistung → Absturzprotokolle, Diagnose | Sentry | ja |
| Personenbezogene Daten → Name | Anzeigename (Social) | nein |
| App-Aktivitäten → Sonstige nutzergenerierte Inhalte | Social-Interaktionen, Meldungen, Lux-Nachrichten | nein |

Lux-Nachrichten nur dann als „flüchtig verarbeitet“ angeben, wenn der gewählte
Modellanbieter vertraglich nichts speichert.

### Einstufung, Zielgruppe, Richtlinien

- [x] **Altersfreigabe (IARC-Fragebogen):** Interaktion zwischen Nutzer:innen **ja**
      (Social), nutzergenerierte Inhalte **ja** (Namen), Standortweitergabe **nein**, digitale
      Käufe **nein**, Werbung **nein**
- [x] **Zielgruppe:** Altersgruppen ab 13 wählen. Wer Kinder unter 13 als Zielgruppe angibt,
      muss die **Families-Richtlinie** vollständig erfüllen (u. a. Anforderungen an KI-Funktionen,
      soziale Funktionen und Inhalte). Auch Store-Texte und Grafiken sollen nicht primär Kinder
      ansprechen, sonst kann Google die Families-Pflichten trotzdem verlangen. Lumen schützt
      Jüngere zusätzlich in der App: Kindermodus unter 16 ohne Social, nur Regel-Tutor, Sync nur
      mit Zustimmung eines Elternteils
- [ ] **Nutzergenerierte Inhalte (UGC-Richtlinie):** Nutzungsbedingungen mit Regeln für
      unzulässige Inhalte, die vor der Nutzung akzeptiert werden; Melden und Blockieren in der
      App; laufende Moderation (Admin-Endpunkte). Lumen erfüllt das mit Namensfilter, Melden,
      Blockieren, Sperren und der Bestätigung der Community-Regeln beim Anlegen des Profils
- [x] **KI-generierte Inhalte:** Apps mit generativer KI müssen das Melden anstößiger
      KI-Antworten in der App ermöglichen, ohne die App zu verlassen – Lux hat dafür
      »Antwort melden« (siehe Abschnitt 2)
- [x] **App-Zugriff:** die App startet mit der Anmeldung (E-Mail-Code; auf Android kein
      Apple) – für die Prüfung die Review-Adresse mit festem Code (`LUMEN_REVIEW_EMAIL`,
      `LUMEN_REVIEW_CODE` auf dem Server, kein Postfach nötig); **Werbung:** nein
- [x] Kontolöschung ist in der App möglich (Profil → Konto löschen), Web-Seite `#/legal/delete`

## 5. Kinder und Jugendliche

- Lumen richtet sich an Lernende jeden Alters, die Store-Zielgruppe sollte aber **ab 13**
  sein (Google) bzw. die App nicht in die Apple-Kategorie „Kinder“.
- In der App: unter 16 (DSGVO Art. 8) Kindermodus – kein Social, kein Sprachmodell, Sync nur
  mit Zustimmung eines Elternteils.
- Keine Drittanbieter-SDKs und kein Tracking – das bei Updates beibehalten; jedes neue SDK
  ändert Privacy Manifest, App-Privacy- und Data-safety-Angaben.

## 6. Inhalte und Lizenzen

- Lerninhalte stehen unter **CC BY-SA 4.0**: Weitergabe in Stores ist erlaubt; Namensnennung
  und Lizenzhinweis stehen im Impressum der App. Inhalte Dritter (falls übernommen) müssen
  kompatibel lizenziert sein – `npm run check` prüft die Lizenzangaben.
- Code: Engine/CLI MIT, App und Server **AGPL-3.0-or-later**. Die Nutzungsbedingungen des Apple
  App Store gelten als schwer vereinbar mit (A)GPL-Code, an dem Dritte Rechte halten (bekannt
  aus dem VLC-Fall 2011). Solange der App-Code nur von dir stammt, ist das unkritisch; bei
  Fremdbeiträgen (DCO, keine CLA) vor der iOS-Veröffentlichung klären, z. B. mit einer
  zusätzlichen Erlaubnis aller Rechteinhaber.
- Schriften (Inter, Atkinson Hyperlegible: OFL), KaTeX und React (MIT): Lizenzhinweise in der
  App bzw. im Quellcode-Link nennen.

## 7. Veröffentlichung

- [ ] Version erhöhen (Android `versionCode`/`versionName`, iOS Version/Build)
- [ ] `npm run sync -w @lumen/mobile` mit der Produktions-API-URL
- [ ] iOS: Archiv hochladen → TestFlight (interne Tests) → Einreichung mit Review-Notizen
- [ ] Android: interner Test → geschlossener Test → Produktion (gestaffelte Einführung)
- [ ] Nach Freigabe: Meldungen täglich prüfen, Server-Updates und Backups wie in
      [deploy-vps.md](deploy-vps.md)

## 8. Laufender Betrieb

- Store-Angaben bei jeder Änderung an Datenflüssen aktualisieren (neuer Modellanbieter,
  neue Social-Funktion, neues Plugin).
- Inhalte und Web-App kommen nur mit einem neuen App-Build in die Store-Apps (Lux, Sync und
  Social laufen über den Server und sind sofort aktuell).
- Kontaktadresse erreichbar halten; Apple und Google erwarten zeitnahe Reaktionen auf
  Meldungen und Löschanfragen.

## 9. Was anwaltlich geprüft werden muss

- **Impressum** (§ 5 DDG) und Angaben als Händler nach DSA in beiden Stores
- **Datenschutzerklärung** (Art. 13 DSGVO): Sync, Social, Lux mit Modellanbieter
  (Drittlandtransfer, z. B. USA), Server-Logs, Backups und deren Löschfristen,
  Einwilligung Minderjähriger (Art. 8 DSGVO)
- **Nutzungsbedingungen/AGB** mit Community-Regeln, Sperrgründen und Haftung
- **DSA-Pflichten als Hostingdienst** für nutzergenerierte Namen: Meldeverfahren (Art. 16) und
  Begründung von Sperren (Art. 17)
- **DSFA** (Art. 35 DSGVO) – Minderjährige, KI-Tutor, soziale Funktionen; Verzeichnis von
  Verarbeitungstätigkeiten; **AVV** mit Hoster und Modellanbieter
- **Marke** (Name „Lumen“ im Store, Kollisionen) und Lizenzfragen (AGPL im App Store, Abschnitt 6)
