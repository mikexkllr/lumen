# Content-Format v0.1

Alle Inhalte liegen als YAML unter `content/`. Jede Datei hat ein Feld `type`. Editoren mit YAML-Language-Server validieren gegen `content/lumen.schema.json` (`lumen schema` erzeugt die Datei neu).

```
content/
  skills.yaml                      type: skills     – Skill-Graph mit Voraussetzungen
  placement.yaml                   type: placement  – Einstufungstest
  paths/<pfad>.yaml                type: path       – Lernpfad = geordnete Topics
  topics/<topic>/topic.yaml        type: topic      – Units mit Concept-IDs
  topics/<topic>/concepts/*.yaml   type: concept    – Steps
```

## Concept

```yaml
id: alg.linear.balance-01        # Kleinbuchstaben, Ziffern, . _ -
type: concept
title: Gleichungen als Waage
summary: Ein Satz für Karten und Suche.
locale: de                       # Übersetzungen: gleiche id, andere locale, Datei name.<locale>.yaml
license: CC-BY-SA-4.0            # Pflicht
authors: ["@maria"]              # Pflicht
skills: [alg.balance]
estimated_minutes: 7
steps: [...]
srs:
  cards_from: ["steps[2]", "rechnen"]   # Index (0-basiert) oder Step-id
```

## Steps

**Erklär-Screen** – maximal ~40 Wörter, eine Idee:

Topics haben zusätzlich `icon` (Motiv für das generierte Cover: fraction, balance, puzzle, percent, negative, ratio, terms, function, geometry, dice, chart, robot, ai …) und `color` (#rrggbb).

```yaml
- kind: explain
  body: |
    Der **Nenner** sagt, in wie viele gleiche Teile das Ganze geteilt ist.
    Inline-Mathe mit $\frac{3}{4}$.
  visual: { widget: fraction, params: { parts: 4, shaded: [0, 1, 2] } }   # Anzeige; mit interactive: true zum Ausprobieren
```

**Aufdecken** (aktives Erinnern): erst überlegen, dann antippen.

```yaml
- kind: explain
  body: Wie weit kommst du mit 8 Bits?
  reveal: { body: "Bis 255 – das sind 256 Werte." }
```

**Aufgabe**:

```yaml
- kind: problem
  id: rechnen                      # stabil halten – Fortschritt und Wiederholung hängen daran
  widget: numeric
  prompt: "Löse: $x + {{a}} = {{a + b}}$"
  body: optionaler Kontext über der Aufgabe
  visual: { widget: balance, params: {...} }      # optional, nur Anzeige
  answer: { value: "{{b}}" }        # widget-spezifisch, ODER:
  check: { predicate: "state.left.x == 1 && state.balanced" }
  feedback:                         # gezieltes Feedback bei Fehlvorstellungen (erste passende Regel)
    - when: "numval(state.input) == a + (a + b)"
      misconception: inverse-op
      text: Du hast addiert. Nimm auf beiden Seiten {{a}} weg.
  hints: [Erster Hinweis, Zweiter Hinweis]       # der Player zeigt höchstens 2 Stufen
  explanation: Wird nach dem Lösen bzw. nach dem 2. Fehlversuch gezeigt.
  difficulty: 2                     # 1–3 = XP
  unique: true                      # Eindeutigkeit erzwingen (Choice und Logikgitter immer)
  solution: { state: {...} }        # optional: Musterzustand für den Referenzlöser
  variants:
    params: { a: "int[2,9]", b: "int[1,9]" }     # int[a,b] · nonzero[a,b] · choice[x,y,…] · step[a,b,s]
    derive: { c: "a + b" }
    constraints: ["a != b"]
    defaults: { a: 5, b: 7 }        # Lektion; Wiederholungen ziehen neue Werte
```

`{{ausdruck}}` funktioniert in allen Strings von params, answer, prompt, hints, feedback und explanation. Besteht ein String nur aus einer Vorlage, bleibt der Wert eine Zahl bzw. ein Boolean.

### Ausdruckssprache (Prädikate, derive, Vorlagen)

Sicher ausgewertet, ohne `eval`. Unterstützt werden `+ - * / % **`, Vergleiche, `&& || !`, `?:`, Arrays und Objekte, `.length`, `.includes()`, `.indexOf()`, `.join()`, `.slice()`. `==` vergleicht strukturell und toleriert Rundungsfehler bei Zahlen.

Funktionen: `abs min max round floor ceil sqrt pow sign gcd lcm mod bin hex chr ord len sum count keys values sorted int num str isInt approx numval mean median`. `bin(5)` → "101", `chr(0)` → "A", `ord("C")` → 2.

`numval("3/4")` liest Eingaben wie `3/4`, `0,75` oder `1 1/2`.

Im Scope stehen: `state`, `params`, alle Varianten-Variablen und widget-spezifische Hilfen (siehe unten).

## Aufgabentypen

| widget | params (Auswahl) | answer / Ziel | Scope-Hilfen |
|---|---|---|---|
| `choice` | `options: [{label, correct, feedback}]`, `multiple`, `layout: list\|grid` | aus `correct` | – |
| `numeric` | `unit`, `placeholder`, `keypad` | `value` (Zahl, `"3/4"`, Ausdruck), `tolerance`, `form: any\|fraction\|simplified\|integer\|decimal` | – |
| `expression` | `variables` | `equivalentTo`, `form: any\|expanded\|factored` | – |
| `order` | `items` (in **richtiger** Reihenfolge), `direction`, `startLabel`, `endLabel` | optional `anyOf` | – |
| `tiles` | `tiles`, `slots` | `sequence` \| `anyOf` \| `evaluatesTo` \| `equivalentTo` | – |
| `graph` | `x`, `y`, `grid`, `points`, `lines`, `segments`, `functions` | `points: {A: {x, y}}` oder Prädikat | `slope('A','B')`, `dist('A','B')` |
| `slider` | `expr` (z. B. `m*x + b`), `sliders`, `target`, `markers` (mit `group: a\|b` für zwei Farben), `showCoordinates` | `values` oder `matchTarget` | Reglerwerte direkt (`m`, `b`) |
| `balance` | `left/right: {x, units}`, `allow`, `oneSided`, `reveal` | x allein und im Gleichgewicht | `balanced` |
| `fraction` | `parts`, `shape: bar\|circle`, `shaded`, `partOptions`, `reference` | `fraction: "3/4"`, `equivalent`, `parts` | `shadedCount`, `value` |
| `numberline` | `min`, `max`, `ticks`, `labels`, `markers` | `value`, `tolerance` | – |
| `logic-grid` | `categories`, `ordered`, `clues: [{text, rule \| rules}]` | eindeutige Lösung des Rätsels | – |
| `robot` | `grid` (`.` `#` `S` `G` `*`), `dir`, `blocks`, `repeatCounts`, `maxBlocks`, `goal: reach\|collect`, `program` (vorbelegt, fürs Debuggen) | Ziel erreicht bzw. alle Kristalle, höchstens `maxBlocks` Blöcke | `blocks`, `crashed`, `success` |
| `chart` | `labels`, `values`, `editable`, `min`, `max`, `step`, `show: [mean, median]` | `values` oder Prädikat | `values`, `avg`, `med` (+ `mean()`, `median()`) |
| `distribution` | `mode: chance\|tokens`, `context`, `items: [{label, weight \| logit}]`, `temperature`, `sample` | Prädikat | `prob('x')`, `freq('x')`, `count('x')`, `draws`, `temperature`, `top` |
| `buckets` | `buckets: [{label}]`, `items: [{label, bucket}]` (bucket = id oder Label) | alle Karten in der richtigen Gruppe | `placed`, `correct` |
| `match` | `pairs: [{left, right}]`, `leftTitle`, `rightTitle` | alle Paare richtig verbunden | `links`, `correct` |
| `pixels` | `rows`/`cols` oder `cells` (`.` `#` Ziffern), `locked`, `numbers: {start}`, `labels`, `mirror`, `shades`, `counter` | `pattern` oder Prädikat | `on`, `onLabels`, `cell(r,c)`, `row(r)`, `col(c)`, `symmetric('v'\|'h')`, `pattern` |
| `bits` | `bits`, `initial`, `placeValues`, `showValue`, `locked`, `labels` | `value` | `value`, `ones`, `bitstr` |
| `gates` | `inputs: [{id, value, fixed}]`, `gates: [{id, type, in, options}]` (`type: '?'` = wählbar), `outputs: [{id, from}]`, `goal` | `goal` oder Prädikat | Ausgänge per id, `table('Q')` (Wahrheitstabelle), `inputs`, `types` |
| `venn` | `sets` (2–3), `outside`, `counts: {A: 3, AB: 1}`, `universe` | `regions: [A, AB, O]` | `shaded`, `has('AB')` |
| `network` | `nodes: [{id, x, y}]` (0–100), `edges: [{a, b, w}]`, `mode: path\|color\|select`, `start`, `end`, `colors`, `unit` | kürzester Weg · konfliktfreie Färbung · minimaler Spannbaum – oder Prädikat | `cost`, `complete`, `conflicts`, `selectedWeight`, `isTree`, `shortest`, `mst`, `color(id)` |

Logikgitter-Regeln: `is: [a, b]`, `not: [a, b]`, `either: [a, b, c]`, `less: [a, b]`, `adjacent: [a, b]`, `offset: [a, b, n]`. Die drei letzten brauchen eine geordnete Kategorie (`ordered`). Der Löser beweist die Eindeutigkeit und meldet überflüssige Hinweise.

## Evals

`lumen check` lässt für jede Aufgabe und jede gezogene Variante laufen:

- **Schema** und **Referenzen**: Units, Topics, Skills, `cards_from`; keine Zyklen im Skill- und Topic-Graph
- **Lizenz** `CC-BY-SA-4.0` und Autor:innen
- **nicht trivial**: Der Startzustand ist nicht schon richtig.
- **lösbar**: Der Referenzlöser (Musterzustand, Widget-Löser oder Breitensuche über die Aktionen) findet einen Zustand, den die Prüfung als richtig erkennt.
- **eindeutig**, wo gefordert
- **Fuzzing**: Zufällige Aktionsfolgen erzeugen keine unmöglichen Zustände; Prüfung und `describe()` werfen nie Fehler.
- **Feedback-Regeln** sind auswertbar und treffen nicht auf die richtige Lösung zu.
- **Layout-Lint**: Überlappungen, zu dichte Raster, zu viele Objekte
- **Text**: ≤ 40 Wörter pro Screen, Lesbarkeitsindex ≥ 40 (Amstad), Hinweise vorhanden
- **Alt-Texte**: Bilder brauchen `alt`; Visuals bekommen ihre Beschreibung aus `describe()`.
- **Übersetzungen** (`i18n.parity`, nur bei `--locale` ≠ `de`): siehe unten.

## Übersetzungen

Jede Datei (Concept, Topic, Pfad, Skills, Einstufung) kann Übersetzungen haben. Eine Übersetzung liegt als `name.<locale>.yaml` neben `name.yaml`, trägt dieselbe `id` und `locale: <locale>` und ist eine vollständige Kopie, in der nur der Wortlaut übersetzt ist. Fehlt eine Übersetzung, zeigt die App das deutsche Original (`i18n.missing`, Hinweis).

Die Eval `i18n.parity` vergleicht jede Übersetzung mit dem Original. Gleich bleiben müssen: alle Schlüssel und IDs, Widgets, Zahlen und Wahrheitswerte, Anzahl der Steps, Hinweise, Optionen und Regeln, `when`-Bedingungen, der ganze `variants`-Block, `skills`, `prerequisites`, `level` und alle `{{…}}`-Vorlagen. Zahlen in Vorlagen formatiert die Engine je nach Sprache (`3,5` bzw. `3.5`).

```bash
node packages/cli/src/cli.ts check content --locale en --strict   # alle englischen Inhalte
node scripts/check-translation.ts en brueche kreise                # nur diese Topics, inkl. fehlender Übersetzungen
```

Eine neue Sprache braucht: `UiLocale` und ein Wörterbuch in `apps/web/src/lib/i18n.ts`, die Locale in `vite-plugin-lumen-content.ts` und im `build`-Aufruf (`--locales de,en,…`) sowie `*.<locale>.yaml`-Dateien. Engine-Texte (Feedback, `describe()`, Lux) nutzen `t(locale, de, en)` und fallen für weitere Sprachen auf Englisch zurück.
