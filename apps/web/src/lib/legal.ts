/**
 * Legal pages (privacy notice, terms with community rules, legal notice).
 * Templates that describe what this code actually does; the operator fills in
 * name, address, contact, phone and VAT id at build time (VITE_LUMEN_OPERATOR,
 * VITE_LUMEN_OPERATOR_ADDRESS, VITE_LUMEN_CONTACT, VITE_LUMEN_PHONE,
 * VITE_LUMEN_VAT_ID) and should have the texts reviewed before running a public service.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const OPERATOR = {
  name: env.VITE_LUMEN_OPERATOR || '',
  address: (env.VITE_LUMEN_OPERATOR_ADDRESS || '').replace(/\\n/g, '\n'),
  contact: env.VITE_LUMEN_CONTACT || '',
  phone: env.VITE_LUMEN_PHONE || '',
  vatId: env.VITE_LUMEN_VAT_ID || '',
};

/** Crash reports are on when the build has a Sentry DSN (see lib/monitoring.ts). */
const CRASH_REPORTS = !!env.VITE_SENTRY_DSN;

/** `delete`: how to delete the account (linked from the store listings, e.g. Google Play data safety). */
export type LegalPage = 'privacy' | 'terms' | 'imprint' | 'delete';
export interface LegalSection {
  h: string;
  body: string;
}

const op = (de: boolean) => {
  const missing = de ? '[Betreiber noch nicht eingetragen]' : '[operator not configured]';
  return [OPERATOR.name || missing, OPERATOR.address, OPERATOR.contact ? (de ? `E-Mail: ${OPERATOR.contact}` : `Email: ${OPERATOR.contact}`) : '', OPERATOR.phone ? (de ? `Telefon: ${OPERATOR.phone}` : `Phone: ${OPERATOR.phone}`) : ''].filter(Boolean).join('\n');
};

export function legalText(page: LegalPage, locale: string): LegalSection[] {
  const de = locale.startsWith('de');
  if (page === 'delete') {
    const contact = OPERATOR.contact;
    return de
      ? [
          { h: 'Dein Lumen-Konto löschen', body: 'Du kannst dein Konto bei Lumen – Microlearning und alle Daten dazu jederzeit selbst löschen, ohne uns zu schreiben – in der App (Android, iOS) oder in der Web-App unter lumen.mikekeller.cloud/app.' },
          { h: 'So geht’s', body: '1. Lumen öffnen und mit derselben E-Mail-Adresse (oder mit Apple) anmelden wie bisher.\n2. Unten auf **Profil** tippen.\n3. **Konto löschen** wählen und bestätigen.' },
          { h: 'Was gelöscht wird', body: 'Sofort und endgültig, auf dem Server und auf dem Gerät:\n\n- dein Lernfortschritt (Lektionen, Antworten, XP, Serie)\n- dein Community-Profil (Name, Handle, Avatar), Freundschaften, Anfragen, Reaktionen, Ligaplätze und Neuigkeiten\n- Meldungen, die du abgeschickt hast\n- deine Anmeldungen (Prüfwert der E-Mail-Adresse, Apple-Kennung); die Anmeldung bei Apple wird widerrufen' },
          { h: 'Was bleibt', body: 'Nur ein Hashwert deines gelöschten Kontoschlüssels, damit er sich nie wieder anmelden kann, und Meldungen anderer über dein Profil, solange die Moderation sie braucht. Fehlerberichte enthalten kein Konto, keinen Namen und keine E-Mail-Adresse und werden nach höchstens 90 Tagen automatisch gelöscht. Der Server legt keine Sicherungskopien deiner Daten an.' },
          { h: 'Nur einen Teil löschen', body: 'Unter **Profil → Community-Profil löschen** entfernst du nur die Community-Daten und behältst deinen Lernfortschritt. Gespräche mit Lux werden auf dem Server nicht gespeichert; Lux lässt sich im Profil abschalten.' },
          ...(contact ? [{ h: 'Hilfe', body: `Kannst du dich nicht mehr anmelden? Schreib an ${contact} – am besten von der E-Mail-Adresse deines Kontos.` }] : []),
        ]
      : [
          { h: 'Delete your Lumen account', body: 'You can delete your Lumen – Microlearning account and all data linked to it at any time yourself, without writing to us – in the app (Android, iOS) or in the web app at lumen.mikekeller.cloud/app.' },
          { h: 'How', body: '1. Open Lumen and sign in with the same email address (or Apple) as before.\n2. Tap **Profile** at the bottom.\n3. Choose **Delete account** and confirm.' },
          { h: 'What is deleted', body: 'Immediately and for good, on the server and on the device:\n\n- your learning progress (lessons, answers, XP, streak)\n- your community profile (name, handle, avatar), friendships, requests, reactions, league places and feed items\n- reports you sent\n- your sign-ins (check value of your email address, Apple identifier); the Apple sign-in is revoked' },
          { h: 'What is kept', body: 'Only a hash of your deleted account key, so that it can never sign in again, and reports by others about your profile while moderation needs them. Crash reports contain no account, name or email address and are deleted automatically after at most 90 days. The server keeps no backup copies of your data.' },
          { h: 'Delete only some data', body: '**Profile → Delete community profile** removes only the community data and keeps your learning progress. Chats with Lux are not stored on the server; Lux can be switched off in the profile.' },
          ...(contact ? [{ h: 'Help', body: `Can’t sign in any more? Write to ${contact} – ideally from the email address of your account.` }] : []),
        ];
  }
  if (page === 'imprint') {
    return de
      ? [
          { h: 'Angaben gemäß § 5 DDG', body: op(true) },
          ...(OPERATOR.vatId ? [{ h: 'Umsatzsteuer-ID', body: `Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${OPERATOR.vatId}` }] : []),
          ...(OPERATOR.name ? [{ h: 'Verantwortlich für den Inhalt', body: `Verantwortlich gemäß § 18 Abs. 2 MStV: ${OPERATOR.name}${OPERATOR.address ? `, ${OPERATOR.address.split('\n').slice(0, 2).join(', ')}` : ''}` }] : []),
          { h: 'Inhalte', body: 'Die Lerninhalte stehen unter CC BY-SA 4.0, der Quellcode der App unter AGPL-3.0-or-later. Lumen ist ein Open-Source-Projekt; diese Instanz wird vom oben genannten Betreiber betrieben.' },
        ]
      : [
          { h: 'Operator', body: op(false) },
          ...(OPERATOR.vatId ? [{ h: 'VAT ID', body: `VAT identification number (§ 27a UStG): ${OPERATOR.vatId}` }] : []),
          ...(OPERATOR.name ? [{ h: 'Responsible for content', body: `Responsible under § 18(2) MStV: ${OPERATOR.name}${OPERATOR.address ? `, ${OPERATOR.address.split('\n').slice(0, 2).join(', ')}` : ''}` }] : []),
          { h: 'Content', body: 'Lessons are licensed under CC BY-SA 4.0, the app’s source code under AGPL-3.0-or-later. Lumen is an open-source project; this instance is run by the operator named above.' },
        ];
  }
  if (page === 'terms') {
    return de
      ? [
          { h: 'Geltungsbereich', body: `Diese Bedingungen gelten für die Nutzung dieser Lumen-Instanz, betrieben von:\n${op(true)}` },
          { h: 'Leistung', body: 'Lumen ist kostenlos und werbefrei. Für die Nutzung meldest du dich mit Apple oder per E-Mail-Code an; dein Lernfortschritt wird in deinem Konto gesichert, Lektionen funktionieren danach auch offline. Der KI-Tutor Lux und die Community (Freunde, Ligen, Neuigkeiten) lassen sich abschalten bzw. löschen, dein Konto jederzeit im Profil. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.' },
          { h: 'Community-Regeln', body: '- Wähle einen Anzeigenamen und Benutzernamen, die niemanden beleidigen, belästigen oder diskriminieren und keine Werbung oder Links enthalten.\n- Gib dich nicht als eine andere Person oder als Team von Lumen aus.\n- Nutze Anstupsen und Reaktionen freundlich, nicht um andere zu bedrängen.\n- Manipuliere keine Ligen, etwa durch erfundene Lernereignisse oder mehrere Konten.\n- Die Community ist für Personen ab 16 Jahren.' },
          { h: 'Melden, Blockieren, Moderation', body: 'Jedes Profil lässt sich melden und blockieren. Blockierte Personen sehen dich nirgends mehr. Meldungen prüft der Betreiber; bei Verstößen kann er Namen zurücksetzen oder Profile sperren. Gesperrte Profile erscheinen nicht mehr bei anderen.' },
          { h: 'Haftung', body: 'Die Inhalte werden sorgfältig erstellt und automatisch geprüft, trotzdem können Fehler vorkommen. Der KI-Tutor kann sich irren. Für leichte Fahrlässigkeit wird nur bei Verletzung wesentlicher Pflichten gehaftet, soweit gesetzlich zulässig.' },
          { h: 'Lizenzen', body: 'Lerninhalte: CC BY-SA 4.0. Code der App und des Servers: AGPL-3.0-or-later. Name und Logo: siehe TRADEMARK.md im Quellcode.' },
        ]
      : [
          { h: 'Scope', body: `These terms apply to this Lumen instance, run by:\n${op(false)}` },
          { h: 'Service', body: 'Lumen is free and ad-free. To use it you sign in with Apple or with a code sent by email; your learning progress is kept in your account, and lessons then also work offline. The AI tutor Lux and the community (friends, leagues, feed) can be switched off or deleted, and your account can be deleted at any time in your profile. There is no guarantee of constant availability.' },
          { h: 'Community rules', body: '- Choose a display name and username that do not insult, harass or discriminate against anyone and contain no advertising or links.\n- Do not pretend to be someone else or the Lumen team.\n- Use nudges and reactions kindly, not to pressure others.\n- Do not manipulate leagues, e.g. with made-up learning events or multiple accounts.\n- The community is for people aged 16 and older.' },
          { h: 'Reporting, blocking, moderation', body: 'Every profile can be reported and blocked. Blocked people no longer see you anywhere. The operator reviews reports and may reset names or suspend profiles that break the rules. Suspended profiles are hidden from everyone else.' },
          { h: 'Liability', body: 'Lessons are written carefully and checked automatically, but mistakes can happen. The AI tutor can be wrong. Liability for slight negligence is limited to breaches of essential obligations, as far as the law allows.' },
          { h: 'Licences', body: 'Lessons: CC BY-SA 4.0. App and server code: AGPL-3.0-or-later. Name and logo: see TRADEMARK.md in the source code.' },
        ];
  }
  return de
    ? [
        { h: 'Verantwortlich', body: op(true) },
        { h: 'Grundsatz', body: `So wenig Daten wie möglich: Dein Lernfortschritt ist ein Ereignisprotokoll auf deinem Gerät, das die App in deinem Lumen-Konto sichert. Es gibt keine Werbung, kein Tracking und keine Analyse-Dienste${CRASH_REPORTS ? '; Fehlerberichte (siehe unten) enthalten nichts über dich.' : '.'}` },
        { h: 'Konto und Lernfortschritt', body: 'Der Server speichert deine Lernereignisse (welche Aufgabe, richtig/falsch, Zeitpunkt, Dauer) unter einem Hashwert des Geräteschlüssels, den die App bei der Anmeldung erhält – ohne Name oder Passwort. So ist dein Fortschritt gesichert und auf jedem Gerät verfügbar, auf dem du dich anmeldest. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung der App). Unter 16 Jahren nur mit Einwilligung eines Elternteils (Art. 8 DSGVO); die App fragt danach.' },
        { h: 'Anmelden mit Apple oder E-Mail', body: 'Du meldest dich mit »Mit Apple anmelden« (iOS-App) oder mit einem Code per E-Mail an. Bei Apple erhalten wir weder Namen noch E-Mail-Adresse, nur eine anonyme Kennung von Apple; davon speichern wir einen Hashwert. Deine E-Mail-Adresse nutzen wir nur, um dir den Code zu schicken (über den Mailserver des Betreibers); gespeichert wird nur ein mit einem Geheimschlüssel berechneter Prüfwert der Adresse und der Code für höchstens 10 Minuten. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Im Profil kannst du eine zweite Anmeldeart verknüpfen; beim Löschen des Kontos wird alles entfernt und die Anmeldung bei Apple widerrufen.' },
        { h: 'Community (ab 16)', body: 'Ab 16 legt die App mit dem Anzeigenamen, den du beim Einrichten wählst, ein Community-Profil an (du kannst das überspringen). Mit dem Profil verarbeitet der Server zusätzlich Anzeigenamen, Benutzernamen, Avatar, Freundschaften, Blockierungen, Reaktionen, Anstupser, Liga-Platzierungen und Meldungen. Aus deinen Lernereignissen berechnet er Serie, XP pro Tag und Woche sowie dein Level. Freund:innen sehen Name, Avatar, Serie, XP, Level und Liga; Mitglieder deiner Liga sehen Name, Avatar und Wochen-XP. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Meldungen werden zur Moderation gespeichert (Art. 6 Abs. 1 lit. f DSGVO, Schutz der Nutzer:innen).' },
        { h: 'KI-Tutor Lux', body: 'Fragst du Lux, sendet die App die Aufgabe, deine Antwort und deine Nachricht an den Lumen-Server, der sie an das vom Betreiber eingestellte Sprachmodell weitergibt. Der Server protokolliert keine Inhalte, nur ggf. den Grund, warum der Regel-Tutor antworten musste. Vor der ersten Antwort des Modells fragt die App nach deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO); welches Modell und welcher Anbieter das sind, steht im folgenden Abschnitt; du kannst sie in den Einstellungen widerrufen. Hinterlegst du einen eigenen API-Schlüssel, gehen Aufgabe, Antwort und Nachrichten direkt von deinem Gerät an den von dir gewählten Anbieter; der Schlüssel bleibt auf dem Gerät, für die Verarbeitung dort gelten dessen Bedingungen. Unter 16 antwortet nur der Regel-Tutor. Meldest du eine Antwort, speichert der Server diese Antwort, deine Frage davor und die Aufgabe ohne Bezug zu deinem Konto zur Prüfung, höchstens 180 Tage.' },
        { h: 'Anderer Server', body: 'Meldest du dich bei einem anderen Lumen-Server an, gehen Konto, Community und Lux-Anfragen an diesen Server; verantwortlich ist dann dessen Betreiber.' },
        ...(CRASH_REPORTS ? [{ h: 'Fehlerberichte', body: 'Tritt in der App oder auf dem Server ein technischer Fehler auf, geht ein Fehlerbericht an den Dienst Sentry (Functional Software, Inc., USA) als Auftragsverarbeiter; gespeichert wird er in der EU (Rechenzentrum Frankfurt). Der Bericht enthält die Fehlermeldung, die Stelle im Code, App-Version, Gerätetyp, Betriebssystem und Browser sowie die letzten Schritte in der App – keinen Namen, keine E-Mail-Adresse, keine Antworten, kein Konto; IP-Adressen werden nicht gespeichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (eine stabile, fehlerfreie App). Für mögliche Zugriffe aus den USA gelten das EU-US Data Privacy Framework und EU-Standardvertragsklauseln. Berichte werden nach höchstens 90 Tagen gelöscht.' }] : []),
        { h: 'Erinnerungen', body: 'In der App für iOS und Android plant das Gerät tägliche Erinnerungen lokal. Dafür werden keine Daten an einen Server oder Push-Dienst gesendet.' },
        { h: 'Server-Protokolle', body: 'Zur Abwehr von Missbrauch zählt der Server Anfragen pro IP-Adresse eine Minute lang im Arbeitsspeicher. Technische Fehlermeldungen werden ohne Geräteschlüssel gespeichert.' },
        { h: 'Speicherdauer und Löschung', body: 'Daten bleiben, bis du sie löschst: Profil → »Community-Profil löschen« entfernt alle Community-Daten, »Konto löschen« entfernt zusätzlich alle Lernereignisse und Anmeldungen auf dem Server und auf dem Gerät. Beim Abmelden werden die Daten auf dem Gerät entfernt, dein Konto bleibt. Den Export deiner Daten findest du ebenfalls im Profil.' },
        { h: 'Deine Rechte', body: 'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Da der Server weder Namen noch E-Mail-Adresse speichert, kann der Betreiber Anfragen nur zuordnen, wenn du sie aus der App heraus stellst oder deine Anmeldung nachweist.' },
      ]
    : [
        { h: 'Controller', body: op(false) },
        { h: 'Principle', body: `As little data as possible: your progress is an event log on your device that the app backs up to your Lumen account. There are no ads, no tracking and no analytics${CRASH_REPORTS ? '; crash reports (see below) contain nothing about you.' : '.'}` },
        { h: 'Account and progress', body: 'The server stores your learning events (which problem, right/wrong, time, duration) under a hash of the device key the app receives when you sign in – without name or password. This keeps your progress safe and available on every device you sign in on. Legal basis: Art. 6(1)(b) GDPR (providing the app). Under 16 only with a parent’s consent (Art. 8 GDPR); the app asks for it.' },
        { h: 'Sign in with Apple or email', body: 'You sign in with “Sign in with Apple” (iOS app) or with a code sent by email. Apple gives us neither your name nor your email address, only an anonymous Apple identifier; we store a hash of it. We use your email address only to send you the code (through the operator’s mail server); we store only a keyed check value of the address and the code for at most 10 minutes. Legal basis: Art. 6(1)(b) GDPR. In your profile you can link a second way to sign in; deleting your account removes everything and revokes the Apple sign-in.' },
        { h: 'Community (16+)', body: 'From 16, the app creates a community profile with the display name you choose during setup (you can skip this). With the profile the server also processes your display name, username, avatar, friendships, blocks, reactions, nudges, league placements and reports. From your learning events it computes your streak, XP per day and week, and your level. Friends see your name, avatar, streak, XP, level and league; members of your league see your name, avatar and weekly XP. Legal basis: Art. 6(1)(b) GDPR. Reports are stored for moderation (Art. 6(1)(f) GDPR, protecting users).' },
        { h: 'AI tutor Lux', body: 'When you ask Lux, the app sends the problem, your answer and your message to the Lumen server, which forwards them to the language model configured by the operator. The server does not log content, only the reason when the rule tutor had to answer. Before the model answers for the first time, the app asks for your consent (Art. 6(1)(a) GDPR); the next section names the model and provider; you can withdraw it in the settings. If you add your own API key, the task, your answer and messages go directly from your device to the provider you chose; the key stays on the device and that provider’s terms apply. Under 16 only the rule tutor answers. If you report a reply, the server stores that reply, your question before it and the task, not linked to your account, for review – at most 180 days.' },
        { h: 'Other server', body: 'If you sign in to another Lumen server, your account, community and Lux requests go to that server; its operator is then responsible.' },
        ...(CRASH_REPORTS ? [{ h: 'Crash reports', body: 'When a technical error happens in the app or on the server, an error report goes to the service Sentry (Functional Software, Inc., USA) as a processor; it is stored in the EU (Frankfurt data centre). The report contains the error message, the place in the code, app version, device type, operating system and browser and the last steps in the app – no name, no email address, no answers, no account; IP addresses are not stored. Legal basis: Art. 6(1)(f) GDPR (a stable, working app). Possible access from the USA is covered by the EU-US Data Privacy Framework and EU standard contractual clauses. Reports are deleted after at most 90 days.' }] : []),
        { h: 'Reminders', body: 'In the iOS and Android app the device schedules daily reminders locally. No data is sent to a server or push service for this.' },
        { h: 'Server logs', body: 'To prevent abuse the server counts requests per IP address for one minute, in memory only. Technical errors are logged without the device key.' },
        { h: 'Retention and deletion', body: 'Data stays until you delete it: Profile → “Delete community profile” removes all community data, “Delete account” also removes all learning events and sign-ins on the server and on the device. Signing out removes the data from the device and keeps your account. You can export your data in the profile, too.' },
        { h: 'Your rights', body: 'You have the right to access, rectification, erasure, restriction, data portability and objection (Art. 15–21 GDPR) and to lodge a complaint with a supervisory authority. As the server stores neither your name nor your email address, the operator can only match requests made from within the app or with proof of your sign-in.' },
      ];
}
