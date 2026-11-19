# Lumen – a free alternative to Brilliant.org

🌐 **English** · [Deutsch](README.de.md)

**Lumen is a free alternative to Brilliant.org: learn math, science, computer science, data and AI by doing – free, ad-free, open source and privacy-friendly.**

Lumen is a free, open-source learning app with short interactive problems and instant feedback, available in English and German. At its core is an **engine for declarative, automatically checked problems** and an **open content format**. Every published problem must pass automated evals: it has to be solvable and unambiguous, and it must not be able to reach impossible states.

> Lumen is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Brilliant.org or any other commercial provider; "Brilliant" is used here only to describe what Lumen is an alternative to. All content, design and names are original work.

## Why Lumen?

- **Free forever** – no subscription, no paywall, no ads.
- **Learn by doing** – 26 interactive problem types instead of videos: drag, build, simulate, play.
- **Zero to hero** – 7 subjects, each with one learning path through five stages.
- **Lux, an AI tutor in every lesson** – asks how you got your answer and never gives the solution away.
- **Private by design** – no account, no tracking; progress stays on your device.
- **Open** – code under MIT/AGPL, content under CC BY-SA 4.0. Self-host it at your school.
- **Multilingual** – English and German throughout; more languages are just more YAML files.

## Status (MVP: milestones M0 and M1)

| Area | Done |
|---|---|
| Content format v0.1 | YAML validated by JSON Schema: subject path → topic (with stage) → unit → concept → step; evals check that every path climbs and prerequisites come first; variant generators; misconception feedback; skill graph; placement test |
| Engine (`@lumen/engine`, MIT) | 26 problem types plus explain and reveal screens (incl. games against a perfect computer (Nim), Tower of Hanoi, Lights Out, angles/unit circle, rectangle optimisation, swap sorting, robot programming, logic gates, networks, Venn diagrams, pixel grids, bits, matching, pairs, charts, randomness/language-model sampling); levels, badges, daily quests and a daily puzzle – all derived from the event log; safe expression evaluator (no `eval`); math parser with symbolic equivalence; reference solver (widget solver or breadth-first search); FSRS spaced repetition; XP, streak and daily goal from the event log |
| Evals | schema · references and cycles · licence · solvability · "not trivial" · uniqueness · fuzzing for impossible states · feedback rules · layout lint · readability (Flesch / Amstad) · words per screen · alt texts · variant diversity · translation parity |
| CLI (`@lumen/cli`, MIT) | `lumen check`, `lumen build` (content-hashed bundles, optionally Ed25519-signed), `lumen keygen`, `lumen schema`, `lumen dev` |
| Web app (`@lumen/web`, AGPL) | PWA, offline, no account: calm design system (light/dark, desktop sidebar, mobile tab bar), generated course covers, course catalogue with subjects and learning paths, lesson player with progress segments, combo counter, XP effect and feedback panel (targeted feedback, second try, "Show solution"), completion screen with level bar, new badges and weekly streak, daily puzzle and three daily quests on the home screen, sounds that rise with the combo, review (FSRS), profile with activity heatmap; author preview with live evals |
| Internationalisation | English and German complete: UI, engine feedback, screen-reader texts, Lux and all content; the language follows the device and can be switched in settings; translations live as `*.en.yaml` next to the original, and the `i18n.parity` eval guarantees they differ only in wording (same steps, ids, numbers, conditions, templates); adding a language means adding `*.<locale>.yaml` files |
| Accessibility | keyboard and screen-reader support (`describe()` of every widget as a live region), every manipulative usable without dragging, right/wrong shown with icon and text, not colour alone, dark mode, high contrast, reduced motion, font size, Atkinson Hyperlegible |
| Sync server (`@lumen/server`, AGPL) | optional; Fastify + SQLite (`node:sqlite`); sync code instead of email/password; idempotent merge; export and delete; tutor endpoint for Lux |
| Lux – tutor and mascot | in every lesson: before answering ("What is this about?", hint), after mistakes ("Go through it with Lux": Lux first asks how you got your answer and builds on your reasoning; up to four tries), at the end of every lesson and course as a mistakes review (every wrong problem with the answer you gave), after the solution ("Why is this right?") and on explain screens; talks to any OpenAI-compatible model (Ollama locally, e.g. OpenRouter in production); a deterministic leak guard discards replies that give the solution away; without a model or offline, a rule tutor answers from the lesson's hints; under-16s get the rule tutor only |
| Content (CC BY-SA 4.0) | 7 subjects, each with one learning path from zero to hero in five stages (Starter, Foundations, Intermediate, Advanced, Expert): 98 courses, 513 lessons, 2291 steps, 1710 problems (with variant generators), many courses with their own hands-on lab lesson, in English and German – **Mathematics** (28 courses: mental arithmetic and fractions up to calculus, integrals, matrices, complex numbers), **Physics** (13: the universe up to optics, nuclear physics, relativity, entropy and the quantum world), **Chemistry** (10: mixtures up to climate, redox and equilibrium), **Computer science** (13: code and bits up to databases, IT security and complexity), **Data science** (13: data and charts up to time series, Bayes, regression and hypothesis tests), **AI** (10: machine learning, responsibility, generative AI up to transformers and agents), **Logic & reasoning** (11: puzzles and fallacies up to quantifiers, proofs and Gödel) |

Not done yet (later on the roadmap): leagues (M5), Capacitor apps and push notifications (M2), Python editor (M4).

## Quick start

Requires **Node.js ≥ 24** (26 recommended). TypeScript runs directly through Node's built-in type stripping, with no build step.

```bash
npm install
npm run dev          # app with live content preview: http://localhost:5173
npm test             # engine, CLI and server tests
npm run check        # check all content (German and English) against the evals
npm run build        # content bundles + PWA into apps/web/dist
npm run server       # optional sync server on :8787
```

Self-hosting with Docker (app on `:8080`, sync on `:8787`):

```bash
docker compose up --build
```

## Lux, the tutor

Lux guides you through every lesson but never gives away the solution. The engine (`packages/engine/src/tutor.ts`) builds a fixed context from the problem, the answer, the misconception and the hints; the server builds the prompt from it (clients cannot replace it) and checks every model reply with the leak guard. If the model leaks the solution twice or only repeats its last message, the rule tutor answers instead. Lux replies in the learner's language.

Test locally with a small model (a Mac with 8 GB is enough):

```bash
ollama pull qwen3:1.7b
ollama serve
npm run server
```

The web app (`npm run dev -w @lumen/web`) proxies `/api` to the server. In production, set an OpenAI-compatible model:

| Variable | Meaning | Default |
|---|---|---|
| `LUMEN_TUTOR_URL` | base URL, e.g. `https://openrouter.ai/api/v1` | `http://localhost:11434/v1` |
| `LUMEN_TUTOR_MODEL` | model name | `qwen3:1.7b` (local) |
| `LUMEN_TUTOR_API_KEY` | API key, server only | – |
| `LUMEN_TUTOR_REASONING` | `reasoning_effort`, locally `none` | – |
| `LUMEN_TUTOR_RATE_LIMIT` | requests per minute and IP | 30 |
| `LUMEN_TUTOR=off` | rule tutor only | – |

Privacy: Lux sends the problem, the answer and the messages to the Lumen server and its model; the server only logs the reason for a fallback, never content. The model can be switched off in settings.

## Structure

```
packages/engine   headless engine: schema, widgets, checking, solver, evals, FSRS, progress   (MIT)
packages/cli      lumen check | build | keygen | schema | dev                                  (MIT)
apps/web          PWA (React + Vite + vite-plugin-pwa), IndexedDB as event log              (AGPL-3.0)
apps/server       sync API (Fastify, node:sqlite)                                           (AGPL-3.0)
content/          paths, topics, concepts, skills, placement as YAML (de + en)              (CC BY-SA 4.0)
docs/             content format reference
```

### Widget contract

Every problem type is a pure, typed definition. The same API serves the UI, the CI evals, authoring and the tutor:

```ts
init(params, ctx) → state            applyAction(state, action, params) → state
checkAnswer(state, answer, params)   isSolved(state, params)
solve(params, answer) → state        describe(state, params, locale) → text for screen readers/LLMs
actions(state, params) → actions     validateState(state, params) → violated invariants
lint(params, answer) → issues        diagnose(state, answer, params) → misconception feedback
```

`createWidgetInstance()` also provides the object-oriented form from the specification (`getState`, `applyAction`, `isSolved`, `describe`, `solve`).

### Progress: local-first

Every attempt is an append-only event with a UUID. XP, streak (with 2 automatic freezes per week), daily goal and the FSRS state of every card are **derived deterministically from the log**. That is why sync can merge logs without conflicts.

XP rules: solved problem 1–3 XP (difficulty), concept +10, review session +5. Repeats on the same day give no XP.

### Review (FSRS)

Cards are problems with a variant generator, so every review shows new numbers. The rating is derived automatically: wrong → Again, with a hint or on the 2nd try → Hard, right → Good, right and fast → Easy. Sessions sort by recall probability and mix topics. If a card fails, cards for its prerequisite skills move up.

## Writing and translating content

See [docs/content-format.md](docs/content-format.md) and [CONTRIBUTING.md](CONTRIBUTING.md). In short:

1. `npm run dev`, then open **Profile → Author preview**. Every saved YAML file reloads the page, including live evals.
2. `npm run check` must pass with 0 errors and 0 warnings. CI checks this with `--strict`.

To translate, put `name.<locale>.yaml` next to `name.yaml`, set `locale: <locale>` and translate only the wording. Check with `node scripts/check-translation.ts en <topic folder>`: the `i18n.parity` eval rejects any change to steps, ids, numbers, conditions or `{{templates}}`, and untranslated files are listed.

## Signed content bundles

```bash
node packages/cli/src/cli.ts keygen --out keys            # keys/ is in .gitignore
node packages/cli/src/cli.ts build content --out apps/web/public/content --key keys/content-signing.pem
VITE_LUMEN_PUBLIC_KEY=<public key> npm run build -w @lumen/web
```

The app checks every file against the SHA-256 in the manifest. If a public key is configured, it also verifies the manifest's Ed25519 signature.

## Privacy

- Works without an account; everything is stored locally in IndexedDB.
- Sync is optional and only needs a random sync code. The server stores SHA-256(code) and pseudonymous learning events – no email address and no profile.
- Under 16 (GDPR Art. 8): kids mode, sync only with a parent's consent.
- Export and deletion, locally and on the server, at the press of a button. No third-party SDKs, no tracking.
- Placement and grading are rule-based and deterministic (no ML/LLM), with the EU AI Act in mind.

Before running Lumen publicly, a legal review (trademark, terms, privacy policy) and a DPIA are required.

## Licences

| Part | Licence |
|---|---|
| `packages/*` (engine, format, CLI) | MIT |
| `apps/*` (web app, server) | AGPL-3.0-or-later |
| `content/` (texts, problems) | CC BY-SA 4.0 |
| Name and logo | see [TRADEMARK.md](TRADEMARK.md) |

Contributions use the [Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`); there is no CLA.

---

**Keywords:** free Brilliant.org alternative · free alternative to Brilliant · open-source learning app · interactive math lessons · learn STEM for free · learn science, computer science and AI · spaced repetition · AI tutor · self-hosted e-learning
