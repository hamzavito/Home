-- Bank: faste udgifter fra posteringer, indtægter automatisk
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');
insert into public.fixed_groups (id, household_id, name, created_by) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Bolig', '00000000-0000-0000-0000-0000000000a1'),
  ('f0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B-bolig', '00000000-0000-0000-0000-0000000000b1');
insert into private.bank_connections (id, household_id, user_id, aspsp_name, state_hash, status, valid_until) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Lunar', repeat('a', 64), 'active', now() + interval '100 days');
insert into private.bank_accounts (id, connection_id, household_id, user_id, account_uid, name) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-1', 'Lønkonto'),
  ('b1000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-2', 'Opsparing');

do $$ begin
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('1', 64), 'booked_on', '2026-10-01', 'amount_ore', -950000, 'description', 'HUSLEJE OKT', 'counterparty', 'Boligselskabet'),
    jsonb_build_object('external_id', repeat('2', 64), 'booked_on', '2026-09-01', 'amount_ore', -950000, 'description', 'HUSLEJE SEP', 'counterparty', 'Boligselskabet'),
    jsonb_build_object('external_id', repeat('3', 64), 'booked_on', '2026-10-02', 'amount_ore', -9900, 'description', 'NETFLIX', 'counterparty', 'Netflix'),
    jsonb_build_object('external_id', repeat('4', 64), 'booked_on', '2026-09-30', 'amount_ore', 2500000, 'description', 'LØN', 'counterparty', 'Arbejdsgiver'),
    jsonb_build_object('external_id', repeat('5', 64), 'booked_on', '2026-10-05', 'amount_ore', 50000, 'description', 'Til opsparing'),
    jsonb_build_object('external_id', repeat('a', 64), 'booked_on', '2026-10-06', 'amount_ore', 25000, 'description', 'MobilePay Sara', 'counterparty', 'Sara Jensen'),
    jsonb_build_object('external_id', repeat('b', 64), 'booked_on', '2026-10-06', 'amount_ore', 15000, 'description', 'Overførsel', 'counterparty', 'MOBILEPAY')
  ));
  -- Den anden side af overførslen (egen konto) samme dag
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a2', jsonb_build_array(
    jsonb_build_object('external_id', repeat('6', 64), 'booked_on', '2026-10-05', 'amount_ore', -50000, 'description', 'Fra lønkonto')));
  assert not has_function_privilege('authenticated', 'public.bank_auto_income(uuid)', 'execute'), 'kun Edge Function';
end $$;

-- ---------------------------------------------------------------- indtægter automatisk
do $$
declare n int;
begin
  assert (select state from public.bank_transactions where external_id = repeat('4', 64)) = 'new', 'venter til efter hentningen';
  n := public.bank_auto_income(null);
  assert n = 1, 'kun lønnen (overførslen er parret, MobilePay venter)';
  assert (select count(*) from public.bank_transactions where external_id in (repeat('a', 64), repeat('b', 64)) and state = 'new') = 2, 'MobilePay venter på godkendelse';
  assert private.is_mobilepay(null, 'MobilePay Sara') and private.is_mobilepay('MOBILEPAY', 'x') and private.is_mobilepay(null, 'Mobile Pay 1234'), 'MobilePay genkendes';
  assert not private.is_mobilepay('Arbejdsgiver', 'LØN'), 'løn er ikke MobilePay';
  assert (select state from public.bank_transactions where external_id = repeat('4', 64)) = 'imported', 'løn godkendt';
  assert (select amount_ore = 2500000 and description = 'Arbejdsgiver' and source = 'bank' and received_by_user_id = '00000000-0000-0000-0000-0000000000a1'
          from public.income_entries where description = 'Arbejdsgiver'), 'som indtægt';
  assert (select state from public.bank_transactions where external_id = repeat('5', 64)) = 'transfer', 'overførsel ikke indtægt';
  assert public.bank_auto_income(null) = 0, 'intet igen';
end $$;

-- ---------------------------------------------------------------- fast udgift
create temp table ctx_items (id uuid);
grant all on ctx_items to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare item uuid; ok boolean;
begin
  begin
    perform public.bank_mark_fixed((select id from public.bank_transactions where external_id = repeat('1', 64)), null, 'Husleje', 'f0000000-0000-0000-0000-0000000000b1');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kun egne grupper';
  begin
    perform public.bank_mark_fixed((select id from public.bank_transactions where external_id = repeat('4', 64)), null, 'Løn', 'f0000000-0000-0000-0000-000000000001');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'indtægter kan ikke være faste udgifter';

  item := public.bank_mark_fixed((select id from public.bank_transactions where external_id = repeat('1', 64)), null, 'Husleje', 'f0000000-0000-0000-0000-000000000001');
  assert (select name = 'Husleje' and kind = 'expense' and group_id = 'f0000000-0000-0000-0000-000000000001' and payment_day = 1 from public.fixed_items where id = item), 'fast post oprettet';
  assert (select amount_ore = 950000 and frequency = 'monthly' from public.fixed_item_versions where item_id = item), '9.500 kr. om måneden';
  assert (select state = 'fixed' and fixed_item_id = item from public.bank_transactions where external_id = repeat('1', 64)), 'markeret fast';
  assert (select state = 'fixed' and fixed_item_id = item from public.bank_transactions where external_id = repeat('2', 64)), 'september-huslejen også';
  assert not exists (select 1 from public.transactions where description ilike '%boligselskab%'), 'tæller ikke som variabel udgift';
  assert public.bank_mark_fixed((select id from public.bank_transactions where external_id = repeat('1', 64)), null, 'Husleje', 'f0000000-0000-0000-0000-000000000001') = item, 'dobbelttryk: samme post';
  assert (select count(*) from public.fixed_items) = 1, 'kun én fast post';
  assert (select kind from public.bank_rules() where label = 'Boligselskabet') = 'fixed', 'husket som fast udgift';

  -- Netflix kobles til en eksisterende fast post (fx oprettet i hånden)
  insert into ctx_items values (public.create_fixed_item('expense', 'Streaming', 9900, 'monthly', null, 'f0000000-0000-0000-0000-000000000001'));
  item := (select id from ctx_items);
  assert public.bank_mark_fixed((select id from public.bank_transactions where external_id = repeat('3', 64)), item) = item, 'koblet til eksisterende';
  assert (select fixed_item_id from public.bank_transactions where external_id = repeat('3', 64)) = item, 'Netflix → Streaming';
  -- Fortryd: tag med alligevel
  perform public.bank_set_ignored((select id from public.bank_transactions where external_id = repeat('3', 64)), false);
  assert (select state = 'new' and fixed_item_id is null from public.bank_transactions where external_id = repeat('3', 64)), 'tilbage i indbakken';
end $$;

-- Partneren kan ikke markere Hamzas posteringer
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare ok boolean;
begin
  begin
    perform public.bank_mark_fixed((select x.id from public.bank_transactions x limit 0), null, 'X', 'f0000000-0000-0000-0000-000000000001');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'ingen adgang';
end $$;

-- Næste husleje kommer automatisk som fast udgift
reset role;
reset request.jwt.claim.sub;
do $$ begin
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('7', 64), 'booked_on', '2026-11-01', 'amount_ore', -950000, 'description', 'HUSLEJE NOV', 'counterparty', 'Boligselskabet')));
  assert (select state from public.bank_transactions where external_id = repeat('7', 64)) = 'fixed', 'november genkendt som fast udgift';
  assert (select suggested_category_id is null from public.bank_transactions where external_id = repeat('7', 64)), 'intet kategoriforslag for fast udgift';
end $$;

-- Arkiveret fast post: ingen automatik
update public.fixed_items set archived_at = now() where name = 'Husleje';
do $$ begin
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('8', 64), 'booked_on', '2026-12-01', 'amount_ore', -950000, 'description', 'HUSLEJE DEC', 'counterparty', 'Boligselskabet')));
  assert (select state from public.bank_transactions where external_id = repeat('8', 64)) = 'new', 'arkiveret: venter på godkendelse';
end $$;
rollback;
