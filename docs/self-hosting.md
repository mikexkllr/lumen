# Self-hosting Lumen

Lumen is local-first: lessons, progress, reviews, XP and streaks all live in the
browser. The Lumen server is optional and adds sync between devices, the Lux tutor with
a language model, and social features (profiles, friends, leagues, feed). Pick the
setup that fits:

| Option | What you get | You need |
|---|---|---|
| 1. Static PWA | all lessons offline, progress on the device, Lux as rule tutor | any static web host |
| 2. Simple compose | + sync, Lux with a model, social – on a LAN or behind your own proxy | Docker |
| 3. Production compose | + automatic HTTPS, hardening, backups | a server with a domain, Docker |

A German step-by-step guide for option 3 on a VPS is in [deploy-vps.md](deploy-vps.md).
Before you open an instance to the public, read [Running a public instance](#running-a-public-instance).

## 1. Static PWA without a server

```bash
npm ci
npm run build          # content bundles + app → apps/web/dist
```

Upload `apps/web/dist` to any static host. It must use HTTPS (or `localhost`): the app
verifies content bundles with WebCrypto, which browsers only offer in secure contexts.
Recommended host settings:

- `sw.js`, `index.html` and `content/manifest.json` with `Cache-Control: no-cache`;
  `assets/` and the other `content/` files are content-hashed and can be cached forever;
- `manifest.webmanifest` as `application/manifest+json`;
- unknown paths fall back to `index.html` (routes use `#/…`, so this only matters for typos).

Calls to `/api` simply fail, and the app keeps working offline. You can also run the web
image on its own: `docker build -f deploy/Dockerfile.web -t lumen-web . && docker run -p 8080:80 lumen-web`
(`/api` answers 502 after a few seconds).

## 2. Simple compose (same origin)

```bash
docker compose up -d --build     # http://localhost:8080 (website), the app at /app/
```

`docker-compose.yml` starts two containers: `web` (nginx with the PWA) proxies `/api/` to
`sync` (the Lumen server) with the prefix stripped, so the app and API share one origin and
need no CORS. The server's SQLite database lives in the `lumen-data` volume. Lux uses the
rule tutor (`LUMEN_TUTOR: "off"`); to use a model, replace that line in the `sync` service
with the `LUMEN_TUTOR_*` variables below.

**HTTPS is required except on `localhost`.** The app verifies every content bundle with
WebCrypto (`crypto.subtle`), and browsers provide WebCrypto, service workers and the
clipboard only in secure contexts. Opened as `http://192.168.x.y:8080`, lessons do not
load. Put a TLS proxy in front or use option 3.

## 3. Production compose (HTTPS)

```bash
cp .env.example .env               # set LUMEN_DOMAIN, LUMEN_ACME_EMAIL, operator details
docker compose -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` (project name `lumen-prod`) runs:

- **caddy** – the only container with open ports (80, 443 TCP/UDP). Gets and renews
  Let's Encrypt certificates for `LUMEN_DOMAIN`, redirects HTTP to HTTPS, adds HSTS and
  routes `/api/*` to `server` (prefix stripped) and everything else to `web`
  ([deploy/Caddyfile](../deploy/Caddyfile)).
- **web** – nginx with the PWA and the browser security headers
  ([deploy/nginx.conf.template](../deploy/nginx.conf.template)).
- **server** – the Lumen server with a read-only root filesystem, no Linux capabilities
  and the database in the `lumen-data` volume. Every variable in `.env` is passed to it.

Health check: `GET /api/healthz` returns `{"ok":true}`. Back up the database with
[deploy/backup.sh](../deploy/backup.sh) (`deploy/backup.sh restore <file>` restores).

## Default server, own servers and own AI keys

The build decides the default server: the website uses `/api` on its own origin, the store
apps use `VITE_LUMEN_API_URL` (your server). Learners can point the app to another Lumen
instance under *Profile → Server*; that instance must allow the app origins in
`LUMEN_CORS_ORIGINS`. Lux uses the server's model by default (`LUMEN_TUTOR_*`, the key stays
on the server); learners can bring their own key under *Profile → AI model for Lux*, and
then the device talks to their provider directly.

## Configuration reference

### Web app (build time)

`VITE_*` variables are compiled into the public JavaScript. Rebuild after changing them
(`--build`) and never put secrets in them. Empty values count as unset.

| Variable | Meaning | Default |
|---|---|---|
| `VITE_LUMEN_API_URL` | base URL of the Lumen server; absolute for native apps (`https://lumen.example.org/api`) | `/api` |
| `VITE_LUMEN_OPERATOR` | operator name for the in-app legal pages (`#/legal/privacy`, `#/legal/terms`, `#/legal/imprint`) | – |
| `VITE_LUMEN_OPERATOR_ADDRESS` | postal address; `\n` marks line breaks | – |
| `VITE_LUMEN_CONTACT` | contact e-mail | – |
| `VITE_LUMEN_PUBLIC_KEY` | Ed25519 public key for signed content bundles (see README) | – |
| `VITE_LUMEN_ISSUES_URL` | issue tracker URL for "report a problem" (otherwise the report is copied) | – |
| `VITE_LUMEN_SYNC_URL`, `VITE_LUMEN_TUTOR_URL` | legacy, replaced by `VITE_LUMEN_API_URL` | – |

### Web container (runtime, `deploy/Dockerfile.web`)

| Variable | Meaning | Default |
|---|---|---|
| `LUMEN_API_UPSTREAM` | where nginx proxies `/api/` | `http://sync:8787` (prod: `http://server:8787`) |
| `LUMEN_DNS_RESOLVER` | DNS resolver for the upstream name | `127.0.0.11` (Docker) |
| `LUMEN_CSP_CONNECT_SRC` | `connect-src` of the Content-Security-Policy. The default allows any https origin so learners can switch to another Lumen server and use their own AI key; `'self'` disables both on the website | `'self' https:` |

The CSP allows scripts only from the same origin (no inline scripts, no `eval`), inline
style attributes (needed by KaTeX), and `data:`/`blob:` images and fonts. If a user enters
a sync server on another origin in their profile, that origin must be in `connect-src` too.

### Server

| Variable | Meaning | Default |
|---|---|---|
| `PORT`, `HOST` | listen address | `8787`, `0.0.0.0` |
| `LUMEN_DB` | SQLite file | `apps/server/data/lumen.sqlite` (images: `/data/lumen.sqlite`) |
| `LUMEN_CORS_ORIGINS` | allowed browser origins, comma-separated; add `capacitor://localhost` and `https://localhost` for the native apps | `*` (prod compose: your domain + app origins) |
| `LUMEN_RATE_LIMIT` | requests per minute and IP | `120` |
| `LUMEN_SOCIAL` | `off` disables profiles, friends, leagues and feed | on |
| `LUMEN_ADMIN_TOKEN` | secret (≥ 16 characters) that enables the moderation endpoints `/v1/admin/*` | – (disabled) |
| `LUMEN_TUTOR` | `off`: Lux uses the rule tutor only | – |
| `LUMEN_TUTOR_URL` | OpenAI-compatible base URL, e.g. `https://openrouter.ai/api/v1` | `http://localhost:11434/v1` |
| `LUMEN_TUTOR_MODEL` | model name | `qwen3:1.7b` (local), `qwen/qwen3-30b-a3b` (remote) |
| `LUMEN_TUTOR_API_KEY` | API key for the model provider | – |
| `LUMEN_TUTOR_PROVIDER` | provider name shown in the app's consent dialog, e.g. `OpenRouter` | API host |
| `LUMEN_TUTOR_REASONING` | `reasoning_effort` sent to the model | `none` locally |
| `LUMEN_TUTOR_MAX_TOKENS`, `LUMEN_TUTOR_TEMPERATURE`, `LUMEN_TUTOR_TIMEOUT_MS` | model tuning | `220`, `0.3`, `20000` |
| `LUMEN_TUTOR_RATE_LIMIT` | tutor requests per minute and IP | `30` |

Leave unused variables out instead of setting them to an empty value. The server sits
behind a proxy that strips `/api`; it trusts `X-Forwarded-For` for rate limiting, so only
expose it through Caddy or the web container, never directly.

### Production compose only (`.env`)

| Variable | Meaning |
|---|---|
| `LUMEN_DOMAIN` | public hostname (DNS must point to the server) |
| `LUMEN_ACME_EMAIL` | contact address for Let's Encrypt |
| `LUMEN_BACKUP_DIR`, `LUMEN_BACKUP_KEEP` | backup target and number of backups kept (`./backups`, `14`) |

## Moderation

With `LUMEN_ADMIN_TOKEN` set (prod compose, replace the domain):

```bash
TOKEN=...   # the value from .env
curl -H "Authorization: Bearer $TOKEN" https://lumen.example.org/api/v1/admin/reports
curl -H "Authorization: Bearer $TOKEN" https://lumen.example.org/api/v1/admin/users/<userId or @handle>
curl -X POST -H "Authorization: Bearer $TOKEN" https://lumen.example.org/api/v1/admin/users/<userId>/ban
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"banned":false}' https://lumen.example.org/api/v1/admin/users/<userId>/ban
curl -X POST -H "Authorization: Bearer $TOKEN" https://lumen.example.org/api/v1/admin/users/<userId>/reset-name
curl -X POST -H "Authorization: Bearer $TOKEN" https://lumen.example.org/api/v1/admin/reports/<id>/resolve
```

`GET /v1/admin/reports?resolved=1` lists resolved reports. Without a token the admin
endpoints answer 404.

## Running a public instance

- **AGPL:** the web app and server are AGPL-3.0-or-later. If you change them and let
  others use your instance, offer them the source code of your version.
- **Name and logo:** see [TRADEMARK.md](../TRADEMARK.md).
- **Legal pages:** set the operator variables. The in-app privacy notice, terms and
  legal notice are templates that describe what the code does; have them reviewed for
  your jurisdiction. Under the GDPR you also need a record of processing activities, a
  data processing agreement with your hosting and model provider, and possibly a DPIA.
- **Moderation:** social features contain user-chosen names. Set `LUMEN_ADMIN_TOKEN` and
  check reports regularly, or disable social with `LUMEN_SOCIAL=off`.
- **Lux:** with a hosted model, the problem, the learner's answer and chat messages go
  to the model provider. Choose a provider and model whose data policy fits (e.g. no
  training on inputs, EU hosting) and name it in the privacy notice.
- **Updates and backups:** see [deploy-vps.md](deploy-vps.md).
