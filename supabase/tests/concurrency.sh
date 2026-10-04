#!/usr/bin/env bash
# Samtidighedstest: to forbindelser godkender samme kvittering på samme tid
# (dobbelttryk fra to enheder). Der må kun opstå én transaktion.
# Kaldes af run-local.sh med PSQL-kommandoen som argumenter.
set -euo pipefail
PSQL=("$@")

"${PSQL[@]}" <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c0c1', 'c@test.dk');
insert into public.households (id, name) values ('33333333-3333-3333-3333-333333333333', 'C');
insert into public.household_members (household_id, user_id) values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-00000000c0c1');
insert into public.budget_categories (id, household_id, name, created_by)
  values ('c0000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-333333333333', 'Mad', '00000000-0000-0000-0000-00000000c0c1');
insert into public.receipts (id, household_id, status, storage_path, uploaded_by)
  values ('f0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'pending',
          '33333333-3333-3333-3333-333333333333/f0000000-0000-0000-0000-000000000001.jpg', '00000000-0000-0000-0000-00000000c0c1');
insert into storage.objects (bucket_id, name)
  values ('receipts', '33333333-3333-3333-3333-333333333333/f0000000-0000-0000-0000-000000000001.jpg');
SQL

APPROVE="set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c0c1';
begin;
select public.approve_receipt('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c1', 63875, current_date, 'Bilka', null, 'shared', null, '30d');
select pg_sleep(0.6);
commit;"

"${PSQL[@]}" -c "$APPROVE" &
P1=$!
sleep 0.15
"${PSQL[@]}" -c "$APPROVE" &
P2=$!
wait $P1
wait $P2

"${PSQL[@]}" <<'SQL'
do $$ begin
  assert (select count(*) from public.transactions where household_id = '33333333-3333-3333-3333-333333333333') = 1,
    'samtidig dobbelt godkendelse må kun give én transaktion';
  assert (select status from public.receipts where id = 'f0000000-0000-0000-0000-000000000001') = 'approved', 'godkendt';
end $$;
SQL
echo "  ✓ samtidig godkendelse giver én transaktion"

# To telefoner afslutter samme gentagende opgave samtidig → kun én næste forekomst
"${PSQL[@]}" <<'SQL'
insert into public.household_tasks (id, household_id, title, due_on, recurrence, created_by)
values ('f1000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Støvsuge', current_date, 'weekly', '00000000-0000-0000-0000-00000000c0c1');
SQL
DONE="set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c0c1';
begin;
select public.set_task_status('f1000000-0000-0000-0000-000000000001', 'done');
select pg_sleep(0.6);
commit;"
"${PSQL[@]}" -c "$DONE" &
P1=$!
sleep 0.15
"${PSQL[@]}" -c "$DONE" &
P2=$!
wait $P1
wait $P2
"${PSQL[@]}" <<'SQL'
do $$ begin
  assert (select count(*) from public.household_tasks where title = 'Støvsuge') = 2, 'samtidig afslutning må kun give én ny forekomst';
end $$;
SQL
echo "  ✓ samtidig afslutning af gentagende opgave giver én ny forekomst"
