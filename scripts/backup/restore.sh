#!/usr/bin/env bash
# Gendanner en backup i en database, hvor migrations allerede er kørt.
# Brug: restore.sh <database-url> <backup-mappe>
# Alt sker i én transaktion: fejler noget, ændres intet.
# session_replication_role = replica slår triggere og fremmednøgletjek fra under
# indlæsningen (samme fremgangsmåde som Supabase' egen vejledning), så rækkerne
# kan indlæses i vilkårlig rækkefølge og profiler ikke oprettes to gange.
set -euo pipefail
DB="$1"
DIR="$2"
psql "$DB" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -c 'set session_replication_role = replica' \
  -f "$DIR/auth.sql" \
  -f "$DIR/public.sql"
echo "✓ Backup gendannet fra $DIR"
