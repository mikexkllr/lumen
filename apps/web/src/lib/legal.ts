/**
 * Legal pages (privacy notice, terms with community rules, legal notice).
 * Templates that describe what this code actually does; the operator fills in
 * name, address and contact at build time (VITE_LUMEN_OPERATOR,
 * VITE_LUMEN_OPERATOR_ADDRESS, VITE_LUMEN_CONTACT) and must have the texts
 * reviewed before running a public service.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const OPERATOR = {
  name: env.VITE_LUMEN_OPERATOR || '',
  address: (env.VITE_LUMEN_OPERATOR_ADDRESS || '').replace(/\\n/g, '\n'),
  contact: env.VITE_LUMEN_CONTACT || '',
};

export type LegalPage = 'privacy' | 'terms' | 'imprint';
export interface LegalSection {
  h: string;
  body: string;
}

const op = (de: boolean) => {
  const missing = de ? '[Betreiber noch nicht eingetragen]' : '[operator not configured]';
  return [OPERATOR.name || missing, OPERATOR.address, OPERATOR.contact ? (de ? `E-Mail: ${OPERATOR.contact}` : `Email: ${OPERATOR.contact}`) : ''].filter(Boolean).join('\n');
};

export function legalText(page: LegalPage, locale: string): LegalSection[] {
  const de = locale.startsWith('de');
  if (page === 'imprint') {
    return de
      ? [
          { h: 'Angaben gemäß § 5 DDG', body: op(true) },
          { h: 'Inhalte', body: 'Die Lerninhalte stehen unter CC BY-SA 4.0, der Quellcode der App unter AGPL-3.0-or-later. Lumen ist ein Open-Source-Projekt; diese Instanz wird vom oben genannten Betreiber betrieben.' },
        ]
      : [
          { h: 'Operator', body: op(false) },
          { h: 'Content', body: 'Lessons are licensed under CC BY-SA 4.0, the app’s source code under AGPL-3.0-or-later. Lumen is an open-source project; this instance is run by the operator named above.' },
        ];
  }
  if (page === 'terms') {
    return de
      ? [
          { h: 'Geltungsbereich', body: `Diese Bedingungen gelten für die Nutzung dieser Lumen-Instanz, betrieben von:\n${op(true)}` },
          { h: 'Leistung', body: 'Lumen ist kostenlos und werbefrei. Lernen funktioniert ohne Konto und offline. Synchronisation, der KI-Tutor Lux und die Community (Freunde, Ligen, Neuigkeiten) sind freiwillig und können jederzeit abgeschaltet oder gelöscht werden. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.' },
          { h: 'Community-Regeln', body: '- Wähle einen Anzeigenamen und Benutzernamen, die niemanden beleidigen, belästigen oder diskriminieren und keine Werbung oder Links enthalten.\n- Gib dich nicht als eine andere Person oder als Team von Lumen aus.\n- Nutze Anstupsen und Reaktionen freundlich, nicht um andere zu bedrängen.\n- Manipuliere keine Ligen, etwa durch erfundene Lernereignisse oder mehrere Konten.\n- Die Community ist für Personen ab 16 Jahren.' },
          { h: 'Melden, Blockieren, Moderation', body: 'Jedes Profil lässt sich melden und blockieren. Blockierte Personen sehen dich nirgends mehr. Meldungen prüft der Betreiber; bei Verstößen kann er Namen zurücksetzen oder Profile sperren. Gesperrte Profile erscheinen nicht mehr bei anderen.' },
          { h: 'Haftung', body: 'Die Inhalte werden sorgfältig erstellt und automatisch geprüft, trotzdem können Fehler vorkommen. Der KI-Tutor kann sich irren. Für leichte Fahrlässigkeit wird nur bei Verletzung wesentlicher Pflichten gehaftet, soweit gesetzlich zulässig.' },
          { h: 'Lizenzen', body: 'Lerninhalte: CC BY-SA 4.0. Code der App und des Servers: AGPL-3.0-or-later. Name und Logo: siehe TRADEMARK.md im Quellcode.' },
        ]
      : [
          { h: 'Scope', body: `These terms apply to this Lumen instance, run by:\n${op(false)}` },
          { h: 'Service', body: 'Lumen is free and ad-free. Learning works without an account and offline. Sync, the AI tutor Lux and the community (friends, leagues, feed) are optional and can be switched off or deleted at any time. There is no guarantee of constant availability.' },
          { h: 'Community rules', body: '- Choose a display name and username that do not insult, harass or discriminate against anyone and contain no advertising or links.\n- Do not pretend to be someone else or the Lumen team.\n- Use nudges and reactions kindly, not to pressure others.\n- Do not manipulate leagues, e.g. with made-up learning events or multiple accounts.\n- The community is for people aged 16 and older.' },
          { h: 'Reporting, blocking, moderation', body: 'Every profile can be reported and blocked. Blocked people no longer see you anywhere. The operator reviews reports and may reset names or suspend profiles that break the rules. Suspended profiles are hidden from everyone else.' },
          { h: 'Liability', body: 'Lessons are written carefully and checked automatically, but mistakes can happen. The AI tutor can be wrong. Liability for slight negligence is limited to breaches of essential obligations, as far as the law allows.' },
          { h: 'Licences', body: 'Lessons: CC BY-SA 4.0. App and server code: AGPL-3.0-or-later. Name and logo: see TRADEMARK.md in the source code.' },
        ];
  }
  return de
    ? [
        { h: 'Verantwortlich', body: op(true) },
        { h: 'Grundsatz', body: 'Lumen funktioniert ohne Konto. Dein Lernfortschritt liegt als Ereignisprotokoll in deinem Browser bzw. in der App auf deinem Gerät. Es gibt keine Werbung, kein Tracking, keine Analyse-Dienste und keine Drittanbieter-SDKs.' },
        { h: 'Synchronisation (freiwillig)', body: 'Wenn du einen Sync-Code erstellst, speichert der Server deine Lernereignisse (welche Aufgabe, richtig/falsch, Zeitpunkt, Dauer) unter einem Hashwert des Codes – ohne E-Mail, Name oder Passwort. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung der von dir gewünschten Funktion). Unter 16 Jahren nur mit Einwilligung eines Elternteils (Art. 8 DSGVO).' },
        { h: 'Community (freiwillig, ab 16)', body: 'Mit einem Community-Profil verarbeitet der Server zusätzlich Anzeigenamen, Benutzernamen, Avatar, Freundschaften, Blockierungen, Reaktionen, Anstupser, Liga-Platzierungen und Meldungen. Aus deinen Lernereignissen berechnet er Serie, XP pro Tag und Woche sowie dein Level. Freund:innen sehen Name, Avatar, Serie, XP, Level und Liga; Mitglieder deiner Liga sehen Name, Avatar und Wochen-XP. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Meldungen werden zur Moderation gespeichert (Art. 6 Abs. 1 lit. f DSGVO, Schutz der Nutzer:innen).' },
        { h: 'KI-Tutor Lux', body: 'Fragst du Lux, sendet die App die Aufgabe, deine Antwort und deine Nachricht an den Lumen-Server, der sie an das vom Betreiber eingestellte Sprachmodell weitergibt. Der Server protokolliert keine Inhalte, nur ggf. den Grund, warum der Regel-Tutor antworten musste. Du kannst das Modell in den Einstellungen abschalten; unter 16 antwortet nur der Regel-Tutor.' },
        { h: 'Server-Protokolle', body: 'Zur Abwehr von Missbrauch zählt der Server Anfragen pro IP-Adresse eine Minute lang im Arbeitsspeicher. Technische Fehlermeldungen werden ohne Sync-Code gespeichert.' },
        { h: 'Speicherdauer und Löschung', body: 'Daten bleiben, bis du sie löschst: Profil → »Community-Profil löschen« entfernt alle Community-Daten, »Daten auf dem Server löschen« entfernt zusätzlich alle Lernereignisse. Lokale Daten löschst du unter »Alle Daten löschen«. Den Export deiner Daten findest du ebenfalls im Profil.' },
        { h: 'Deine Rechte', body: 'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Da der Server dich nur über deinen Sync-Code kennt, kann der Betreiber Anfragen nur mit diesem Code zuordnen.' },
      ]
    : [
        { h: 'Controller', body: op(false) },
        { h: 'Principle', body: 'Lumen works without an account. Your progress is an event log stored in your browser or in the app on your device. There are no ads, no tracking, no analytics and no third-party SDKs.' },
        { h: 'Sync (optional)', body: 'If you create a sync code, the server stores your learning events (which problem, right/wrong, time, duration) under a hash of the code – without email, name or password. Legal basis: Art. 6(1)(b) GDPR (providing the feature you asked for). Under 16 only with a parent’s consent (Art. 8 GDPR).' },
        { h: 'Community (optional, 16+)', body: 'With a community profile the server also processes your display name, username, avatar, friendships, blocks, reactions, nudges, league placements and reports. From your learning events it computes your streak, XP per day and week, and your level. Friends see your name, avatar, streak, XP, level and league; members of your league see your name, avatar and weekly XP. Legal basis: Art. 6(1)(b) GDPR. Reports are stored for moderation (Art. 6(1)(f) GDPR, protecting users).' },
        { h: 'AI tutor Lux', body: 'When you ask Lux, the app sends the problem, your answer and your message to the Lumen server, which forwards them to the language model configured by the operator. The server does not log content, only the reason when the rule tutor had to answer. You can switch the model off in the settings; under 16 only the rule tutor answers.' },
        { h: 'Server logs', body: 'To prevent abuse the server counts requests per IP address for one minute, in memory only. Technical errors are logged without the sync code.' },
        { h: 'Retention and deletion', body: 'Data stays until you delete it: Profile → “Delete community profile” removes all community data, “Delete data on the server” also removes all learning events. Local data is removed with “Delete all data”. You can export your data in the profile, too.' },
        { h: 'Your rights', body: 'You have the right to access, rectification, erasure, restriction, data portability and objection (Art. 15–21 GDPR) and to lodge a complaint with a supervisory authority. As the server only knows you by your sync code, the operator can only match requests that include it.' },
      ];
}
