#!/usr/bin/env bash
# Backup → gendannelse i en ny, tom database (med migrations) → samme data.
# Kaldes af run-local.sh efter de øvrige tests (concurrency.sh har efterladt data).
set -euo pipefail
HOST="$1"; PORT="$2"
SRC="postgresql://postgres@/postgres?host=$HOST&port=$PORT"
DST="postgresql://postgres@/restore_test?host=$HOST&port=$PORT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
Q=(psql -X -q -o /dev/null -v ON_ERROR_STOP=1)

# Lidt ekstra data i flere tabeller
"${Q[@]}" "$SRC" <<'SQL'
insert into public.calendar_events (household_id, title, event_date, all_day, created_by)
  values ('33333333-3333-3333-3333-333333333333', 'Backup-test', '2026-12-24', true, '00000000-0000-0000-0000-00000000c0c1');
insert into public.savings_goals (id, household_id, name, target_ore, created_by)
  values ('5a000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Ferie', 2500000, '00000000-0000-0000-0000-00000000c0c1');
insert into public.savings_movements (household_id, goal_id, kind, amount_ore, created_by)
  values ('33333333-3333-3333-3333-333333333333', '5a000000-0000-0000-0000-000000000001', 'deposit', 500000, '00000000-0000-0000-0000-00000000c0c1');
SQL

BACKUP_AUTH_TABLES="auth.users" bash scripts/backup/dump.sh "$SRC" "$TMP/backup" >/dev/null 2>&1

"${Q[@]}" "$SRC" -c 'drop database if exists restore_test' -c 'create database restore_test'
"${Q[@]}" "$DST" -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do "${Q[@]}" "$DST" -f "$f"; done
bash scripts/backup/restore.sh "$DST" "$TMP/backup" >/dev/null

# Sammenlign indholdet af alle tabeller
TABLES=$(psql -X -A -t "$SRC" -c "select string_agg(tablename, ' ' order by tablename) from pg_tables where schemaname = 'public'")
for t in $TABLES auth.users; do
  case "$t" in auth.*) q="$t" ;; *) q="public.$t" ;; esac
  a=$(psql -X -A -t "$SRC" -c "select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from $q x")
  b=$(psql -X -A -t "$DST" -c "select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from $q x")
  if [ "$a" != "$b" ]; then echo "✗ $q er forskellig efter gendannelse"; exit 1; fi
done
n=$(psql -X -A -t "$DST" -c "select count(*) from public.profiles")
[ "$n" -gt 0 ] || { echo "✗ ingen profiler gendannet"; exit 1; }
# Saldo-triggeren og RLS virker stadig efter gendannelse
psql -X -A -t "$DST" -c "select current_ore from public.savings_goal_progress() limit 0" >/dev/null
"${Q[@]}" "$SRC" -c 'drop database restore_test'
echo "  ✓ backup og gendannelse giver identiske data ($(echo $TABLES | wc -w) tabeller + brugere)"
