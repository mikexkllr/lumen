#!/bin/sh
# Lumen database backup and restore for docker-compose.prod.yml.
#
#   deploy/backup.sh                    online backup → backups/lumen-<UTC time>.sqlite.gz
#   deploy/backup.sh restore <file>     replace the database with a backup (.sqlite or .sqlite.gz)
#
# The backup runs inside the server container with node:sqlite (`VACUUM INTO`): a
# consistent snapshot of the live database including the WAL, taken while the server
# keeps running, then checked with PRAGMA integrity_check. Old backups are rotated.
#
# Settings (environment or .env): LUMEN_BACKUP_DIR (default ./backups, relative to the
# repository), LUMEN_BACKUP_KEEP (default 14), LUMEN_COMPOSE_FILE (default
# docker-compose.prod.yml), LUMEN_SERVICE (default server; use "sync" for docker-compose.yml).
#
# Daily at 03:15 via cron (crontab -e):
#   15 3 * * * cd /opt/lumen && deploy/backup.sh >> backups/backup.log 2>&1
# Copy the backups off the server as well (e.g. rsync, restic, borg) – a backup on the
# same disk does not survive the loss of that disk.
set -eu

cd "$(dirname "$0")/.."

# read a key from .env without executing it
envval() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -n 1 | sed "s/^['\"]//; s/['\"]\$//" || true; }
BACKUP_DIR=${LUMEN_BACKUP_DIR:-$(envval LUMEN_BACKUP_DIR)}
BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP=${LUMEN_BACKUP_KEEP:-$(envval LUMEN_BACKUP_KEEP)}
KEEP=${KEEP:-14}
COMPOSE_FILE_PATH=${LUMEN_COMPOSE_FILE:-docker-compose.prod.yml}
SERVICE=${LUMEN_SERVICE:-server}
DB=/data/lumen.sqlite

dc() { docker compose -f "$COMPOSE_FILE_PATH" "$@"; }
die() { echo "backup.sh: $*" >&2; exit 1; }
running() { [ -n "$(dc ps --status running -q "$SERVICE" 2>/dev/null)" ]; }

backup() {
  running || die "service '$SERVICE' is not running (start it, or set LUMEN_SERVICE / LUMEN_COMPOSE_FILE)"
  mkdir -p "$BACKUP_DIR"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  tmp="/data/.backup-$stamp.sqlite"
  out="$BACKUP_DIR/lumen-$stamp.sqlite"
  trap 'dc exec -T "$SERVICE" rm -f "$tmp" >/dev/null 2>&1 || true' EXIT
  dc exec -T "$SERVICE" node --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite");
    const [src, dst] = process.argv.slice(1);
    const db = new DatabaseSync(src);
    db.exec("PRAGMA busy_timeout = 10000");
    db.prepare("VACUUM INTO ?").run(dst);
    db.close();
    const copy = new DatabaseSync(dst, { readOnly: true });
    const res = Object.values(copy.prepare("PRAGMA integrity_check").get())[0];
    copy.close();
    if (res !== "ok") { console.error("integrity_check: " + res); process.exit(1); }
  ' "$DB" "$tmp"
  dc cp "$SERVICE:$tmp" "$out" >/dev/null 2>&1 || die "copying the backup out of the container failed"
  gzip -f "$out"
  echo "backup: $out.gz ($(wc -c < "$out.gz" | tr -d ' ') bytes)"
  # rotation: keep the newest $KEEP backups
  n=0
  for f in $(ls -1t "$BACKUP_DIR"/lumen-*.sqlite.gz 2>/dev/null); do
    n=$((n + 1))
    [ "$n" -gt "$KEEP" ] && rm -f "$f" && echo "rotated: $f"
  done
  trap - EXIT
  dc exec -T "$SERVICE" rm -f "$tmp"
}

restore() {
  src=${1:-}
  [ -f "$src" ] || die "usage: deploy/backup.sh restore <backup.sqlite[.gz]>"
  if [ "${LUMEN_YES:-}" != 1 ]; then
    printf 'Replace the Lumen database with %s? Everything since that backup is lost. Type "yes": ' "$src"
    read -r answer
    [ "$answer" = yes ] || die "aborted"
  fi
  if running; then echo "safety backup of the current database first:"; backup; fi
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  case "$src" in
    *.gz) gunzip -c "$src" > "$work/restore.sqlite" ;;
    *) cp "$src" "$work/restore.sqlite" ;;
  esac
  chmod 755 "$work" && chmod 644 "$work/restore.sqlite"
  dc stop "$SERVICE"
  # runs as the image's unprivileged user, who owns /data; the stale WAL must go
  dc run --rm --no-deps -T -v "$(cd "$work" && pwd)/restore.sqlite:/restore.sqlite:ro" "$SERVICE" \
    sh -c "cp /restore.sqlite $DB.restoring && rm -f $DB-wal $DB-shm && mv $DB.restoring $DB"
  dc start "$SERVICE"
  echo "restored $src"
}

case "${1:-backup}" in
  backup) backup ;;
  restore) shift; restore "$@" ;;
  *) die "usage: deploy/backup.sh [backup | restore <file>]" ;;
esac
