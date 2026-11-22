# Lumen im App Store und bei Google Play veröffentlichen

Checkliste für die Store-Veröffentlichung der Capacitor-Apps aus `apps/mobile`
(technische Schritte: [apps/mobile/README.md](../apps/mobile/README.md)). Sie beschreibt,
was Lumen tatsächlich tut, und leitet daraus die Angaben für die Stores ab. Store-Regeln
ändern sich: vor jeder Einreichung die aktuellen Richtlinien gegenlesen. Diese Liste ist
keine Rechtsberatung – siehe [Abschnitt 9](#9-was-anwaltlich-geprüft-werden-muss).

## 1. Was Lumen an Daten verarbeitet (Grundlage für alle Angaben)

| Daten | Wann | Wohin | Verknüpft mit |
|---|---|---|---|
| Lernfortschritt, Einstellungen | immer | nur lokal auf dem Gerät (WebView-Speicher) | – |
| Lernereignisse (Versuche, XP, Tage, Zeitstempel) | nur mit Sync oder Social (optional) | Lumen-Server | zufälliger Sync-Code (gespeichert als SHA-256), keine E-Mail, keine Geräte-ID |
| Anzeigename, Handle, Avatar (vorgegebene Auswahl) | nur mit Social (optional, ab 16) | Lumen-Server | zufällige Nutzer-ID |
| Freundschaften, Reaktionen (feste Emoji-Auswahl), Meldungen, Blockierungen | nur mit Social | Lumen-Server | zufällige Nutzer-ID |
| Aufgabe, Antwort, Chat-Nachrichten an Lux | nur wenn das Sprachmodell an ist (abschaltbar, unter 16 nie) | Lumen-Server → Modellanbieter; der Lumen-Server speichert sie nicht | nicht mit dem Konto verknüpft (keine Kennung in der Anfrage) |
| IP-Adresse | jede Server-Anfrage | Lumen-Server: im Arbeitsspeicher für das Rate-Limit, bei Serverfehlern im Fehlerlog (rotiert); keine Zugriffslogs | – |

Keine Werbung, kein Tracking, keine Analytics-, Crash- oder Werbe-SDKs, keine
Drittanbieter-Logins, keine Käufe. Lokale Benachrichtigungen (falls aktiviert) werden auf
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
- [ ] **Icons und Splash** mit `npm run assets -w @lumen/mobile` erzeugen (Quelle
      `apps/mobile/assets/logo.png`); Store-Icons: Apple 1024 × 1024 ohne Transparenz,
      Google 512 × 512
- [ ] **Screenshots** echter Bildschirme (Lektion mit interaktiver Aufgabe, Lux, Wiederholung,
      Profil/Streak, Liga); Apple: 6,9″-iPhone (1320 × 2868), bei iPad-Unterstützung auch
      13″-iPad (sonst in Xcode nur iPhone als Gerät wählen); Google: mind. 2 Telefon-Screenshots
      und eine Feature-Grafik 1024 × 500
- [ ] **Streak-Erinnerungen** über `@capacitor/local-notifications` in der Web-App anbinden
      (Opt-in, Uhrzeit wählbar). Stand jetzt ist das Plugin nur vorbereitet; ohne native
      Funktion steigt das Risiko einer Ablehnung nach Apple 4.2 (siehe unten)
- [ ] **Melden-Funktion für Lux-Antworten** einbauen, falls noch nicht vorhanden (Google-Play-
      Richtlinie für KI-generierte Inhalte, siehe Abschnitt 5)
- [ ] **Einwilligung vor der ersten Lux-Nutzung mit Sprachmodell** (Hinweis auf den
      Modellanbieter, ausdrückliche Zustimmung; Apple 5.1.2(i) verlangt das für die Weitergabe
      personenbezogener Daten an KI-Dienste Dritter)
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
| Nutzungsdaten → Produktinteraktion | Lernereignisse (Sync/Social) |
| Nutzerinhalte → Andere Nutzerinhalte | Social-Interaktionen, Meldungen; Lux-Nachrichten |

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
  (siehe Abschnitt 2 – vor der Einreichung umsetzen)
- **5.1.1(v) Kontolöschung** – wer ein Konto anlegen kann, muss es in der App löschen können:
  **Profil → Serverdaten löschen** löscht Lernereignisse und Social-Profil. In den Review-Notizen
  den Weg beschreiben
- **5.1.1 / 5.1.2 Datenschutz** – Datenschutzerklärung in App Store Connect und in der App
  (`#/legal/privacy`); Daten nur für die App-Funktion; Weitergabe an den Modellanbieter nur
  nach Einwilligung (Abschnitt 2)
- **Sign in with Apple** – nicht nötig, Lumen hat keine Drittanbieter-Logins
- **Review-Notizen:** keine Anmeldung nötig; Social über Profil aktivieren (ab 16); wo Melden
  und Blockieren sitzen; Hinweis, dass die App offline funktioniert

## 4. Google Play

### Konto und Signatur

- [ ] Play-Console-Konto (einmalig 25 USD), Identitätsprüfung; für Organisationen D-U-N-S-Nummer
- [ ] Neue **private** Entwicklerkonten müssen vor der Produktionsfreigabe einen geschlossenen
      Test mit mindestens 12 Testenden über 14 Tage durchführen – früh einplanen
- [ ] **Play App Signing** aktivieren; Upload-Schlüssel sicher und außerhalb des Repos aufbewahren
- [ ] Android App Bundle (`.aab`) hochladen; die aktuelle Target-API-Anforderung prüfen
      (Capacitor 8 setzt ein aktuelles `targetSdkVersion`)
- [ ] Händlerstatus/Kontaktdaten gemäß DSA im Konto angeben (werden bei Händlern angezeigt)

### Datensicherheit („Data safety“)

- Daten werden erhoben: **Ja**; mit Dritten geteilt: **Nein** (Hoster und Modellanbieter
  verarbeiten im Auftrag – das gilt bei Google nicht als „Teilen“)
- Verschlüsselung bei der Übertragung: **Ja** (nur HTTPS)
- Nutzer:innen können die Löschung beantragen: **Ja** (in der App; zusätzlich eine Web-URL
  angeben, die den Löschweg beschreibt, z. B. den Abschnitt in der Datenschutzerklärung oder
  die Web-App unter `https://<domain>`, die mit demselben Sync-Code löschen kann)
- Alle Datentypen sind **optional** und dienen der **App-Funktionalität**:

| Google-Kategorie | Lumen |
|---|---|
| Personenbezogene Daten → Name | Anzeigename (Social) |
| Personenbezogene Daten → Nutzer-IDs | zufällige Nutzer-ID, Handle |
| App-Aktivitäten → App-Interaktionen | Lernereignisse (Sync/Social) |
| App-Aktivitäten → Sonstige nutzergenerierte Inhalte | Social-Interaktionen, Meldungen, Lux-Nachrichten |

Lux-Nachrichten nur dann als „flüchtig verarbeitet“ angeben, wenn der gewählte
Modellanbieter vertraglich nichts speichert.

### Einstufung, Zielgruppe, Richtlinien

- [ ] **Altersfreigabe (IARC-Fragebogen):** Interaktion zwischen Nutzer:innen **ja**
      (Social), nutzergenerierte Inhalte **ja** (Namen), Standortweitergabe **nein**, digitale
      Käufe **nein**, Werbung **nein**
- [ ] **Zielgruppe:** Altersgruppen ab 13 wählen. Wer Kinder unter 13 als Zielgruppe angibt,
      muss die **Families-Richtlinie** vollständig erfüllen (u. a. Anforderungen an KI-Funktionen,
      soziale Funktionen und Inhalte). Auch Store-Texte und Grafiken sollen nicht primär Kinder
      ansprechen, sonst kann Google die Families-Pflichten trotzdem verlangen. Lumen schützt
      Jüngere zusätzlich in der App: Kindermodus unter 16 ohne Social, nur Regel-Tutor, Sync nur
      mit Zustimmung eines Elternteils
- [ ] **Nutzergenerierte Inhalte (UGC-Richtlinie):** Nutzungsbedingungen mit Regeln für
      unzulässige Inhalte, die vor der Nutzung akzeptiert werden; Melden und Blockieren in der
      App; laufende Moderation (Admin-Endpunkte). Lumen erfüllt das mit Namensfilter, Melden,
      Blockieren, Sperren und der Bestätigung der Community-Regeln beim Anlegen des Profils
- [ ] **KI-generierte Inhalte:** Apps mit generativer KI müssen das Melden anstößiger
      KI-Antworten in der App ermöglichen, ohne die App zu verlassen – für Lux eine
      „Antwort melden“-Funktion vorsehen (siehe Abschnitt 2)
- [ ] **App-Zugriff:** keine Anmeldung nötig; **Werbung:** nein
- [ ] Kontolöschung ist in der App möglich (Profil → Serverdaten löschen)

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
