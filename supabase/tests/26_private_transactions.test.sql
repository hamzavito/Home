-- Private og fælles udgifter
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hamza@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'sumaya@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mad', '00000000-0000-0000-0000-0000000000a1');
insert into private.bank_connections (id, household_id, user_id, aspsp_name, state_hash, status, valid_until) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Lunar', repeat('a', 64), 'active', now() + interval '100 days');
insert into private.bank_accounts (id, connection_id, household_id, user_id, account_uid, name) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-1', 'Konto');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------- ny udgift er privat
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare cur date := date_trunc('month', now())::date; t record;
begin
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
  values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 25000, cur, 'Min frisør');
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, visibility)
  values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 40000, cur, 'Netto', 'shared');
  select * into t from public.transactions where description = 'Min frisør';
  assert t.visibility = 'private', 'ny udgift er privat som standard';
  insert into ctx values ('frisor', t.id), ('netto', (select id from public.transactions where description = 'Netto'));
  assert (select spent_ore from public.budget_month_summary(cur) where name = 'Mad') = 40000, 'kun fælles udgifter tæller i budgettet';
  assert (select count(*) from public.transactions) = 2, 'ejeren ser sin private udgift';
end $$;

-- Partneren ser ikke den private og kan hverken rette eller slette den
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare n int; ok boolean;
begin
  assert (select count(*) from public.transactions) = 1, 'partneren ser kun den fælles';
  assert not exists (select 1 from public.transactions where description = 'Min frisør'), 'privat er skjult';
  update public.transactions set amount_ore = 1 where id = (select v from ctx where k = 'frisor')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'kan ikke rette privat';
  delete from public.transactions where id = (select v from ctx where k = 'frisor')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'kan ikke slette privat';
  -- Kan ikke gøre den andens fælles udgift privat (og dermed skjule/stjæle den)
  begin
    update public.transactions set visibility = 'private' where id = (select v from ctx where k = 'netto')::uuid;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'partneren kan ikke gøre andres udgift privat';
  assert (select spent_ore from public.budget_month_summary(date_trunc('month', now())::date) where name = 'Mad') = 40000, 'samme budget for begge';
end $$;

-- Ejeren gør den fælles → partneren ser den, og den tæller
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.transactions set visibility = 'shared' where id = (select v from ctx where k = 'frisor')::uuid;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert exists (select 1 from public.transactions where description = 'Min frisør'), 'nu fælles';
  assert (select spent_ore from public.budget_month_summary(date_trunc('month', now())::date) where name = 'Mad') = 65000, 'tæller nu';
end $$;
-- og tilbage til privat
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.transactions set visibility = 'private' where id = (select v from ctx where k = 'frisor')::uuid;

-- ---------------------------------------------------------------- kvitteringer følger udgiften
reset role;
insert into public.receipts (household_id, status, retention, approved_at, storage_path, uploaded_by, transaction_id, id)
values ('11111111-1111-1111-1111-111111111111', 'approved', 'permanent', now(), '11111111-1111-1111-1111-111111111111/7e000000-0000-0000-0000-0000000000a1.jpg',
        '00000000-0000-0000-0000-0000000000a1', (select v from ctx where k = 'frisor')::uuid, '7e000000-0000-0000-0000-0000000000a1');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select count(*) from public.receipts) = 0, 'partneren ser ikke kvitteringen til en privat udgift';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.receipts) = 1, 'ejeren ser sin kvittering';
end $$;

-- ---------------------------------------------------------------- bank: privat, indtil man vælger fælles; butikken huskes
reset role;
select public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
  jsonb_build_object('external_id', repeat('1', 64), 'booked_on', current_date, 'amount_ore', -14995, 'description', 'NETTO 1234', 'counterparty', 'Netto'),
  jsonb_build_object('external_id', repeat('2', 64), 'booked_on', current_date, 'amount_ore', -5000, 'description', 'NETTO 5678', 'counterparty', 'Netto')));
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare tid uuid;
begin
  tid := public.bank_import((select id from public.bank_transactions where external_id = repeat('1', 64)), 'c0000000-0000-0000-0000-000000000001', 'Netto');
  assert (select visibility from public.transactions where id = tid) = 'private', 'bankudgift er privat';
  -- Den anden Netto-postering kom automatisk med (husket butik) – også privat
  assert (select visibility from public.transactions t join public.bank_transactions b on b.transaction_id = t.id where b.external_id = repeat('2', 64)) = 'private', 'husket butik: privat';
  -- Ejeren vælger fælles → huskes for butikken
  update public.transactions set visibility = 'shared' where id = tid;
  insert into ctx values ('tid', tid);
end $$;
reset role;
do $$ begin
  assert (select shared from private.bank_merchant_rules where merchant_key = 'netto'), 'butikken huskes som fælles';
end $$;
select public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
  jsonb_build_object('external_id', repeat('3', 64), 'booked_on', current_date, 'amount_ore', -8800, 'description', 'NETTO 9', 'counterparty', 'Netto')));
do $$ begin
  assert (select visibility from public.transactions t join public.bank_transactions b on b.transaction_id = t.id where b.external_id = repeat('3', 64)) = 'shared', 'næste køb i samme butik bliver fælles';
end $$;

-- ---------------------------------------------------------------- betalte kommende udgifter er fælles
do $$ begin
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, source, created_by)
  values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 100, current_date, 'Tandlæge', 'upcoming', '00000000-0000-0000-0000-0000000000a1');
  assert (select visibility from public.transactions where description = 'Tandlæge') = 'shared', 'kommende udgift er fælles';
end $$;
rollback;
