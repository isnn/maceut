#!/usr/bin/env bash
# Nightly Postgres backup for the production stack (docs/operations/deploy.md §Backups).
#
#   scripts/backup-db.sh                 # dump into $BACKUP_DIR, prune old dumps
#   BACKUP_DIR=/mnt/x KEEP_DAYS=30 scripts/backup-db.sh
#
# Cron (as a user in the docker group), 02:30 server time:
#   30 2 * * * cd /srv/maceut && scripts/backup-db.sh >> /var/log/maceut-backup.log 2>&1
#
# Restore into a running stack (stops nothing; replaces the database's contents):
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
#     sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < dump.pgdump
#
# A dump on the same disk survives a bad migration or `down -v`, not a lost server:
# copy $BACKUP_DIR off the host as well (rclone to an R2 bucket, for example).
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/maceut}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/maceut-$(date -u +%Y%m%dT%H%M%SZ).pgdump"

# Custom format (-Fc): compressed, and pg_restore can restore single tables from it.
# Credentials come from the container's own environment, never this script.
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$out.partial"
mv "$out.partial" "$out"

# A dump that small is a failed one: keep the old ones and say so.
size=$(stat -c %s "$out")
if [ "$size" -lt 10240 ]; then
  echo "[backup] $out is only $size bytes — check it; nothing pruned" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'maceut-*.pgdump' -mtime +"$KEEP_DAYS" -delete
echo "[backup] $(date -u +%FT%TZ) $out ($((size / 1024)) KB)"
