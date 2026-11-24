#!/usr/bin/env bash
# Deploy Lumen to the VPS (ssh host "vps"): build site + app here, build images there.
#   deploy/vps/deploy.sh            # first run also installs compose file, .env and Caddy site
#   SKIP_CADDY=1 deploy/vps/deploy.sh   # before DNS points at the VPS (avoids failed certificate requests)
set -euo pipefail
cd "$(dirname "$0")/../.."
ORIGIN="${LUMEN_SITE_ORIGIN:-https://lumen.mikekeller.cloud}"
HOST="${LUMEN_VPS:-vps}"
DIR=/opt/sites/lumen

echo "› building app (base /app/) and website"
LUMEN_BASE=/app/ VITE_LUMEN_SYNC_URL="$ORIGIN/api" npm run build
LUMEN_SITE_ORIGIN="$ORIGIN" node scripts/build-site.ts

echo "› uploading sources"
ssh "$HOST" "mkdir -p $DIR/src"
COPYFILE_DISABLE=1 tar -cz --no-mac-metadata --no-xattrs --exclude node_modules --exclude '*.map' --exclude 'apps/server/data' \
  package.json package-lock.json packages apps deploy site \
  | ssh "$HOST" "rm -rf $DIR/src && mkdir -p $DIR/src && tar -xz -C $DIR/src"

echo "› building images and restarting"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd $DIR
cp src/deploy/vps/docker-compose.yml docker-compose.yml
[ -f .env ] || cp src/deploy/vps/env.example .env
chmod 600 .env
docker build -q -t lumen-web:latest -f src/deploy/vps/Dockerfile.web src
docker build -q -t lumen-sync:latest -f src/deploy/Dockerfile.server src
docker compose up -d --force-recreate
if [ "${SKIP_CADDY:-}" != 1 ]; then
  cp src/deploy/vps/lumen.caddy /opt/proxy/sites/lumen.caddy
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile
fi
docker image prune -f >/dev/null
docker compose ps
REMOTE
echo "✓ deployed → $ORIGIN"
