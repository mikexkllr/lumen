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
  depth: 2                          # Tiefenstufe 1–3 (Kern · Tiefer · Experte), siehe unten
  unique: true                      # Eindeutigkeit erzwingen (Choice und Logikgitter immer)
  solution: { state: {...} }        # optional: Musterzustand für den Referenzlöser
  variants:
    params: { a: "int[2,9]", b: "int[1,9]" }     # int[a,b] · nonzero[a,b] · choice[x,y,…] · step[a,b,s]
    derive: { c: "a + b" }
    constraints: ["a != b"]
    defaults: { a: 5, b: 7 }        # Lektion; Wiederholungen ziehen neue Werte
```

### Tiefenstufen

Jede Lektion beginnt so einfach wie möglich und wird Schritt für Schritt schwerer. Das Feld `depth` (auch an Erklär-Screens) teilt sie in drei Stufen:

| `depth` | Stufe | Inhalt |
|---|---|---|
| 1 (Standard) | Kern | die Idee in wenigen Minuten: Schätzfrage, Erklärung, einfache Aufgaben, kurze Wiederholung |
| 2 | Tiefer | warum es gilt, kniffligere Aufgaben, Anwendungen |
| 3 | Experte | Grenzfälle, Beweise, Bezüge auf Hochschulniveau, »Erklär’s Lux« |

Nach jeder Stufe fragt der Player, ob es tiefer gehen soll oder für heute reicht. Wer aufhört, hat den Kern trotzdem abgeschlossen und steigt beim nächsten Mal auf der nächsten Stufe ein. Die Stufen dürfen nur steigen (`depth.order`), und eine Lektion beginnt mit Stufe 1 (`depth.start`).

### Kurz-Check auf Erklär-Screens

Ein reiner Text-Screen endet nicht mit »Weiter«, sondern mit einem Ein-Tipp-Check: Ein Kernbegriff des Textes wird ausgeblendet, zur Wahl stehen der richtige Begriff und zwei andere Kernbegriffe desselben Kurses. Richtig getippt geht es von selbst weiter; es gibt weder Punkte noch Abzug, und überspringen ist erlaubt.

Dafür muss niemand etwas schreiben – außer **einen Kernbegriff pro Erklär-Screen fett zu setzen**. Als Ziel taugt ein Wort oder eine kurze Wendung (bis vier Wörter). Formeln, Zahlen und bloße Betonungen wie **alle** oder **nicht** überspringt die Engine. Screens mit `reveal` oder interaktivem `visual` bekommen keinen Check; sie sind schon aktiv. `node scripts/audit-lessons.ts` zeigt unter `passive`, welche Screens weder das eine noch das andere haben.

Auf Erklär-Screens bietet Lux vier Wege an: **einfacher**, **Beispiel**, **tiefer** und **Quiz mich**. Dazu kommt Vorlesen. Die Texte dafür muss niemand schreiben.

`{{ausdruck}}` funktioniert in allen Strings von params, answer, prompt, hints, feedback und explanation. Besteht ein String nur aus einer Vorlage, bleibt der Wert eine Zahl bzw. ein Boolean.

### Ausdruckssprache (Prädikate, derive, Vorlagen)

Sicher ausgewertet, ohne `eval`. Unterstützt werden `+ - * / % **`, Vergleiche, `&& || !`, `?:`, Arrays und Objekte, `.length`, `.includes()`, `.indexOf()`, `.join()`, `.slice()`. `==` vergleicht strukturell und toleriert Rundungsfehler bei Zahlen.

Funktionen: `abs min max round floor ceil sqrt exp ln log10 log2 pow sign gcd lcm mod bin hex chr ord len sum count keys values sorted int num str isInt approx numval mean median`. `bin(5)` → "101", `chr(0)` → "A", `ord("C")` → 2.

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
| `distribution` | `mode: chance\|tokens`, `context`, `items: [{label, weight \| logit}]`, `temperature`, `sample` | Prädikat | `prob('x')`, `freq('x')`, `count('x')` (Label oder Index ab 0 – der Index bleibt in Übersetzungen gleich), `draws`, `temperature`, `top`, `topIndex` |
| `buckets` | `buckets: [{label}]`, `items: [{label, bucket}]` (bucket = id oder Label) | alle Karten in der richtigen Gruppe | `placed`, `correct` |
| `match` | `pairs: [{left, right}]`, `leftTitle`, `rightTitle` | alle Paare richtig verbunden | `links`, `correct` |
| `pixels` | `rows`/`cols` oder `cells` (`.` `#` Ziffern), `locked`, `numbers: {start}`, `labels`, `mirror`, `shades`, `counter` | `pattern` oder Prädikat | `on`, `onLabels`, `cell(r,c)`, `row(r)`, `col(c)`, `symmetric('v'\|'h')`, `pattern` |
| `bits` | `bits`, `initial`, `placeValues`, `showValue`, `locked`, `labels` | `value` | `value`, `ones`, `bitstr` |
| `gates` | `inputs: [{id, value, fixed}]`, `gates: [{id, type, in, options}]` (`type: '?'` = wählbar), `outputs: [{id, from}]`, `goal` | `goal` oder Prädikat | Ausgänge per id, `table('Q')` (Wahrheitstabelle), `inputs`, `types` |
| `venn` | `sets` (2–3), `outside`, `counts: {A: 3, AB: 1}`, `universe` | `regions: [A, AB, O]` | `shaded`, `has('AB')` |
| `network` | `nodes: [{id, x, y}]` (0–100), `edges: [{a, b, w}]`, `mode: path\|color\|select`, `start`, `end`, `colors`, `unit` | kürzester Weg · konfliktfreie Färbung · minimaler Spannbaum – oder Prädikat | `cost`, `complete`, `conflicts`, `selectedWeight`, `isTree`, `shortest`, `mst`, `color(id)` |
| `estimate` | `min`, `max`, `step`, `scale: linear\|log`, `unit` | `value` mit `tolerance` (absolut) oder `within` (Prozent, Standard 20) | `value` |
| `swipe` | `cards: [{text, right, why}]` (2–8), `left`, `right` (Seitennamen) | jede Karte auf der richtigen Seite | `correct`, `picks` |
| `cloze` | `text` mit `[[Lücke]]`, `distractors` | jedes Wort in seiner Lücke | `correct` |
| `teach` | `keywords: [[Synonym, …], …]` (Kernideen), `min`, `sample` (Musterantwort), `placeholder` | genug Kernideen in der eigenen Erklärung; danach antwortet Lux auf den Wortlaut | `hits`, `words` |
| `sim` | `scene`, `controls: {id: {value, min, max, step, fixed}}`, `show`, `target`, `expr`, `interval`, `points` | `{name: Zahl \| [von, bis]}` für Regler und Ergebnisse – oder Prädikat | alle Regler und Ergebnisse per id, `touched` |

`estimate`, `swipe`, `cloze`, `teach` und `sim` geben selbst gezielte Rückmeldung (`autoHints`); `hints` sind dort freiwillig.

**Labor-Szenen** (`sim`): Regler → Ergebnisse. Mit `*` markierte Regler sind fest und lassen sich mit `controls: {g: {fixed: false}}` freischalten.

| `scene` | Regler | Ergebnisse |
|---|---|---|
| `projectile` | `angle`, `speed`, `g`* | `range`, `height`, `time` |
| `pendulum` | `length`, `mass`, `g`* | `period`, `frequency` |
| `wave` | `amplitude`, `wavelength`, `frequency` | `speed`, `period` |
| `circuit` | `voltage`, `resistance` | `current`, `power` |
| `gas` | `temperature`, `volume`, `amount`* | `pressure` |
| `lever` | `m1`, `d1`, `m2`, `d2` | `left`, `right`, `tilt` |
| `tangent` (`expr`) | `x`, `h` | `secant`, `slope`, `y` |
| `riemann` (`expr`, `interval`) | `n` | `sum`, `exact`, `error` |
| `unitcircle` | `angle` | `cos`, `sin` |
| `neuron` (`points`) | `w1`, `w2`, `b` | `correct`, `total`, `errors` |
| `descent` | `rate`, `steps` | `x`, `loss` |
| `normal` (`interval`) | `mean`, `sd` | `share` |
| `decay` | `halflife`, `time` | `left`, `halvings` |
| `growth` | `rate`, `years`, `start`* | `value`, `linear`, `factor` |
| `lens` | `object`, `focal` | `image`, `magnification` |
| `orbit` | `radius`, `speed` | `circular`, `escape`, `ecc`, `kind`, `period` (h) |
| `arrhenius` | `temperature` (°C), `ea`, `catalyst`* | `factor` (gegenüber 25 °C), `eaeff` |
| `spring` | `mass`, `stiffness`, `amplitude`* | `period`, `frequency`, `energy` |
| `population` | `rate`, `capacity`, `gens`, `start`* | `size`, `unlimited`, `share` |
| `epidemic` (SIR) | `r0`, `vaccinated`, `recovery`* | `peak`, `total`, `herd`, `reff` |
| `hardy` | `p` | `q`, `AA`, `Aa`, `aa` |
| `enzyme` | `substrate`, `km`, `inhibitor`*, `vmax`* | `rate`, `kmeff` |
| `predator` | `birth`, `hunt` | `preymax`, `predmax`, `preymean`, `predmean` |
| `rc` | `resistance` (kΩ), `capacitance` (µF), `time` (ms), `voltage`* | `tau`, `charge`, `uc`, `taus` |
| `divider` | `voltage`, `r1`, `r2`, `load`* | `out`, `current`, `ratio` |
| `lowpass` | `resistance` (kΩ), `capacitance` (nF), `frequency` (Hz) | `cutoff`, `gain`, `db` |
| `resonance` | `inductance` (mH), `capacitance` (µF) | `f0`, `period` |
| `transformer` | `n1`, `n2`, `u1`*, `i2`* | `u2`, `i1`, `ratio` |
| `sampling` | `signal`, `rate` | `nyquist`, `seen`, `aliased` |

```yaml
- kind: problem
  widget: sim
  prompt: Stell das Pendel so ein, dass eine Schwingung 2 Sekunden dauert.
  params: { scene: pendulum }
  answer: { period: [1.95, 2.05] }
```

Eine neue Szene besteht aus zwei Teilen: Regler, Ergebnisse und `compute` in `packages/engine/src/widgets/sim.ts` und die Zeichnung in `apps/web/src/widgets/Sim.tsx`.

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
- **Tiefenstufen**: `depth` steigt nur, die Lektion beginnt mit Stufe 1.
- **Text**: ≤ 40 Wörter pro Screen, Lesbarkeitsindex ≥ 40 (Amstad), Hinweise vorhanden
- **Alt-Texte**: Bilder brauchen `alt`; Visuals bekommen ihre Beschreibung aus `describe()`.
- **Übersetzungen** (`i18n.parity`, nur bei `--locale` ≠ `de`): siehe unten.

## Viele Lektionen auf einmal erweitern

`scripts/extend-lessons.ts` hängt Steps aus einer kompakten, zweisprachigen Patch-Datei an bestehende Lektionen an oder legt neue Lektionen an. Deutsch und Englisch stehen in einem String, getrennt durch `||`; das Werkzeug schreibt beide Dateien und hält sie strukturgleich.

```yaml
math.fractions.compare:            # bestehende Lektion: Steps anhängen
  - hook                           # Abschnitt: hook (ganz vorn) · core · deep · expert
  - est: 'Schätz mal: … || Take a guess: …'
    r: [1, 200]                    # Skala, optional drittes Element log
    a: 39
    tol: 8
    why: 'Erklärung || explanation'
  - deep
  - mc: 'Frage || question'
    o: ['*richtig || correct', 'falsch :: Rückmeldung || wrong :: feedback']
    h: 'Hinweis || hint'
    why: 'Erklärung || explanation'

+sci.motion.energy:                # neue Lektion
  topic: bewegung                  # Ordner unter content/topics
  unit: sci.motion.u2
  after: sci.motion.fall           # oder first: true
  title: 'Energie der Bewegung || Energy of motion'
  summary: '… || …'
  skills: []
  steps: [ … ]
  srs: [c3, c4, d1]
```

Ein wörtliches `||` (etwa im Zellschema `Zn | Zn²⁺ || Cu²⁺ | Cu`) schreibt man als `\||`.

Kurzformen: `est`, `swipe`, `cloze`, `teach`, `num`, `mc`, `order`, `match`, `sort`, `sim`, `explain` und `raw` (voller Step). Die Steps bekommen die ids `hook`, `cN`, `dN`, `xN`; ein Patch lässt sich deshalb gefahrlos erneut anwenden. Neue Steps landen hinter dem letzten vorhandenen Step, der nicht tiefer ist als sie selbst – ein Kern-Step also vor der Stufe »Tiefer«, auch wenn die Lektion schon eine Experten-Stufe hat.

**Ein Patch ersetzt in einer Lektion nur die Abschnitte, die er selbst nennt.** Ein zweiter Patch mit `hook` lässt `deep` und `expert` eines früheren Patches stehen. Zwei Patches, die denselben Abschnitt derselben Lektion füllen, überschreiben sich dagegen. Wer später etwas nachträgt, gibt dem Patch deshalb einen eigenen Namensraum:

```yaml
_ns: lab                           # ids werden zu lab-c1, lab-d1 … und gehören nur diesem Patch
sci.circuits.power:
  - core
  - sim: 'Die Lampe soll an 12 V genau 24 W leisten. || The lamp should deliver exactly 24 W at 12 V.'
    scene: circuit
    a: { voltage: 12, power: 24 }
```

Die Ausgabe nennt, wie viele frühere Schritte ersetzt wurden – bei einem neuen Patch muss dort 0 stehen. Danach lohnt ein Blick auf `node scripts/audit-lessons.ts`: Die Gesamtzahl der Steps darf nur wachsen.

```bash
node scripts/extend-lessons.ts patch.yaml --dry   # nur prüfen
node scripts/extend-lessons.ts patch.yaml
node scripts/digest.ts brueche kreise             # Lektionen eines Kurses in Kurzform lesen
node scripts/audit-lessons.ts                     # Kennzahlen je Lektion: Länge, Formate, Tiefe
```

## Übersetzungen

Jede Datei (Concept, Topic, Pfad, Skills, Einstufung) kann Übersetzungen haben. Eine Übersetzung liegt als `name.<locale>.yaml` neben `name.yaml`, trägt dieselbe `id` und `locale: <locale>` und ist eine vollständige Kopie, in der nur der Wortlaut übersetzt ist. Fehlt eine Übersetzung, zeigt die App das deutsche Original (`i18n.missing`, Hinweis).

Die Eval `i18n.parity` vergleicht jede Übersetzung mit dem Original. Gleich bleiben müssen: alle Schlüssel und IDs, Widgets, Zahlen und Wahrheitswerte, Anzahl der Steps, Hinweise, Optionen und Regeln, `when`-Bedingungen, der ganze `variants`-Block, `skills`, `prerequisites`, `level` und alle `{{…}}`-Vorlagen. Zahlen in Vorlagen formatiert die Engine je nach Sprache (`3,5` bzw. `3.5`).

```bash
node packages/cli/src/cli.ts check content --locale en --strict   # alle englischen Inhalte
node scripts/check-translation.ts en brueche kreise                # nur diese Topics, inkl. fehlender Übersetzungen
```

Eine neue Sprache braucht: `UiLocale` und ein Wörterbuch in `apps/web/src/lib/i18n.ts`, die Locale in `vite-plugin-lumen-content.ts` und im `build`-Aufruf (`--locales de,en,…`) sowie `*.<locale>.yaml`-Dateien. Engine-Texte (Feedback, `describe()`, Lux) nutzen `t(locale, de, en)` und fallen für weitere Sprachen auf Englisch zurück.
