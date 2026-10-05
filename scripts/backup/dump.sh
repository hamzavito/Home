#!/usr/bin/env bash
# Laver en backup af databasen: brugere (auth) + alle data i public-skemaet.
# Brug: dump.sh <database-url> <output-mappe>
# Bruges af .github/workflows/backup.yml og testes af supabase/tests/backup_restore.sh.
set -euo pipefail
DB="$1"
OUT="$2"
mkdir -p "$OUT"

# Brugerkonti (inkl. adgangskode-hash) skal med, ellers kan profiler ikke gendannes.
AUTH_TABLES="${BACKUP_AUTH_TABLES:-auth.users auth.identities}"
auth_args=()
for t in $AUTH_TABLES; do auth_args+=("--table=$t"); done

pg_dump "$DB" --data-only --no-owner --no-privileges "${auth_args[@]}" -f "$OUT/auth.sql"
pg_dump "$DB" --data-only --no-owner --no-privileges --schema=public -f "$OUT/public.sql"
# Kun til reference – ved gendannelse oprettes skemaet med migrations
pg_dump "$DB" --schema-only --no-owner --no-privileges --schema=public -f "$OUT/schema-reference.sql"

{
  echo "Hjem backup"
  echo "Tidspunkt (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "pg_dump: $(pg_dump --version)"
  echo
  echo "Antal rækker:"
  psql "$DB" -X -A -t -c "select format('  %s: %s', relname, n_live_tup) from pg_stat_user_tables where schemaname = 'public' order by relname"
} > "$OUT/README.txt"
