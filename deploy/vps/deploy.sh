#!/usr/bin/env bash
# Deploy Lumen to the VPS (ssh host "vps"), behind its shared Caddy.
# Normal releases go out automatically: GitHub Actions (CI → deploy job) ships the images
# after every green push to main. Use this script for the first install and for changes
# the pipeline cannot make: compose file, Caddy site, or deploying from a local checkout.
#   deploy/vps/deploy.sh                 # build, upload, restart
#   SKIP_CADDY=1 deploy/vps/deploy.sh    # before DNS points at the VPS (avoids failed certificate requests)
# The web app is built here (the 1 vCPU / 2 GB VPS has too little memory for the Vite
# build); the server image is built on the VPS. Configuration lives in /opt/sites/lumen/.env
# on the VPS (template: deploy/vps/env.example) – its public VITE_* lines are used for the build.
set -euo pipefail
cd "$(dirname "$0")/../.."
ORIGIN="${LUMEN_SITE_ORIGIN:-https://lumen.mikekeller.cloud}"
HOST="${LUMEN_VPS:-vps}"
DIR=/opt/sites/lumen

echo "› reading build settings from $HOST:$DIR/.env"
ssh "$HOST" "mkdir -p $DIR && { [ -f $DIR/.env ] || cat > $DIR/.env; chmod 600 $DIR/.env; }" < deploy/vps/env.example
while IFS= read -r line; do
  key="${line%%=*}"; val="${line#*=}"; val="${val#\'}"; val="${val%\'}"
  [ -n "$val" ] && export "$key=$val"
done < <(ssh "$HOST" "grep -E '^VITE_[A-Z_]+=' $DIR/.env" || true)

echo "› building app (base /app/) and website"
LUMEN_BASE=/app/ npm run build
LUMEN_SITE_ORIGIN="$ORIGIN" node scripts/build-site.ts

echo "› web image (built from the local build output)"
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
cp -R site "$STAGE/html"; cp -R apps/web/dist "$STAGE/html/app"; find "$STAGE/html" -name '*.map' -delete
mkdir -p "$STAGE/deploy"; cp deploy/nginx.conf.template "$STAGE/deploy/"
# the runtime half of deploy/Dockerfile.web
sed -n '/^FROM nginx/,$p' deploy/Dockerfile.web \
  | sed -e 's#^COPY --from=build /src/site /usr/share/nginx/html#COPY html /usr/share/nginx/html#' -e '/^COPY --from=build/d' \
  > "$STAGE/Dockerfile"
COPYFILE_DISABLE=1 tar -cz --no-mac-metadata --no-xattrs -C "$STAGE" . | ssh "$HOST" "docker build -q -t lumen-web:latest -"

echo "› server image (built on the VPS)"
COPYFILE_DISABLE=1 tar -cz --no-mac-metadata --no-xattrs --exclude node_modules --exclude dist --exclude 'apps/server/data' \
  package.json package-lock.json packages apps deploy/Dockerfile.server .dockerignore \
  | ssh "$HOST" "rm -rf $DIR/src && mkdir -p $DIR/src && tar -xz -C $DIR/src && docker build -q -t lumen-sync:latest -f $DIR/src/deploy/Dockerfile.server $DIR/src"

echo "› restarting"
scp -q deploy/vps/docker-compose.yml "$HOST:$DIR/docker-compose.yml"
[ "${SKIP_CADDY:-}" = 1 ] || scp -q deploy/vps/lumen.caddy "$HOST:/opt/proxy/sites/lumen.caddy"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd $DIR
docker compose up -d --force-recreate --wait
[ "${SKIP_CADDY:-}" = 1 ] || docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null
docker image prune -f >/dev/null
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
REMOTE
echo "✓ deployed → $ORIGIN"
