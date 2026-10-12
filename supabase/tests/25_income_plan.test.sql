-- Indtægtskilder, faktiske indtægter, bankmatch og månedens plan
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hamza@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'sumaya@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-x@internal.home'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'child'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');
insert into private.bank_connections (id, household_id, user_id, aspsp_name, state_hash, status, valid_until) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Lunar', repeat('a', 64), 'active', now() + interval '100 days');
insert into private.bank_accounts (id, connection_id, household_id, user_id, account_uid, name) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-1', 'Lønkonto');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

do $$ begin
  assert (select count(*) from public.income_types where household_id = '11111111-1111-1111-1111-111111111111') = 7, 'standardtyper oprettes for nye husstande';
  assert exists (select 1 from public.income_types where household_id = '11111111-1111-1111-1111-111111111111' and name = 'Børnepenge');
end $$;

-- ---------------------------------------------------------------- opsætning (som Hamza)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare cur date := date_trunc('month', now())::date; loen uuid := private.income_type_named(public.current_household_id(), 'Løn');
begin
  perform public.create_default_fixed_groups();
  perform public.create_fixed_item('expense', 'Faste udgifter i alt', 2382213, p_group_id => (select id from public.fixed_groups where name = 'Bolig'));
  insert into ctx values ('hamza', public.income_source_create('Løn – Hamza', loen, 'member', '00000000-0000-0000-0000-0000000000a1', 2900000));
  insert into ctx values ('sumaya', public.income_source_create('Løn – Sumaya', loen, 'member', '00000000-0000-0000-0000-0000000000a2', 2500000));
  insert into ctx values ('bonus', public.income_source_create('Bonus', private.income_type_named(public.current_household_id(), 'Bonus')));
  assert (select fixed_item_id is not null and owner_user_id = '00000000-0000-0000-0000-0000000000a1' and type_id = loen
          from public.income_sources where name = 'Løn – Hamza'), 'kilde med forventet beløb som fast indtægt';
  assert (select fixed_item_id is null from public.income_sources where name = 'Bonus'), 'kilde uden forventet beløb';
  -- Budgetkategorier: Buffer 2.000 fast, Mad 65 %, Hygge 35 %
  perform public.create_budget_category('Buffer', 'piggy-bank', '#0f6e66', 200000, null, 'reserve');
  perform public.create_budget_category('Mad', 'shopping-cart', '#5a3cf0', null, null, 'spending', 'percent', 6500);
  perform public.create_budget_category('Hygge', 'sparkles', '#a8336a', null, null, 'spending', 'percent', 3500);
end $$;

-- Ingen faktiske indtægter endnu: forventet beløb bruges og markeres
do $$
declare cur date := date_trunc('month', now())::date; p record;
begin
  assert (select status from public.month_income(cur) where name = 'Løn – Hamza') = 'expected', 'forventet';
  select * into p from public.month_plan(cur);
  assert p.income_ore = 5400000 and p.expected_income_ore = 5400000 and p.actual_income_ore = 0, 'forventet 29.000 + 25.000';
end $$;

-- ---------------------------------------------------------------- manuel løn uden bank (31. i måneden → den måned)
do $$
declare cur date := date_trunc('month', now())::date; last_day date := (date_trunc('month', now()) + interval '1 month - 1 day')::date; r record; p record;
begin
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source_id)
  values (public.current_household_id(), 2900000, last_day, 'Løn', 'member', '00000000-0000-0000-0000-0000000000a1', (select v from ctx where k = 'hamza')::uuid);
  select * into r from public.income_entries where description = 'Løn' and received_on = last_day;
  assert r.period_month = cur, 'gælder for måneden';
  assert r.type_id = private.income_type_named(public.current_household_id(), 'Løn'), 'type fra kilden';
  assert r.matched_by_user and r.match_confidence = 100, 'brugerens eget valg';
  select * into r from public.month_income(cur) where name = 'Løn – Hamza';
  assert r.status = 'actual' and r.used_ore = 2900000, 'Hamzas løn for måneden er faktisk 29.000';
  select * into p from public.month_plan(cur);
  assert p.actual_income_ore = 2900000 and p.expected_income_ore = 2500000, 'faktisk + Sumayas forventede';
end $$;

-- ---------------------------------------------------------------- fast beløb + procent, præcist i øre (eksemplet fra regnearket)
do $$
declare cur date := date_trunc('month', now())::date; p record;
begin
  -- Kun Hamzas løn: Sumaya stopper sin forventede løn fra denne måned
  delete from public.fixed_items where id = (select fixed_item_id from public.income_sources where name = 'Løn – Sumaya');
  assert (select fixed_item_id is null from public.income_sources where name = 'Løn – Sumaya'), 'kilden bevares uden forventet beløb';
  select * into p from public.month_plan(cur);
  assert p.income_ore = 2900000, format('indkomst 29.000 (fik %s)', p.income_ore);
  assert p.fixed_expenses_ore = 2382213, 'faste udgifter 23.822,13';
  assert p.available_ore = 517787, 'tilbage 5.177,87';
  assert p.fixed_allocations_ore = 200000, 'buffer 2.000';
  assert p.distributable_ore = 317787, 'til fordeling 3.177,87';
  assert (select budget_ore from public.budget_month_summary(cur) where name = 'Mad') = 206562, 'Mad 65 % = 2.065,62';
  assert (select budget_ore from public.budget_month_summary(cur) where name = 'Hygge') = 111225, 'Hygge 35 % = 1.112,25';
  assert p.allocated_ore = 517787 and p.unallocated_ore = 0, 'går præcis op i øre';
end $$;

-- ---------------------------------------------------------------- ufordelt og over 100 %
do $$
declare nxt date := (date_trunc('month', now()) + interval '1 month')::date; ok boolean; p record;
begin
  perform public.set_category_default((select id from public.budget_categories where name = 'Hygge'), nxt, null, 'percent', 1500);
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, source_id)
  values (public.current_household_id(), 2900000, nxt, 'Løn', 'shared', (select v from ctx where k = 'hamza')::uuid);
  select * into p from public.month_plan(nxt);
  assert p.percent_total_bp = 8000, '80 %';
  assert p.unallocated_ore = round(p.distributable_ore * 0.2), format('20 %% ufordelt (%s af %s)', p.unallocated_ore, p.distributable_ore);
  begin
    perform public.set_category_default((select id from public.budget_categories where name = 'Mad'), nxt, null, 'percent', 8600);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'over 100 % kan ikke gemmes';
end $$;

-- ---------------------------------------------------------------- månedsoverstyring kun for den valgte måned
do $$
declare cur date := date_trunc('month', now())::date; nxt date := (date_trunc('month', now()) + interval '1 month')::date;
        mad uuid := (select id from public.budget_categories where name = 'Mad'); hygge_before bigint;
begin
  hygge_before := (select budget_ore from public.budget_month_summary(cur) where name = 'Hygge');
  perform public.set_monthly_budget(mad, cur, 350000);
  assert (select budget_ore = 350000 and budget_source = 'override' and budget_mode = 'percent' and percent_bp = 6500
          from public.budget_month_summary(cur) where name = 'Mad'), 'manuel 3.500 i denne måned, standard 65 % huskes';
  assert (select budget_ore from public.budget_month_summary(cur) where name = 'Hygge') = hygge_before, 'Hygge uændret';
  assert (select budget_source from public.budget_month_summary(nxt) where name = 'Mad') = 'default', 'næste måned tilbage til 65 %';
  -- Fast beløb overstyret: resten til procentkategorierne vokser kun i den måned
  perform public.set_monthly_budget((select id from public.budget_categories where name = 'Buffer'), cur, 100000);
  assert (select distributable_ore from public.month_plan(cur)) = 417787, 'buffer 1.000 i denne måned → mere til fordeling';
  assert (select fixed_allocations_ore from public.month_plan(nxt)) = 200000, 'næste måned buffer 2.000';
  perform public.set_monthly_budget((select id from public.budget_categories where name = 'Buffer'), cur, null);
  perform public.set_monthly_budget(mad, cur, null);
end $$;

-- ---------------------------------------------------------------- bank: varierende løn genkendes
reset role;
do $$
declare cur date := date_trunc('month', now())::date; e record; n int;
begin
  -- Første gang: CARELINK +29.842,17 – forslag ud fra ejer og forventet beløb (lav sikkerhed)
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('1', 64), 'booked_on', (cur + interval '2 month')::date, 'amount_ore', 2984217, 'description', 'LØN', 'counterparty', 'CARELINK A/S')));
  n := public.bank_auto_income('00000000-0000-0000-0000-0000000000a1');
  assert n = 1, 'indtægt oprettet';
  select * into e from public.income_entries where amount_ore = 2984217;
  assert e.source_id = (select v from ctx where k = 'hamza')::uuid and e.match_confidence = 40 and not e.matched_by_user, 'forslag: Løn – Hamza (ikke bekræftet)';
  assert e.bank_transaction_id = (select id from public.bank_transactions where external_id = repeat('1', 64)), 'linket til banktransaktionen';
  insert into ctx values ('e1', e.id);
end $$;

-- Brugeren bekræfter "Dette er min løn"
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.income_entries set matched_by_user = true where id = (select v from ctx where k = 'e1')::uuid;
-- og kan ikke ændre banklinket selv
do $$
declare ok boolean;
begin
  begin
    update public.income_entries set bank_transaction_id = null where id = (select v from ctx where k = 'e1')::uuid;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'banklink kan ikke ændres af brugeren';
end $$;
reset role;
do $$
declare cur date := date_trunc('month', now())::date; e record;
begin
  assert (select matched_by_user and match_confidence = 100 and bank_transaction_id is not null from public.income_entries where id = (select v from ctx where k = 'e1')::uuid), 'bekræftet; banklink uændret';
  assert exists (select 1 from private.income_source_rules where merchant_key = private.merchant_key('CARELINK A/S', 'LØN') and source_id = (select v from ctx where k = 'hamza')::uuid), 'modparten huskes';
  -- Næste måned: CARELINK +30.211,43 → foreslår Løn – Hamza med høj sikkerhed og bruger det faktiske beløb
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('2', 64), 'booked_on', (cur + interval '3 month')::date, 'amount_ore', 3021143, 'description', 'LØN OKT', 'counterparty', 'CARELINK A/S')));
  perform public.bank_auto_income('00000000-0000-0000-0000-0000000000a1');
  select * into e from public.income_entries where amount_ore = 3021143;
  assert e.source_id = (select v from ctx where k = 'hamza')::uuid and e.match_confidence = 90 and not e.matched_by_user, 'genkendt: Løn – Hamza (90)';
  insert into ctx values ('e2', e.id);
  -- En anden afsender med et beløb, der ikke ligner: intet forslag
  perform public.bank_ingest('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('external_id', repeat('3', 64), 'booked_on', (cur + interval '3 month')::date, 'amount_ore', 120000, 'description', 'SKAT', 'counterparty', 'Skattestyrelsen')));
  perform public.bank_auto_income('00000000-0000-0000-0000-0000000000a1');
  assert (select source_id is null and match_confidence is null from public.income_entries where amount_ore = 120000), 'ingen blind gætning';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare m3 date := (date_trunc('month', now()) + interval '3 month')::date; m2 date := (date_trunc('month', now()) + interval '2 month')::date;
begin
  assert (select used_ore from public.month_income(m3) where name = 'Løn – Hamza') = 3021143, 'faktisk beløb 30.211,43 i planen';
  assert (select unconfirmed_count from public.month_income(m3) where name = 'Løn – Hamza') = 1, 'forslag venter på bekræftelse';
  assert (select used_ore from public.month_income(m2) where name = 'Løn – Hamza') = 2984217, 'lønnen varierer fra måned til måned';
  -- Brugeren retter forslaget til en anden kilde
  update public.income_entries set source_id = (select v from ctx where k = 'bonus')::uuid where id = (select v from ctx where k = 'e2')::uuid;
  assert (select source_id = (select v from ctx where k = 'bonus')::uuid and matched_by_user from public.income_entries where id = (select v from ctx where k = 'e2')::uuid), 'rettet';
  assert (select used_ore from public.month_income(m3) where name = 'Løn – Hamza') = 2900000, 'Hamzas løn falder tilbage til forventet';
end $$;

-- ---------------------------------------------------------------- deduplikering
reset role;
do $$
declare b public.bank_transactions; ok boolean; before int;
begin
  select * into b from public.bank_transactions where external_id = repeat('1', 64);
  before := (select count(*) from public.income_entries);
  perform private.bank_import_income(b);
  assert (select count(*) from public.income_entries) = before, 'samme banktransaktion tæller ikke to gange';
  begin
    insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, created_by, bank_transaction_id)
    values (b.household_id, b.amount_ore, b.booked_on, 'Dublet', 'shared', b.user_id, b.id);
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'unik på banktransaktion';
end $$;

-- ---------------------------------------------------------------- historik: gamle måneder ændrer sig ikke
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create temp table snap as select * from public.month_plan(date_trunc('month', now())::date);
grant select on snap to authenticated;
create temp table snap_b as select category_id, budget_ore from public.budget_month_summary(date_trunc('month', now())::date);
grant select on snap_b to authenticated;
do $$
declare nxt date := (date_trunc('month', now()) + interval '1 month')::date;
begin
  update public.income_sources set name = 'Løn (Carelink) – Hamza' where id = (select v from ctx where k = 'hamza')::uuid;
  perform public.set_category_default((select id from public.budget_categories where name = 'Mad'), nxt, null, 'percent', 5000);
  perform public.set_category_default((select id from public.budget_categories where name = 'Buffer'), nxt, 300000);
end $$;
reset role;
update private.income_source_rules set source_id = (select v from ctx where k = 'bonus')::uuid;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare cur date := date_trunc('month', now())::date; nxt date := (date_trunc('month', now()) + interval '1 month')::date; p record; s record;
begin
  select * into p from public.month_plan(cur);
  select * into s from snap;
  assert p = s, 'månedens plan uændret efter omdøbning, ny regel og ny standardfordeling';
  assert not exists (
    select 1 from public.budget_month_summary(cur) x join snap_b o on o.category_id = x.category_id where x.budget_ore <> o.budget_ore), 'budgetter uændrede';
  assert (select fixed_allocations_ore from public.month_plan(nxt)) = 300000, 'ændringen gælder fremad';
  assert (select count(*) from public.income_entries where description = 'Løn' and source_id = (select v from ctx where k = 'hamza')::uuid) >= 1, 'indtægterne beholder kilden';
end $$;

-- ---------------------------------------------------------------- to faste indtægter med samme navn
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare nxt date := (date_trunc('month', now()) + interval '1 month')::date; s1 text; s2 text;
begin
  perform public.create_fixed_item('income', 'Løn', 2000000, p_owner_kind => 'member', p_owner_user_id => '00000000-0000-0000-0000-0000000000a1', p_start_month => nxt);
  perform public.create_fixed_item('income', 'Løn', 2270000, p_owner_kind => 'member', p_owner_user_id => '00000000-0000-0000-0000-0000000000a2', p_start_month => nxt);
  assert (select count(distinct s.name) from public.income_sources s join public.fixed_items f on f.id = s.fixed_item_id where f.start_month = nxt) = 2, 'to kilder med entydige navne';
  assert exists (select 1 from public.income_sources where name = 'Løn'), 'første beholder navnet';
  assert exists (select 1 from public.income_sources where name = 'Løn – sumaya (2)'), format('anden får ejerens navn (%s)', (select string_agg(name, ', ') from public.income_sources));
  assert (select count(*) from public.month_income(nxt) m join public.income_sources s on s.id = m.source_id join public.fixed_items f on f.id = s.fixed_item_id
          where f.start_month = nxt and m.status = 'expected') = 2, 'begge forventede tæller med';
end $$;

-- ---------------------------------------------------------------- adgang
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select count(*) from public.income_sources) = 0, 'børn ser ikke indtægtskilder';
  assert (select count(*) from public.month_income(date_trunc('month', now())::date)) = 0, 'eller indtægter';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.income_sources) = 0, 'anden husstand ser intet';
  assert (select count(*) from public.income_types) = 7, 'kun egne typer';
  begin
    insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, source_id)
    values ('22222222-2222-2222-2222-222222222222', 100, current_date, 'x', 'shared', (select v from ctx where k = 'hamza')::uuid);
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'kan ikke bruge en anden husstands kilde';
  begin
    perform public.income_source_create('X', null, 'member', '00000000-0000-0000-0000-0000000000a1');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ejer skal være voksen i egen husstand';
end $$;
rollback;
