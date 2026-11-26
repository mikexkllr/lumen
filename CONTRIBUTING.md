# Mitmachen

Danke, dass du Lumen besser machen willst! Beiträge zu Inhalten, Widgets, App und Übersetzungen sind willkommen.

## Ablauf für Inhalte

1. Topic oder Concept anlegen (siehe [docs/content-format.md](docs/content-format.md)).
2. `npm run dev` starten und unter **Profil → Autor:innen-Vorschau** jeden Step ausprobieren, auch „Lösung zeigen“ und „Neue Variante“.
3. `npm run check` muss **0 Fehler und 0 Warnungen** melden.
4. Pull Request öffnen. Zwei Reviews sind nötig: eines **fachlich**, eines **didaktisch**.
5. Nach dem Merge baut die CI signierte Bundles, und die Apps laden sie beim nächsten Start.

## Übersetzen

Übersetzungen liegen als `name.en.yaml` neben dem Original (Details in [docs/content-format.md](docs/content-format.md#übersetzungen)). Nur den Wortlaut übersetzen, nie IDs, Zahlen, Bedingungen oder `{{Vorlagen}}`. `node scripts/check-translation.ts en <topic>` muss mit 0 Fehlern, 0 Warnungen und 0 fehlenden Dateien enden. Wer ein deutsches Concept ändert, passt die Übersetzung im selben PR an.

## Didaktischer Styleguide

- **Einleitung zuerst**: Jede Lektion öffnet mit einem Intro-Screen (`intro: true`) – ein Satz, warum es spannend ist, und eine interaktive Visualisierung zum Ausprobieren. Danach sofort ein Problem, keine Erklär-Strecke.
- **Problem zuerst**, dann die Prozedur. Ein Concept beginnt nicht mit drei Erklär-Screens.
- **Zeigen statt erzählen**: Bruchformen, Waage, Labor-Szenen, Regler und Karten zum Aufdecken schlagen jeden Absatz Text.
- **Eine Idee pro Step**, vom einfachsten Fall aus aufsteigend.
- **Sanfter Einstieg**: Die ersten zwei, drei Aufgaben nach der Einleitung sind leichte Erfolge – lösbar mit Alltagswissen oder dem, was die Einleitung gerade gezeigt hat. Schweres kommt später im Kern oder in den Stufen »Tiefer« und »Experte«, die als Bonus-Lektionen erscheinen.
- **Kurze Lektionen**: Die App schneidet jede Stufe in Lektionen mit höchstens sechs Steps (siehe [docs/content-format.md](docs/content-format.md#aus-einem-concept-werden-kurze-lektionen)). Setz Erklär-Screens direkt vor die Aufgaben, die sie üben.
- **Höchstens ~40 Wörter** Text pro Screen, kurze Sätze.
- **Konkret vor formal**: erst Waage, Streifen oder Zahlenstrahl, dann die Schreibweise.
- **Feedback zu Fehlvorstellungen**: Für typische Fehler eine `feedback`-Regel mit `misconception` schreiben, nicht nur „falsch“.
- **Zwei Hinweise**: der erste lenkt den Blick, der zweite nennt den nächsten Schritt.
- **Varianten** für alles, was wiederholt wird (`srs.cards_from`): Wiederholungen sollen das Prinzip abfragen, nicht die auswendig gelernte Zahl.

## Rechtliches

- Alle Inhalte stehen unter **CC BY-SA 4.0**. Nur eigene Arbeit oder kompatibel lizenziertes Material einreichen, **kein CC-BY-NC**.
- **Keine Inhalte kommerzieller Lernplattformen** kopieren, nachbauen oder nacherzählen. Das gilt für Texte, Aufgaben, Illustrationen und Lektionsstrukturen. Schreibe aus Lehrplänen, Fachliteratur und eigener Didaktik und nenne bei Zweifeln die Quellen im PR (`sources:` im Concept).
- Wir nutzen das **Developer Certificate of Origin** statt einer CLA: Jeder Commit wird mit `git commit -s` signiert.

## Code

- `npm run typecheck && npm test` vor jedem PR.
- Neue Widgets implementieren den vollständigen Vertrag in `packages/engine/src/widgets/types.ts`, mindestens mit `actions` (für Fuzzing und Suche), `validateState` und `describe`. Die Oberfläche in `apps/web/src/widgets` muss ohne Ziehen per Tastatur bedienbar sein.
- Barrierefreiheit (WCAG 2.2 AA) ist ein Abnahmekriterium und keine Kür.
