# Lumen

**MINT verstehen durch Ausprobieren – kostenlos, werbefrei, offen, datensparsam.**

Lumen ist eine freie Lern-App mit kurzen, interaktiven Aufgaben und sofortigem Feedback. Der Kern ist eine **Engine für deklarative, automatisch prüfbare Aufgaben** und ein **offenes Content-Format**. Jede veröffentlichte Aufgabe muss automatische Evals bestehen: Sie muss lösbar und eindeutig sein und darf keine unmöglichen Zustände erreichen.

> Arbeitstitel aus der Spezifikation. Lumen ist ein eigenständiges Projekt ohne Bezug zu kommerziellen Anbietern; Inhalte, Gestaltung und Namen sind eigene Arbeit.

## Stand (MVP: Meilensteine M0 und M1)

| Bereich | Umgesetzt |
|---|---|
| Content-Format v0.1 | YAML, per JSON-Schema validiert: Fach-Pfad → Topic (mit Stufe) → Unit → Concept → Step; Evals prüfen, dass jeder Pfad aufsteigt und Voraussetzungen vorher kommen; Varianten-Generatoren; Fehlvorstellungs-Feedback; Skill-Graph; Einstufung |
| Engine (`@lumen/engine`, MIT) | 26 Aufgabentypen plus Erklär- und Aufdeck-Screens (u. a. Spiele gegen einen perfekten Computer (Nim), Türme von Hanoi, Lights out, Winkel/Einheitskreis, Rechteck-Optimierung, Tausch-Sortieren, Roboter-Programmierung, Logikgatter, Netzwerke, Venn-Diagramme, Pixelraster, Bits, Zuordnen, Paare, Diagramme, Zufall/Sprachmodell-Sampling); Level, Abzeichen, Tagesaufgaben und Tagesrätsel – alles aus dem Ereignislog abgeleitet; sicherer Ausdrucks-Evaluator (kein `eval`); Mathe-Parser mit symbolischer Äquivalenz; Referenzlöser (Widget-Löser oder Breitensuche); FSRS-Wiederholung; XP, Streak und Tagesziel aus dem Ereignislog |
| Evals | Schema · Referenzen und Zyklen · Lizenz · Lösbarkeit · „nicht trivial“ · Eindeutigkeit · Fuzzing auf unmögliche Zustände · Feedback-Regeln · Layout-Lint · Lesbarkeit (Amstad-Index) · Wörter pro Screen · Alt-Texte · Varianten-Vielfalt |
| CLI (`@lumen/cli`, MIT) | `lumen check`, `lumen build` (Bundles mit Content-Hash, optional mit Ed25519 signiert), `lumen keygen`, `lumen schema`, `lumen dev` |
| Web-App (`@lumen/web`, AGPL) | PWA, offline, ohne Account: ruhiges Designsystem (hell/dunkel, Desktop-Seitenleiste, mobile Tab-Leiste), generierte Kurs-Cover, Kurskatalog mit Bereichen und Lernpfaden, Lektions-Player mit Fortschrittssegmenten, Combo-Zähler, XP-Effekt und Feedback-Panel (gezieltes Feedback, zweiter Versuch, »Lösung zeigen«), Abschluss-Screen mit Level-Balken, neuen Abzeichen und Wochen-Streak, Tagesrätsel und drei Tagesaufgaben auf der Startseite, Sounds, die mit der Combo ansteigen, Wiederholen (FSRS), Profil mit Aktivitäts-Heatmap; Autor:innen-Vorschau mit Live-Evals |
| Barrierefreiheit | Bedienung per Tastatur und Screenreader (`describe()` jedes Widgets als Live-Region), jedes Manipulative auch ohne Ziehen bedienbar, Richtig/Falsch mit Symbol und Text statt nur Farbe, Dunkelmodus, hoher Kontrast, reduzierte Bewegung, Schriftgröße, Atkinson Hyperlegible |
| Sync-Server (`@lumen/server`, AGPL) | optional; Fastify + SQLite (`node:sqlite`); Sync-Code statt E-Mail/Passwort; idempotentes Mergen; Export und Löschen; Tutor-Endpunkt für Lux |
| Lux – Tutor und Maskottchen | in jeder Lektion: vor der Antwort (»Worum geht es?«, Tipp), nach Fehlern (»Mit Lux durchgehen«: Lux fragt zuerst, wie du auf deine Antwort gekommen bist, und setzt an deiner Begründung an; bis zu vier Versuche), am Ende jeder Lektion und jedes Kurses als Fehler-Rückblick (»Fehler durchgehen«, jede falsche Aufgabe mit deiner damaligen Antwort), nach der Lösung (»Warum richtig?«) und auf Erklär-Screens; spricht über ein beliebiges OpenAI-kompatibles Modell (lokal Ollama, in Produktion z. B. OpenRouter); deterministischer Leak-Schutz verwirft Antworten, die die Lösung verraten; ohne Modell oder offline antwortet ein Regel-Tutor aus den Hinweisen der Lektion; für Unter-16-Jährige nur Regel-Tutor |
| Inhalte (CC BY-SA 4.0) | 7 Fächer mit je einem Lernpfad von null bis Profi in fünf Stufen (Einstieg, Grundlagen, Aufbau, Fortgeschritten, Experte): 98 Kurse, 513 Lektionen, 2291 Steps, 1710 Aufgaben (mit Varianten-Generatoren), viele Kurse mit eigener Experimentier-Lektion, Deutsch – **Mathematik** (28 Kurse: Kopfrechnen und Brüche bis Analysis, Integrale, Matrizen, komplexe Zahlen), **Physik** (13: Universum bis Optik, Kernphysik, Relativität, Entropie und Quantenwelt), **Chemie** (10: Gemische bis Klima, Redox und Gleichgewicht), **Informatik** (13: Code und Bits bis Datenbanken, IT-Sicherheit und Komplexität), **Data Science** (13: Daten und Diagramme bis Zeitreihen, Bayes, Regression und Hypothesentests), **KI** (10: Maschinelles Lernen, Verantwortung, generative KI bis Transformer und Agenten), **Logik & Denken** (11: Rätsel und Denkfehler bis Quantoren, Beweise und Gödel) |

Noch nicht umgesetzt (laut Roadmap später): KI-Tutor (M3), Ligen und Abzeichen (M5), Capacitor-Apps und Push (M2), Python-Editor (M4), englische Inhalte (die UI ist zweisprachig; englische Concepts fallen auf Deutsch zurück).

## Schnellstart

Voraussetzung: **Node.js ≥ 24** (empfohlen 26). TypeScript läuft direkt über Nodes eingebautes Type-Stripping, ohne Build-Schritt.

```bash
npm install
npm run dev          # App mit Live-Vorschau der Inhalte: http://localhost:5173
npm test             # Engine-, CLI- und Server-Tests
npm run check        # alle Inhalte gegen die Evals prüfen
npm run build        # Content-Bundles + PWA nach apps/web/dist
npm run server       # optionaler Sync-Server auf :8787
```

Self-Hosting mit Docker (App auf `:8080`, Sync auf `:8787`):

```bash
docker compose up --build
```

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
| `LUMEN_TUTOR_REASONING` | `reasoning_effort`, lokal `none` | – |
| `LUMEN_TUTOR_RATE_LIMIT` | Anfragen pro Minute und IP | 30 |
| `LUMEN_TUTOR=off` | nur Regel-Tutor | – |

Datenschutz: Lux schickt Aufgabe, Antwort und Nachrichten an den Lumen-Server und dessen Modell; der Server loggt nur den Grund eines Rückfalls, nie Inhalte. In den Einstellungen lässt sich das Modell abschalten.

## Aufbau

```
packages/engine   Headless-Engine: Schema, Widgets, Prüfung, Löser, Evals, FSRS, Fortschritt   (MIT)
packages/cli      lumen check | build | keygen | schema | dev                                  (MIT)
apps/web          PWA (React + Vite + vite-plugin-pwa), IndexedDB als Ereignislog             (AGPL-3.0)
apps/server       Sync-API (Fastify, node:sqlite)                                             (AGPL-3.0)
content/          Pfade, Topics, Concepts, Skills, Einstufung als YAML                        (CC BY-SA 4.0)
docs/             Referenz des Content-Formats
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

- Ohne Account nutzbar; alles liegt lokal in IndexedDB.
- Sync ist optional und braucht nur einen zufälligen Sync-Code. Der Server speichert SHA-256(Code) und pseudonyme Lernereignisse, keine E-Mail-Adresse und kein Profil.
- Unter 16 Jahren (DSGVO Art. 8): Kindermodus, Sync nur mit Zustimmung eines Elternteils.
- Export und Löschung lokal wie auf dem Server per Knopfdruck. Keine Third-Party-SDKs, kein Tracking.
- Einstufung und Bewertung sind regelbasiert und deterministisch (kein ML/LLM), mit Blick auf den EU AI Act.

Vor einem öffentlichen Betrieb sind eine anwaltliche Prüfung (Marke, AGB, Datenschutzerklärung) und eine DSFA nötig.

## Lizenzen

| Teil | Lizenz |
|---|---|
| `packages/*` (Engine, Format, CLI) | MIT |
| `apps/*` (Web-App, Server) | AGPL-3.0-or-later |
| `content/` (Texte, Aufgaben) | CC BY-SA 4.0 |
| Name und Logo | siehe [TRADEMARK.md](TRADEMARK.md) |

Beiträge laufen über das [Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`), es gibt keine CLA.
