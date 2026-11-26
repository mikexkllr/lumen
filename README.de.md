# Lumen

🌐 [English](README.md) · **Deutsch**

**▶ Jetzt ausprobieren: [lumen.mikekeller.cloud](https://lumen.mikekeller.cloud/de/)** – mit E-Mail anmelden, ohne Passwort, ohne Download ([direkt zur App](https://lumen.mikekeller.cloud/app/)).

**Microlearning für Neugierige jeden Alters – von Jugendlichen bis zu Rentner:innen. Ein paar Minuten am Tag, zum Mitmachen: Mathe, Physik, Chemie, Biologie, Elektrotechnik, Informatik, Daten und KI. Kostenlos, werbefrei, offen, datensparsam.**

Lumen ist eine freie Lern-App mit kurzen, interaktiven Aufgaben und sofortigem Feedback – im Browser und als iOS-App. Sie ist für alle gemacht, die verstehen wollen, wie Dinge funktionieren: Erwachsene, die nachholen, was in der Schule nie richtig erklärt wurde, Berufstätige, die Daten lesen und KI verstehen wollen, Schüler:innen und Studierende, die Lücken schließen, und alle, die ihren Kopf fit halten wollen. Der Kern ist eine **Engine für deklarative, automatisch prüfbare Aufgaben** und ein **offenes Content-Format**. Jede veröffentlichte Aufgabe muss automatische Evals bestehen: Sie muss lösbar und eindeutig sein und darf keine unmöglichen Zustände erreichen.

> Arbeitstitel aus der Spezifikation. Lumen ist ein eigenständiges Projekt ohne Bezug zu kommerziellen Anbietern; Inhalte, Gestaltung und Namen sind eigene Arbeit.

## Stand (MVP: Meilensteine M0 und M1)

| Bereich | Umgesetzt |
|---|---|
| Content-Format v0.1 | YAML, per JSON-Schema validiert: Fach-Pfad → Topic (mit Stufe) → Unit → Concept → Step; Evals prüfen, dass jeder Pfad aufsteigt und Voraussetzungen vorher kommen; Varianten-Generatoren; Fehlvorstellungs-Feedback; Skill-Graph; Einstufung |
| Engine (`@lumen/engine`, MIT) | 31 Aufgabentypen plus Erklär-, Aufdeck- und Einleitungs-Screens, Karten zum Aufdecken und Brüche als Streifen, Kreis, Quadrat, Dreieck und Sechseck (u. a. Spiele gegen einen perfekten Computer (Nim), Türme von Hanoi, Lights out, Winkel/Einheitskreis, Rechteck-Optimierung, Tausch-Sortieren, Roboter-Programmierung, Logikgatter, Netzwerke, Venn-Diagramme, Pixelraster, Bits, Zuordnen, Paare, Diagramme, Zufall/Sprachmodell-Sampling); Level, Abzeichen, Tagesaufgaben und Tagesrätsel – alles aus dem Ereignislog abgeleitet; sicherer Ausdrucks-Evaluator (kein `eval`); Mathe-Parser mit symbolischer Äquivalenz; Referenzlöser (Widget-Löser oder Breitensuche); FSRS-Wiederholung; XP, Streak und Tagesziel aus dem Ereignislog |
| Evals | Schema · Referenzen und Zyklen · Lizenz · Lösbarkeit · „nicht trivial“ · Eindeutigkeit · Fuzzing auf unmögliche Zustände · Feedback-Regeln · Layout-Lint · Lesbarkeit (Amstad-Index) · Wörter pro Screen · Alt-Texte · Varianten-Vielfalt |
| CLI (`@lumen/cli`, MIT) | `lumen check`, `lumen build` (Bundles mit Content-Hash, optional mit Ed25519 signiert), `lumen keygen`, `lumen schema`, `lumen dev` |
| Web-App (`@lumen/web`, AGPL) | PWA, offline, ohne Account: ruhiges Designsystem (hell/dunkel, Desktop-Seitenleiste, mobile Tab-Leiste), generierte Kurs-Cover, Kurskatalog mit Bereichen und Lernpfaden, kurze Lektionen mit höchstens sechs Schritten (jedes Concept wird in Kern-Lektionen für den Lernpfad und freiwillige Bonus-Lektionen »Tiefer« und »Experte« geschnitten; die »Lerntiefe« im Profil nimmt sie fest in den Weg auf), Lektions-Player, der jedes Concept mit einer interaktiven Einleitung öffnet, mit Partikeln und steigenden Tönen bei richtigen Antworten, Kurz-Check nach jedem Erklär-Screen, Fortschrittssegmenten, Combo-Zähler, XP-Effekt und Feedback-Panel (gezieltes Feedback, zweiter Versuch, »Lösung zeigen«), tägliche Serien-Feier (die Flamme zündet, der Zähler rollt hoch, der Tag füllt sich) und Abschluss-Screen mit Kurs-Fortschritt, Level-Balken, neuen Abzeichen und Wochen-Streak, Tagesrätsel und drei Tagesaufgaben auf der Startseite, Sounds, die mit der Combo ansteigen, Wiederholen (FSRS), Profil mit Aktivitäts-Heatmap; Autor:innen-Vorschau mit Live-Evals |
| Mehrsprachigkeit | Deutsch und Englisch vollständig: UI, Engine-Feedback, Screenreader-Texte, Lux und alle Inhalte; Sprache folgt dem Gerät und ist in den Einstellungen umschaltbar; Übersetzungen liegen als `*.en.yaml` neben dem Original, und die Eval `i18n.parity` stellt sicher, dass sie sich nur im Wortlaut unterscheiden (gleiche Steps, IDs, Zahlen, Bedingungen, Vorlagen); weitere Sprachen = weitere `*.<locale>.yaml` |
| Barrierefreiheit | Bedienung per Tastatur und Screenreader (`describe()` jedes Widgets als Live-Region), jedes Manipulative auch ohne Ziehen bedienbar, Richtig/Falsch mit Symbol und Text statt nur Farbe, Dunkelmodus, hoher Kontrast, reduzierte Bewegung, Schriftgröße, Atkinson Hyperlegible |
| Server (`@lumen/server`, AGPL) | Fastify + SQLite (`node:sqlite`); Konten über »Mit Apple anmelden« oder E-Mail-Codes, der Geräteschlüssel ist das einzige Kennzeichen (keine E-Mail, kein Passwort gespeichert); idempotentes Mergen; Export und Löschen; Tutor-Endpunkt für Lux; automatischer Sync nach neuen Ereignissen |
| Serien und Community | Die Serie steht mit animierter Flamme, Wochenübersicht und Tagesstand oben auf der Startseite; die erste Lektion des Tages öffnet eine bildschirmfüllende Serien-Feier, Meilensteine (3, 7, 14, 30 … Tage) bekommen Konfetti. Serien-Seite mit Monatskalender, automatischem Serien-Schutz (2 pro Woche) und Meilensteinen. Community (ab 16, wird mit dem Konto eingerichtet, überspringbar): Profil mit Anzeigename, Benutzername und vorgefertigtem Avatar (keine Uploads); Freund:innen per Benutzername oder Einladungslink; **Freundes-Serien** (Tage, an denen beide ihre Serie gehalten haben) mit Anstupsen; **wöchentliche Ligen** mit bis zu 30 Lernenden in zehn Stufen (Funke → Zenit) mit Auf- und Abstiegszonen, dazu eine Freundes-Rangliste; **Neuigkeiten** mit Meilensteinen (Serien, Level, Liga-Aufstiege, Freundes-Serien, abgeschlossene Kurse, Abzeichen) und Reaktionen aus einer festen Auswahl; Melden, Blockieren, Namensfilter und Moderations-Endpunkte. Alle Werte berechnet der Server aus den ohnehin synchronisierten Lernereignissen |
| Lux – Tutor und Maskottchen | in jeder Lektion: vor der Antwort (»Worum geht es?«, Tipp), nach Fehlern (»Mit Lux durchgehen«: Lux fragt zuerst, wie du auf deine Antwort gekommen bist, und setzt an deiner Begründung an; bis zu vier Versuche), am Ende jeder Lektion und jedes Kurses als Fehler-Rückblick (»Fehler durchgehen«, jede falsche Aufgabe mit deiner damaligen Antwort), nach der Lösung (»Warum richtig?«) und auf Erklär-Screens; als Maskottchen begrüßt Lux auf der Startseite mit Sprechblase (antippen, und er reagiert), springt zu Beginn und vor dem letzten Schritt einer Lektion und bei Serien richtiger Antworten ins Bild, schaut nach jeder Antwort über den Feedback-Bereich und feiert auf dem Abschluss-Screen – mit elf Stimmungen von winken bis Party; spricht über ein beliebiges OpenAI-kompatibles Modell (lokal Ollama, in Produktion z. B. OpenRouter); deterministischer Leak-Schutz verwirft Antworten, die die Lösung verraten; ohne Modell oder offline antwortet ein Regel-Tutor aus den Hinweisen der Lektion; für Unter-16-Jährige nur Regel-Tutor |
| Inhalte (CC BY-SA 4.0) | 9 Fächer mit je einem Lernpfad von null bis Profi in fünf Stufen (Einstieg, Grundlagen, Aufbau, Fortgeschritten, Experte): 152 Kurse, 781 Concepts in 2773 kurzen Lektionen (1209 Kern-Lektionen auf den Lernpfaden, dazu 1564 Bonus-Lektionen »Tiefer« und »Experte«), 10818 Steps, 8525 Aufgaben (mit Varianten-Generatoren), 29 Labor-Szenen zum Ausprobieren, Deutsch und Englisch – **Mathematik** (35 Kurse: Rechnen von Anfang an, Stellenwerte und große Zahlen, Kopfrechnen, Brüche und Einheiten bis Analysis, Reihen, Differentialgleichungen, Gruppen, Eigenwerte und komplexe Zahlen), **Physik** (17: Universum bis Impuls, Schwingungen, Optik, Sterne und Kosmos, Relativität, Quantenwelt und Festkörper), **Chemie** (14: Gemische bis Küchenchemie, Reaktionstempo, Redox, Batterien und Moleküle des Lebens), **Biologie** (14: Was ist Leben und der menschliche Körper bis Vererbung, Evolution, Immunsystem, DNA, Biotechnologie und Systembiologie), **Elektrotechnik** (13: Strom im Alltag bis Kondensatoren, Wechselstrom, Dioden, Transistoren, Operationsverstärker, Signale und Filter, Energie- und Regelungstechnik), **Informatik** (17: Code und Bits bis Prozessor, Betriebssysteme, verteilte Systeme, Compiler und Komplexität), **Data Science** (17: Daten und Diagramme bis Experimente und Kausalität, Verteilungen, Bayes, Hypothesentests, Informationstheorie und Clustering), **KI** (12: Maschinelles Lernen, Suchen und Planen, Embeddings, generative KI bis Transformer und Agenten), **Logik & Denken** (13: Rätsel und Denkfehler bis Beweise, Induktion, Modallogik und Gödel) |

iOS-App mit Capacitor (`apps/mobile`): als *Lumen – Microlearning* im App Store eingereicht; Android ist vorbereitet, aber noch nicht veröffentlicht (siehe [docs/store-release.md](docs/store-release.md)). Noch nicht umgesetzt: Push (M2), Python-Editor (M4).

## Schnellstart

Voraussetzung: **Node.js ≥ 24** (empfohlen 26). TypeScript läuft direkt über Nodes eingebautes Type-Stripping, ohne Build-Schritt.

```bash
npm install
npm run dev          # App mit Live-Vorschau der Inhalte: http://localhost:5173
npm test             # Engine-, CLI- und Server-Tests
npm run check        # alle Inhalte gegen die Evals prüfen
npm run build        # Content-Bundles + PWA nach apps/web/dist
npm run server       # Lumen-Server auf :8787 (Konten, Lux, Community)
```

Self-Hosting mit Docker (Website und App auf `:8080`, die App unter `/app/`, die API unter `/api`):

```bash
docker compose up --build
```

Produktivbetrieb auf dem eigenen Server mit automatischem HTTPS (Caddy): [docs/deploy-vps.md](docs/deploy-vps.md). Alle Self-Hosting-Varianten und die Konfiguration: [docs/self-hosting.md](docs/self-hosting.md). App Store und Google Play: [docs/store-release.md](docs/store-release.md).

Server-Einstellungen für die Community:

| Variable | Bedeutung | Standard |
|---|---|---|
| `LUMEN_SOCIAL=off` | Freunde, Ligen und Neuigkeiten abschalten | an |
| `LUMEN_ADMIN_TOKEN` | Geheimnis (≥ 16 Zeichen) für die Moderations-Endpunkte `/v1/admin/reports`, `/v1/admin/users/:id/ban`, `/v1/admin/users/:id/reset-name` | – (aus) |
| `LUMEN_BLOCKED_WORDS` | zusätzliche Wörter für den Namensfilter, durch Kommas getrennt | – |

### Die öffentliche Instanz

Lumen läuft unter **https://lumen.mikekeller.cloud**: die Website (`site/`, auf Englisch und Deutsch erzeugt mit `node scripts/build-site.ts`) unter `/`, die App unter `/app/`, der Lumen-Server unter `/api/`. Der Server teilt sich den Reverse-Proxy mit anderen Seiten und nutzt deshalb `deploy/vps/` statt `docker-compose.prod.yml`: Jeder grüne Push auf `main` wird automatisch deployt (CI → Job `deploy`: baut beide Images, `docker save | ssh` auf den Server, ohne Registry). `deploy/vps/deploy.sh` ist für die Erstinstallation und Änderungen an Compose-Datei oder Caddy-Site; die Server-Konfiguration (Modell, Schlüssel) liegt in `/opt/sites/lumen/.env` auf dem Server.

Die iOS-App kommt aus derselben Pipeline (CI → Job `ios` auf einem macOS-Runner): Jeder grüne Push auf `main` lädt einen Build zu TestFlight hoch; ein Tag `v1.2.3` (passend zur `version` in `apps/mobile/package.json`) reicht zusätzlich Version 1.2.3 zur App-Prüfung ein und veröffentlicht sie nach der Freigabe automatisch. Einrichtung, Secrets und Erneuerung: [docs/store-release.md](docs/store-release.md).

## Lux, der Tutor

Lux leitet durch jede Lektion, verrät aber nie die Lösung. Die Engine (`packages/engine/src/tutor.ts`) baut aus Aufgabe, Antwort, Fehlvorstellung und Hinweisen einen festen Kontext; der Server baut daraus den Prompt (Clients können ihn nicht ersetzen) und prüft jede Modellantwort mit dem Leak-Schutz. Verrät das Modell die Lösung zweimal oder wiederholt es nur seine letzte Nachricht, antwortet der Regel-Tutor.

Lokal mit einem kleinen Modell testen (Mac mit 8 GB reicht):

```bash
ollama pull qwen3:1.7b
ollama serve
npm run server
```

Die Web-App (`npm run dev -w @lumen/web`) leitet `/api` an den Server weiter. In Produktion ein OpenAI-kompatibles Modell setzen:

| Variable | Bedeutung | Standard |
|---|---|---|
| `LUMEN_TUTOR_URL` | Basis-URL, z. B. `https://openrouter.ai/api/v1` | `http://localhost:11434/v1` |
| `LUMEN_TUTOR_MODEL` | Modellname | `qwen3:1.7b` (lokal) |
| `LUMEN_TUTOR_API_KEY` | API-Schlüssel, nur auf dem Server | – |
| `LUMEN_TUTOR_PROVIDER` | Anbietername im Einwilligungs-Dialog, z. B. `OpenRouter` | API-Host |
| `LUMEN_TUTOR_REASONING` | `reasoning_effort`, lokal `none` | – |
| `LUMEN_TUTOR_RATE_LIMIT` | Anfragen pro Minute und IP | 30 |
| `LUMEN_TUTOR=off` | nur Regel-Tutor | – |

Standard ist das Modell des Servers (z. B. ein günstiges OpenRouter-Modell, Schlüssel nur auf dem Server); wer mehr will, hinterlegt im Profil einen eigenen API-Schlüssel – er bleibt auf dem Gerät, die Anfragen gehen direkt zum eigenen Anbieter. Vor der ersten Antwort des Modells fragt Lux nach der Einwilligung und nennt Modell und Anbieter; wer ablehnt, bekommt den Regel-Tutor. Jede Modell-Antwort lässt sich im Chat melden (`GET /v1/admin/tutor-reports` für die Moderation).

Datenschutz: Lux schickt Aufgabe, Antwort und Nachrichten an den Lumen-Server und dessen Modell; der Server loggt nur den Grund eines Rückfalls, nie Inhalte. In den Einstellungen lässt sich das Modell abschalten.

## Aufbau

```
packages/engine   Headless-Engine: Schema, Widgets, Prüfung, Löser, Evals, FSRS, Fortschritt   (MIT)
packages/cli      lumen check | build | keygen | schema | dev                                  (MIT)
apps/web          PWA (React + Vite + vite-plugin-pwa), IndexedDB als Ereignislog             (AGPL-3.0)
apps/server       Konto-, Tutor- und Community-API (Fastify, node:sqlite)                      (AGPL-3.0)
apps/mobile       Capacitor-Hülle für App Store und Google Play                               (AGPL-3.0)
deploy/           Dockerfiles, nginx, Caddy, Backups
content/          Pfade, Topics, Concepts, Skills, Einstufung als YAML                        (CC BY-SA 4.0)
docs/             Content-Format, Self-Hosting, VPS-Deployment, Store-Veröffentlichung
```

### Widget-Vertrag

Jeder Aufgabentyp ist eine reine, typisierte Definition. Dieselbe API dient der UI, den CI-Evals, dem Authoring und später dem Tutor:

```ts
init(params, ctx) → state            applyAction(state, action, params) → state
checkAnswer(state, answer, params)   isSolved(state, params)
solve(params, answer) → state        describe(state, params, locale) → Text für Screenreader/LLM
actions(state, params) → Aktionen    validateState(state, params) → verletzte Invarianten
lint(params, answer) → Hinweise      diagnose(state, answer, params) → Feedback zur Fehlvorstellung
```

`createWidgetInstance()` stellt zusätzlich die objektorientierte Form aus der Spezifikation bereit (`getState`, `applyAction`, `isSolved`, `describe`, `solve`).

### Fortschritt: local-first

Jeder Versuch ist ein Ereignis mit UUID, das nur angehängt wird. XP, Streak (mit 2 automatischen Freezes pro Woche), Tagesziel und der FSRS-Zustand jeder Karte werden **deterministisch aus dem Log abgeleitet**. Deshalb kann Sync Logs konfliktfrei vereinigen.

XP-Regeln: gelöste Aufgabe 1–3 XP (Schwierigkeit), Concept +10, Wiederholungs-Session +5. Wiederholungen am selben Tag geben keine XP.

### Wiederholung (FSRS)

Karten sind Aufgaben mit Varianten-Generator, und jede Wiederholung zeigt neue Zahlen. Die Bewertung wird automatisch abgeleitet: falsch → Again, mit Hinweis oder im 2. Versuch → Hard, richtig → Good, richtig und schnell → Easy. Sessions sortieren nach Abrufwahrscheinlichkeit und mischen Topics. Scheitert eine Karte, werden Karten zu den Voraussetzungs-Skills vorgezogen.

## Inhalte schreiben

Siehe [docs/content-format.md](docs/content-format.md) und [CONTRIBUTING.md](CONTRIBUTING.md). Kurzfassung:

1. `npm run dev`, dann **Profil → Autor:innen-Vorschau** öffnen. Jede gespeicherte YAML-Datei lädt die Seite neu, inklusive Live-Evals.
2. `npm run check` muss mit 0 Fehlern und 0 Warnungen durchlaufen. Die CI prüft das mit `--strict`.

## Signierte Content-Bundles

```bash
node packages/cli/src/cli.ts keygen --out keys            # keys/ ist in .gitignore
node packages/cli/src/cli.ts build content --out apps/web/public/content --key keys/content-signing.pem
VITE_LUMEN_PUBLIC_KEY=<öffentlicher Schlüssel> npm run build -w @lumen/web
```

Die App prüft jede Datei gegen den SHA-256 im Manifest. Ist ein öffentlicher Schlüssel konfiguriert, prüft sie zusätzlich die Ed25519-Signatur des Manifests.

## Datenschutz

- Local-first: Der Fortschritt ist ein Ereignisprotokoll in IndexedDB, funktioniert offline und wird im Konto gesichert.
- Anmeldung mit Apple oder einem 6-stelligen E-Mail-Code. Der Server speichert SHA-256 des Geräteschlüssels, einen geheimschlüssel-basierten Prüfwert der E-Mail-Adresse und pseudonyme Lernereignisse – keine E-Mail-Adresse, keinen Namen, kein Passwort.
- Die Community ist freiwillig und ab 16: Andere sehen Anzeigename, Benutzername, Avatar, Serie, XP, Level und Liga – nie Antworten. Löschen des Community-Profils (oder der Serverdaten) entfernt alles Soziale.
- Unter 16 Jahren (DSGVO Art. 8): Kindermodus ohne Community, Anmeldung nur mit Zustimmung eines Elternteils.
- Export und Kontolöschung (Server und Gerät) per Knopfdruck. Keine Third-Party-SDKs, kein Tracking.
- Einstufung und Bewertung sind regelbasiert und deterministisch (kein ML/LLM), mit Blick auf den EU AI Act.

Datenschutzhinweise, Nutzungsbedingungen mit Community-Regeln und Impressum liegen als Vorlagen in der App (`#/legal/…`, Betreiberangaben über `VITE_LUMEN_OPERATOR*`). Vor einem öffentlichen Betrieb sind eine anwaltliche Prüfung (Marke, AGB, Datenschutzerklärung) und eine DSFA nötig.

## Lizenzen

| Teil | Lizenz |
|---|---|
| `packages/*` (Engine, Format, CLI) | MIT |
| `apps/*` (Web-App, Server) | AGPL-3.0-or-later |
| `content/` (Texte, Aufgaben) | CC BY-SA 4.0 |
| Name und Logo | siehe [TRADEMARK.md](TRADEMARK.md) |

Beiträge laufen über das [Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`), es gibt keine CLA.
