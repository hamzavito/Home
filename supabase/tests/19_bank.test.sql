-- Bankforbindelse: indbakke, frasortering, godkendelse, adgang
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
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Mad', '00000000-0000-0000-0000-0000000000a1'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B-mad', '00000000-0000-0000-0000-0000000000b1');
-- Tidligere køb i Netto (kategoriforslag) og en scannet kvittering på 14 kr. (dublet)
insert into public.transactions (id, household_id, category_id, amount_ore, occurred_on, description, created_by) values
  ('7e000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', 9900, '2026-09-01', 'Netto', '00000000-0000-0000-0000-0000000000a1'),
  ('7e000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', 1400, '2026-10-06', 'Føtex', '00000000-0000-0000-0000-0000000000a1');

do $$ begin
  assert not has_function_privilege('authenticated', 'public.bank_ingest(uuid, jsonb)', 'execute'), 'kun Edge Function kan indlæse';
  assert not has_function_privilege('authenticated', 'public.bank_connection_activate(uuid, text, text, timestamptz, jsonb)', 'execute'), 'kun Edge Function kan aktivere';
  assert not has_table_privilege('authenticated', 'private.bank_connections', 'select'), 'forbindelser er private';
  assert not has_table_privilege('authenticated', 'public.bank_transactions', 'insert'), 'kan ikke indsætte posteringer selv';
end $$;

-- ---------------------------------------------------------------- forbind (som Edge Functionen)
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
do $$
declare ok boolean;
begin
  perform public.bank_connection_start('00000000-0000-0000-0000-0000000000a1', 'Danske Bank', 'DK', 'state-a1-xxxxxxxxxxxxxxxx');
  insert into ctx values ('c1', public.bank_connection_activate('00000000-0000-0000-0000-0000000000a1', 'state-a1-xxxxxxxxxxxxxxxx', 'sess-1', now() + interval '180 days',
    '[{"uid": "acc-1", "name": "Lønkonto", "iban": "DK11 1111 1111 1111 11"}, {"uid": "acc-2", "name": "Opsparing", "iban": "DK2222222222222222"}]')::text);
  -- Forkert state eller anden bruger virker ikke
  begin
    perform public.bank_connection_activate('00000000-0000-0000-0000-0000000000a2', 'state-a1-xxxxxxxxxxxxxxxx', 'sess-x', now(), '[]');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'state er bundet til brugeren og kan kun bruges én gang';
  perform public.bank_connection_start('00000000-0000-0000-0000-0000000000a2', 'Nordea', 'DK', 'state-a2-xxxxxxxxxxxxxxxx');
  perform public.bank_connection_activate('00000000-0000-0000-0000-0000000000a2', 'state-a2-xxxxxxxxxxxxxxxx', 'sess-2', now() + interval '180 days',
    '[{"uid": "acc-3", "name": "Budgetkonto", "iban": "DK3333333333333333"}]');
  assert (select count(*) from public.bank_sync_targets(null)) = 3, 'tre konti at hente fra';
  assert (select count(*) from public.bank_sync_targets('00000000-0000-0000-0000-0000000000a1')) = 2, 'egne konti';
  assert (select since from public.bank_sync_targets('00000000-0000-0000-0000-0000000000a1') limit 1) = current_date - 30, 'første gang: 30 dage tilbage';
end $$;

-- ---------------------------------------------------------------- indlæs
do $$
declare acc1 uuid := (select id from private.bank_accounts where account_uid = 'acc-1');
declare acc3 uuid := (select id from private.bank_accounts where account_uid = 'acc-3');
declare n int;
begin
  n := public.bank_ingest(acc1, jsonb_build_array(
    jsonb_build_object('external_id', repeat('1', 64), 'booked_on', '2026-10-05', 'amount_ore', -5000, 'description', 'NETTO 1234 AARHUS', 'counterparty', 'Netto'),
    jsonb_build_object('external_id', repeat('2', 64), 'booked_on', '2026-10-05', 'amount_ore', -3000, 'description', 'Reserveret', 'pending', true),
    jsonb_build_object('external_id', repeat('3', 64), 'booked_on', '2026-10-05', 'amount_ore', -100000, 'description', 'Til opsparing', 'counterparty_iban', 'DK2222222222222222'),
    jsonb_build_object('external_id', repeat('4', 64), 'booked_on', '2026-09-30', 'amount_ore', 2500000, 'description', 'LØN SEPTEMBER', 'counterparty', 'Arbejdsgiver A/S'),
    jsonb_build_object('external_id', repeat('5', 64), 'booked_on', '2026-10-07', 'amount_ore', -1400, 'description', 'FØTEX', 'counterparty', 'Føtex'),
    jsonb_build_object('external_id', repeat('6', 64), 'booked_on', '2026-10-04', 'amount_ore', -20000, 'description', 'Til Sara')
  ));
  assert n = 5, 'reservationen springes over';
  -- Samme posteringer igen (næste dags hentning overlapper): ingen dubletter
  n := public.bank_ingest(acc1, jsonb_build_array(jsonb_build_object('external_id', repeat('1', 64), 'booked_on', '2026-10-05', 'amount_ore', -5000, 'description', 'NETTO')));
  assert n = 0, 'ingen dubletter';
  -- Sara modtager 200 kr. samme dag på sin forbundne konto → overførsel mellem egne konti
  n := public.bank_ingest(acc3, jsonb_build_array(jsonb_build_object('external_id', repeat('7', 64), 'booked_on', '2026-10-04', 'amount_ore', 20000, 'description', 'Fra Hamza')));
  assert (select state from public.bank_transactions where external_id = repeat('3', 64)) = 'transfer', 'overførsel til egen konto (IBAN)';
  assert (select state from public.bank_transactions where external_id = repeat('6', 64)) = 'transfer', 'overførsel mellem husstandens konti (beløb og dato)';
  assert (select state from public.bank_transactions where external_id = repeat('7', 64)) = 'transfer', 'også modtagersiden';
  assert (select suggested_category_id from public.bank_transactions where external_id = repeat('1', 64)) = 'c0000000-0000-0000-0000-0000000000a1', 'kategoriforslag fra tidligere køb';
  assert (select possible_duplicate_id from public.bank_transactions where external_id = repeat('5', 64)) = '7e000000-0000-0000-0000-000000000002', 'mulig dublet af kvitteringen';
  assert (select suggested_category_id is null from public.bank_transactions where external_id = repeat('4', 64)), 'indtægter får ingen udgiftskategori';
end $$;

-- ---------------------------------------------------------------- adgang til indbakken
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.bank_transactions) = 1, 'partneren ser kun sine egne posteringer';
  begin
    perform public.bank_import((select id from public.bank_transactions where external_id = repeat('1', 64)), 'c0000000-0000-0000-0000-0000000000a1');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'kan ikke godkende andres posteringer';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.bank_transactions) = 0, 'anden husstand ser intet';
end $$;

-- ---------------------------------------------------------------- godkend
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare bid uuid := (select id from public.bank_transactions where external_id = repeat('1', 64));
declare tid uuid; ok boolean;
begin
  assert (select count(*) from public.bank_transactions where state = 'new') = 3, 'tre nye (udgift, løn, mulig dublet)';
  assert (select array_agg(name order by name) from (select unnest(accounts) as name from public.bank_connection_list()) x) = '{Lønkonto,Opsparing}', 'kontonavne vises';
  begin
    perform public.bank_import(bid, null);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'udgift kræver kategori';
  begin
    perform public.bank_import(bid, 'c0000000-0000-0000-0000-0000000000b1');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kun egen husstands kategorier';
  tid := public.bank_import(bid, 'c0000000-0000-0000-0000-0000000000a1');
  assert (select amount_ore = 5000 and source = 'bank' and description = 'Netto' and paid_by_user_id = auth.uid() and occurred_on = '2026-10-05'
          from public.transactions where id = tid), 'udgift oprettet (positivt beløb, modpartens navn)';
  assert public.bank_import(bid, 'c0000000-0000-0000-0000-0000000000a1') = tid, 'dobbelttryk giver samme udgift';
  assert (select count(*) from public.transactions where source = 'bank') = 1, 'kun én';

  -- Løn → indtægt
  tid := public.bank_import((select id from public.bank_transactions where external_id = repeat('4', 64)), null, 'Løn');
  assert (select amount_ore = 2500000 and description = 'Løn' and received_by_user_id = auth.uid() from public.income_entries where id = tid), 'indtægt oprettet';

  -- Mulig dublet kobles til kvitteringen
  perform public.bank_link_existing((select id from public.bank_transactions where external_id = repeat('5', 64)), '7e000000-0000-0000-0000-000000000002');
  assert (select state = 'imported' and transaction_id = '7e000000-0000-0000-0000-000000000002' from public.bank_transactions where external_id = repeat('5', 64)), 'koblet';
  assert (select count(*) from public.transactions where amount_ore = 1400) = 1, 'ingen dobbelt udgift';

  -- Ignorér og fortryd; en overførsel kan alligevel tages med
  perform public.bank_set_ignored((select id from public.bank_transactions where external_id = repeat('6', 64)), false);
  assert (select state from public.bank_transactions where external_id = repeat('6', 64)) = 'new', 'overførsel flyttet til nye';
  perform public.bank_set_ignored((select id from public.bank_transactions where external_id = repeat('6', 64)), true);
  assert (select state from public.bank_transactions where external_id = repeat('6', 64)) = 'ignored', 'ignoreret';
end $$;

-- Skrivebeskyttet abonnement: kan ikke godkende
reset role;
update private.app_settings set billing_enabled = true;
insert into public.household_subscriptions (household_id, status) values ('11111111-1111-1111-1111-111111111111', 'canceled')
  on conflict (household_id) do update set status = 'canceled', trial_ends_at = null;
set local role authenticated;
do $$
declare ok boolean;
begin
  begin
    perform public.bank_set_ignored((select id from public.bank_transactions where external_id = repeat('6', 64)), false);
    perform public.bank_import((select id from public.bank_transactions where external_id = repeat('6', 64)), 'c0000000-0000-0000-0000-0000000000a1');
    ok := false;
  exception when sqlstate 'PT402' then ok := true;
  end;
  assert ok, 'skrivebeskyttet';
end $$;
reset role;
update private.app_settings set billing_enabled = false;

-- ---------------------------------------------------------------- fjern forbindelse og forlad husstand
do $$
declare s text;
begin
  s := public.bank_connection_revoke('00000000-0000-0000-0000-0000000000a1', (select v from ctx where k = 'c1')::uuid);
  assert s = 'sess-1', 'session-id returneres, så den kan lukkes hos banken';
  assert not exists (select 1 from public.bank_transactions b join private.bank_accounts a on a.id = b.account_id
                     where a.connection_id = (select v from ctx where k = 'c1')::uuid and b.state <> 'imported'), 'ubehandlede fjernes';
  assert (select count(*) from public.bank_transactions where state = 'imported' and user_id = '00000000-0000-0000-0000-0000000000a1') = 3, 'godkendte bliver';
  assert (select count(*) from public.bank_sync_targets('00000000-0000-0000-0000-0000000000a1')) = 0, 'hentes ikke længere';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  perform public.household_leave();
end $$;
reset role;
do $$ begin
  assert (select status from private.bank_connections where user_id = '00000000-0000-0000-0000-0000000000a2') = 'revoked', 'forbindelsen stoppes, når man forlader husstanden';
  assert not exists (select 1 from public.bank_transactions where user_id = '00000000-0000-0000-0000-0000000000a2'), 'ubehandlede posteringer fjernes';
end $$;

-- Udløbet samtykke (180 dage) markeres og hentes ikke
do $$ begin
  perform public.bank_connection_start('00000000-0000-0000-0000-0000000000a1', 'Lunar', 'DK', 'state-a1-yyyyyyyyyyyyyyyy');
  perform public.bank_connection_activate('00000000-0000-0000-0000-0000000000a1', 'state-a1-yyyyyyyyyyyyyyyy', 'sess-3', now() + interval '180 days', '[{"uid": "acc-9", "name": "Lunar"}]');
  update private.bank_connections set valid_until = now() - interval '1 minute' where session_id = 'sess-3';
  assert (select count(*) from public.bank_sync_targets('00000000-0000-0000-0000-0000000000a1')) = 0, 'udløbet hentes ikke';
  assert (select status from private.bank_connections where aspsp_name = 'Lunar') = 'expired', 'markeret udløbet';
end $$;
rollback;
