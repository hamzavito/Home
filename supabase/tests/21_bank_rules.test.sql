-- Bank: husk butikken, godkend alle med forslag
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mad', '00000000-0000-0000-0000-0000000000a1'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Transport', '00000000-0000-0000-0000-0000000000a1');
insert into private.bank_connections (id, household_id, user_id, aspsp_name, state_hash, status, valid_until) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Lunar', repeat('a', 64), 'active', now() + interval '100 days'),
  ('b0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'Nordea', repeat('b', 64), 'active', now() + interval '100 days');
insert into private.bank_accounts (id, connection_id, household_id, user_id, account_uid, name) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-1', 'Konto'),
  ('b1000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'acc-2', 'Konto');
-- En scannet kvittering på 89,00 (dublet-kandidat)
insert into public.transactions (id, household_id, category_id, amount_ore, occurred_on, description, created_by) values
  ('7e000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 8900, '2026-10-03', 'Netto kvittering', '00000000-0000-0000-0000-0000000000a1');

do $$
declare n int;
begin
  assert private.merchant_key('Netto', 'NETTO 1234 AARHUS') = 'netto', 'modpartens navn';
  assert private.merchant_key(null, 'NETTO 1234 AARHUS C') = 'netto aarhus c', 'tekst uden tal';
  assert private.merchant_key(null, 'DSB *Billet 12/10') = 'dsb billet', 'tegn fjernes';
  n := public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('1', 64), 'booked_on', '2026-10-01', 'amount_ore', -5000, 'description', 'NETTO 1', 'counterparty', 'Netto'),
    jsonb_build_object('external_id', repeat('2', 64), 'booked_on', '2026-10-02', 'amount_ore', -7000, 'description', 'NETTO 2', 'counterparty', 'Netto'),
    jsonb_build_object('external_id', repeat('3', 64), 'booked_on', '2026-10-03', 'amount_ore', -8900, 'description', 'NETTO 3', 'counterparty', 'Netto'),
    jsonb_build_object('external_id', repeat('4', 64), 'booked_on', '2026-10-03', 'amount_ore', -3000, 'description', 'DSB', 'counterparty', 'DSB'),
    jsonb_build_object('external_id', repeat('5', 64), 'booked_on', '2026-10-04', 'amount_ore', 100000, 'description', 'Løn', 'counterparty', 'Firma')
  ));
  assert n = 5, 'fem indlæst';
  -- Partneren har også en Netto-postering
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a2', jsonb_build_array(
    jsonb_build_object('external_id', repeat('6', 64), 'booked_on', '2026-10-02', 'amount_ore', -4000, 'description', 'NETTO', 'counterparty', 'Netto')));
end $$;

-- ---------------------------------------------------------------- husk butikken
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.bank_import((select id from public.bank_transactions where external_id = repeat('1', 64)), 'c0000000-0000-0000-0000-000000000001');
  assert (select state from public.bank_transactions where external_id = repeat('2', 64)) = 'imported', 'anden Netto godkendt automatisk';
  assert (select t.category_id from public.transactions t join public.bank_transactions b on b.transaction_id = t.id where b.external_id = repeat('2', 64)) = 'c0000000-0000-0000-0000-000000000001', 'samme kategori';
  assert (select state from public.bank_transactions where external_id = repeat('3', 64)) = 'new', 'mulig dublet godkendes ikke automatisk';
  assert (select state from public.bank_transactions where external_id = repeat('4', 64)) = 'new', 'anden butik røres ikke';
  assert (select count(*) from public.bank_rules_list()) = 1, 'én husket butik';
  assert (select label from public.bank_rules_list()) = 'Netto', 'vist som Netto';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select state from public.bank_transactions where external_id = repeat('6', 64)) = 'new', 'partnerens Netto røres ikke (regler er personlige)';
  assert (select count(*) from public.bank_rules_list()) = 0, 'partneren har ingen regler';
end $$;
reset role;
-- Fremtidige Netto-køb godkendes ved indlæsning
do $$ begin
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('7', 64), 'booked_on', '2026-10-06', 'amount_ore', -1234, 'description', 'NETTO 99', 'counterparty', 'Netto')));
  assert (select state from public.bank_transactions where external_id = repeat('7', 64)) = 'imported', 'nyt Netto-køb kom automatisk ind';
  assert (select source from public.transactions t join public.bank_transactions b on b.transaction_id = t.id where b.external_id = repeat('7', 64)) = 'bank', 'som bankudgift';
end $$;

-- Skift kategori: reglen følger med
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.bank_import((select id from public.bank_transactions where external_id = repeat('3', 64)), 'c0000000-0000-0000-0000-000000000002');
  assert (select category_id from public.bank_rules_list()) = 'c0000000-0000-0000-0000-000000000002', 'reglen opdateret';
  -- Slå reglen fra
  perform public.bank_rule_disable((select id from public.bank_rules_list() limit 1));
  assert (select count(*) from public.bank_rules_list()) = 0, 'slået fra';
end $$;
reset role;
do $$ begin
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('8', 64), 'booked_on', '2026-10-07', 'amount_ore', -999, 'description', 'NETTO', 'counterparty', 'Netto')));
  assert (select state from public.bank_transactions where external_id = repeat('8', 64)) = 'new', 'slået fra: venter på godkendelse';
end $$;

-- ---------------------------------------------------------------- godkend alle med forslag
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare n int;
begin
  -- DSB har intet forslag; den nye Netto har forslag fra tidligere køb
  assert (select suggested_category_id is not null from public.bank_transactions where external_id = repeat('8', 64)), 'forslag ud fra tidligere køb';
  n := public.bank_import_suggested();
  assert n = 1, 'kun den med forslag';
  assert (select state from public.bank_transactions where external_id = repeat('4', 64)) = 'new', 'uden forslag bliver';
  assert (select state from public.bank_transactions where external_id = repeat('5', 64)) = 'new', 'indtægter bliver';
  assert public.bank_import_suggested() = 0, 'intet tilbage';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select state from public.bank_transactions where external_id = repeat('6', 64)) = 'new', 'partnerens røres ikke af andres "godkend alle"';
end $$;
reset role;
reset request.jwt.claim.sub; -- indlæsning sker som systemjob (Edge Function), ikke som bruger
-- Skrivebeskyttet: ingen automatik
update private.app_settings set billing_enabled = true;
update public.household_subscriptions set status = 'canceled', trial_ends_at = null where household_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  update private.bank_merchant_rules set active = true;
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('9', 64), 'booked_on', '2026-10-08', 'amount_ore', -555, 'description', 'NETTO', 'counterparty', 'Netto')));
  assert (select state from public.bank_transactions where external_id = repeat('9', 64)) = 'new', 'udløbet abonnement: ingen automatisk godkendelse';
end $$;
rollback;
