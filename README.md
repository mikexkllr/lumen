# Lumen – free microlearning for every age

🌐 **English** · [Deutsch](README.de.md)

**▶ Try it now: [lumen.mikekeller.cloud](https://lumen.mikekeller.cloud)** – no account, no download ([open the app directly](https://lumen.mikekeller.cloud/app/)).

**Lumen is microlearning for curious minds of every age – from teenagers to retirees. A few minutes a day, hands-on: math, physics, chemistry, biology, electrical engineering, computer science, data and AI. A free alternative to Brilliant.org – ad-free, open source and privacy-friendly.**

Lumen is a free, open-source learning app with short interactive problems and instant feedback, available in English and German, on the web and as an iOS app. It is built for anyone who wants to understand how things work: adults refreshing what school never quite explained, professionals who want to read data and understand AI, students closing gaps, and lifelong learners keeping their minds sharp. At its core is an **engine for declarative, automatically checked problems** and an **open content format**. Every published problem must pass automated evals: it has to be solvable and unambiguous, and it must not be able to reach impossible states.

> Lumen is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Brilliant.org or any other commercial provider; "Brilliant" is used here only to describe what Lumen is an alternative to. All content, design and names are original work.

## Why Lumen?

- **For every age** – no grades, no pressure; start wherever you are, whether you are 14 or 74.
- **Microlearning** – lessons take a few minutes; a daily puzzle and streaks make it a habit.
- **Free forever** – no subscription, no paywall, no ads.
- **Learn by doing** – 26 interactive problem types instead of videos: drag, build, simulate, play.
- **Zero to hero** – 9 subjects, each with one learning path through five stages.
- **Lux, an AI tutor in every lesson** – asks how you got your answer and never gives the solution away.
- **Private by design** – no account, no tracking; progress stays on your device.
- **Open** – code under MIT/AGPL, content under CC BY-SA 4.0. Self-host it for your team, club or school.
- **Multilingual** – English and German throughout; more languages are just more YAML files.

## Status (MVP: milestones M0 and M1)

| Area | Done |
|---|---|
| Content format v0.1 | YAML validated by JSON Schema: subject path → topic (with stage) → unit → concept → step; evals check that every path climbs and prerequisites come first; variant generators; misconception feedback; skill graph; placement test |
| Engine (`@lumen/engine`, MIT) | 31 problem types plus explain and reveal screens (incl. games against a perfect computer (Nim), Tower of Hanoi, Lights Out, angles/unit circle, rectangle optimisation, swap sorting, robot programming, logic gates, networks, Venn diagrams, pixel grids, bits, matching, pairs, charts, randomness/language-model sampling); levels, badges, daily quests and a daily puzzle – all derived from the event log; safe expression evaluator (no `eval`); math parser with symbolic equivalence; reference solver (widget solver or breadth-first search); FSRS spaced repetition; XP, streak and daily goal from the event log |
| Evals | schema · references and cycles · licence · solvability · "not trivial" · uniqueness · fuzzing for impossible states · feedback rules · layout lint · readability (Flesch / Amstad) · words per screen · alt texts · variant diversity · translation parity |
| CLI (`@lumen/cli`, MIT) | `lumen check`, `lumen build` (content-hashed bundles, optionally Ed25519-signed), `lumen keygen`, `lumen schema`, `lumen dev` |
| Web app (`@lumen/web`, AGPL) | PWA, offline, no account: calm design system (light/dark, desktop sidebar, mobile tab bar), generated course covers, course catalogue with subjects and learning paths, lesson player with three depth stages per lesson (core, deeper, expert), a one-tap quick check after every explain screen, progress segments, combo counter, XP effect and feedback panel (targeted feedback, second try, "Show solution"), completion screen with level bar, new badges and weekly streak, daily puzzle and three daily quests on the home screen, sounds that rise with the combo, review (FSRS), profile with activity heatmap; author preview with live evals |
| Internationalisation | English and German complete: UI, engine feedback, screen-reader texts, Lux and all content; the language follows the device and can be switched in settings; translations live as `*.en.yaml` next to the original, and the `i18n.parity` eval guarantees they differ only in wording (same steps, ids, numbers, conditions, templates); adding a language means adding `*.<locale>.yaml` files |
| Accessibility | keyboard and screen-reader support (`describe()` of every widget as a live region), every manipulative usable without dragging, right/wrong shown with icon and text, not colour alone, dark mode, high contrast, reduced motion, font size, Atkinson Hyperlegible |
| Sync server (`@lumen/server`, AGPL) | optional; Fastify + SQLite (`node:sqlite`); sync code instead of email/password; idempotent merge; export and delete; tutor endpoint for Lux; automatic sync after new events |
| Streaks and community | streak screen with month calendar, automatic streak freezes (2 per week), milestones and "streak extended" on the lesson summary. Optional community (16+, opt-in, needs the server): profile with display name, username and a preset avatar (no uploads); friends via username or invite link; **friend streaks** (days on which both kept their streak) with nudges; **weekly leagues** of up to 30 learners in ten tiers (Spark → Zenith) with promotion and demotion zones, plus a friends leaderboard; a **feed** of milestones (streaks, levels, league promotions, friend streaks, finished courses, badges) with reactions from a fixed set; report, block, a name filter and admin moderation endpoints. All stats are derived on the server from the learning events the account already syncs |
| Lux – tutor and mascot | in every lesson: before answering ("What is this about?", hint), after mistakes ("Go through it with Lux": Lux first asks how you got your answer and builds on your reasoning; up to four tries), at the end of every lesson and course as a mistakes review (every wrong problem with the answer you gave), after the solution ("Why is this right?") and on explain screens; talks to any OpenAI-compatible model (Ollama locally, e.g. OpenRouter in production); a deterministic leak guard discards replies that give the solution away; without a model or offline, a rule tutor answers from the lesson's hints; under-16s get the rule tutor only |
| Content (CC BY-SA 4.0) | 9 subjects, each with one learning path from zero to hero in five stages (Starter, Foundations, Intermediate, Advanced, Expert): 151 courses, 776 lessons in three depth stages (core, deeper, expert), 9615 steps, 8116 problems (with variant generators), 29 hands-on lab scenes, in English and German – **Mathematics** (34 courses: place value and big numbers, mental arithmetic, fractions and units up to calculus, series, differential equations, groups, eigenvalues and complex numbers), **Physics** (17: the universe up to momentum, oscillations, optics, stars and cosmos, relativity, the quantum world and solid-state physics), **Chemistry** (14: mixtures up to kitchen chemistry, reaction rates, redox, batteries and the molecules of life), **Biology** (14: what life is and the human body up to genetics, evolution, the immune system, DNA, biotechnology and systems biology), **Electrical engineering** (13: electricity at home up to capacitors, AC, diodes, transistors, op-amps, signals and filters, power systems and control), **Computer science** (17: code and bits up to how a CPU works, operating systems, distributed systems, compilers and complexity), **Data science** (17: data and charts up to experiments and causality, distributions, Bayes, hypothesis tests, information theory and clustering), **AI** (12: machine learning, search and planning, embeddings, generative AI up to transformers and agents), **Logic & reasoning** (13: puzzles and fallacies up to proofs, induction, modal logic and Gödel) |

iOS app via Capacitor (`apps/mobile`): submitted to the App Store as *Lumen – Microlearning*; Android is prepared but not yet published (see [docs/store-release.md](docs/store-release.md)). Not done yet: push notifications (M2), Python editor (M4).

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

Self-hosting with Docker (website and app on `:8080`, the app under `/app/`, the API under `/api`):

```bash
docker compose up --build
```

Production on your own server with automatic HTTPS (Caddy): [docs/deploy-vps.md](docs/deploy-vps.md) (German). All self-hosting options and the configuration reference: [docs/self-hosting.md](docs/self-hosting.md). App Store and Google Play: [docs/store-release.md](docs/store-release.md).

Server settings for the community:

| Variable | Meaning | Default |
|---|---|---|
| `LUMEN_SOCIAL=off` | turn friends, leagues and feed off | on |
| `LUMEN_ADMIN_TOKEN` | secret (≥ 16 characters) for the moderation endpoints `/v1/admin/reports`, `/v1/admin/users/:id/ban`, `/v1/admin/users/:id/reset-name` | – (off) |
| `LUMEN_BLOCKED_WORDS` | extra words for the name filter, comma-separated | – |

### The public instance

Lumen runs at **https://lumen.mikekeller.cloud**: the website (`site/`, generated in English and German by `node scripts/build-site.ts`) at `/`, the app at `/app/`, the Lumen server at `/api/`. That server shares its reverse proxy with other sites, so it uses `deploy/vps/` instead of `docker-compose.prod.yml`: Every green push to `main` deploys automatically (CI → `deploy` job: builds both images, `docker save | ssh` to the server, no registry). `deploy/vps/deploy.sh` covers the first install and changes to the compose file or the Caddy site; the server configuration (model, keys) lives in `/opt/sites/lumen/.env` on the server.

The iOS app ships from the same pipeline (CI → `ios` job on a macOS runner): every green push to `main` uploads a build to TestFlight; a tag `v1.2.3` (matching the `version` in `apps/mobile/package.json`) also submits version 1.2.3 for App Store review and releases it automatically once approved. Setup, secrets and renewal: [docs/store-release.md](docs/store-release.md).

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
| `LUMEN_TUTOR_PROVIDER` | provider name in the consent dialog, e.g. `OpenRouter` | API host |
| `LUMEN_TUTOR_REASONING` | `reasoning_effort`, locally `none` | – |
| `LUMEN_TUTOR_RATE_LIMIT` | requests per minute and IP | 30 |
| `LUMEN_TUTOR=off` | rule tutor only | – |

The server's model (e.g. a cheap OpenRouter model, key only on the server) is the default; learners who want more can bring their own API key in the profile – it stays on the device and requests go straight to their provider. Before the model answers for the first time, Lux asks for consent and names model and provider; declining leaves the rule tutor. Every model reply can be reported in the chat (`GET /v1/admin/tutor-reports` for moderators).

Privacy: Lux sends the problem, the answer and the messages to the Lumen server and its model; the server only logs the reason for a fallback, never content. The model can be switched off in settings.

## Structure

```
packages/engine   headless engine: schema, widgets, checking, solver, evals, FSRS, progress   (MIT)
packages/cli      lumen check | build | keygen | schema | dev                                  (MIT)
apps/web          PWA (React + Vite + vite-plugin-pwa), IndexedDB as event log              (AGPL-3.0)
apps/server       sync, tutor and community API (Fastify, node:sqlite)                     (AGPL-3.0)
apps/mobile       Capacitor shell for the App Store and Google Play                        (AGPL-3.0)
deploy/           Dockerfiles, nginx, Caddy, backups
content/          paths, topics, concepts, skills, placement as YAML (de + en)              (CC BY-SA 4.0)
docs/             content format, self-hosting, VPS deployment, store release
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
- Community is opt-in and 16+: others see display name, username, preset avatar, streak, XP, level and league – never answers. Deleting the community profile (or the server data) removes everything social.
- Under 16 (GDPR Art. 8): kids mode, no community, sync only with a parent's consent.
- Export and deletion, locally and on the server, at the press of a button. No third-party SDKs, no tracking.
- Placement and grading are rule-based and deterministic (no ML/LLM), with the EU AI Act in mind.

The app ships privacy notice, terms with community rules and legal notice as templates (`#/legal/…`, operator details via `VITE_LUMEN_OPERATOR*`). Before running Lumen publicly, a legal review (trademark, terms, privacy policy) and a DPIA are required.

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
