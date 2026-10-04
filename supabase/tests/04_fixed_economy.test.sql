-- Tests for fast økonomi og fordeling. Bruger husstandens rigtige tal.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select public.create_default_fixed_groups();
select public.create_default_fixed_groups(); -- idempotent

do $$
declare
  g_bolig uuid := (select id from public.fixed_groups where name = 'Bolig');
  g_transport uuid := (select id from public.fixed_groups where name = 'Transport');
  g_forsikring uuid := (select id from public.fixed_groups where name = 'Forsikring');
  g_abon uuid := (select id from public.fixed_groups where name = 'Abonnementer');
  g_gaeld uuid := (select id from public.fixed_groups where name = 'Gæld');
  g_ops uuid := (select id from public.fixed_groups where name = 'Opsparing');
  g_andet uuid := (select id from public.fixed_groups where name = 'Andet');
  mobil uuid;
begin
  assert (select count(*) from public.fixed_groups) = 7, 'standardgrupper oprettet én gang';

  perform public.create_fixed_item('income', 'Nettoindkomst', 3000000, p_owner_kind => 'member', p_owner_user_id => '00000000-0000-0000-0000-0000000000a1');
  perform public.create_fixed_item('expense', 'Husleje', 891300, p_group_id => g_bolig);
  perform public.create_fixed_item('expense', 'Cupra Tavascan', 270350, p_group_id => g_transport);
  perform public.create_fixed_item('expense', 'Forsikringer', 61150, p_group_id => g_forsikring);
  perform public.create_fixed_item('expense', 'El, vand og varme', 246400, p_group_id => g_bolig);
  perform public.create_fixed_item('expense', 'Fagforening', 56000, p_group_id => g_andet);
  perform public.create_fixed_item('expense', 'Canva', 9588, p_group_id => g_abon);
  perform public.create_fixed_item('expense', 'Apple', 2500, p_group_id => g_abon);
  mobil := public.create_fixed_item('expense', 'Mobilabonnement', 47800, p_group_id => g_abon);
  perform public.create_fixed_item('expense', 'Legeland', 10525, p_group_id => g_abon);
  perform public.create_fixed_item('expense', 'Bankabonnement', 7900, p_group_id => g_abon);
  perform public.create_fixed_item('expense', 'Afbetaling', 200000, p_group_id => g_gaeld);
  perform public.create_fixed_item('expense', 'Bilafbetaling', 379800, p_group_id => g_transport);
  perform public.create_fixed_item('expense', 'Opsparing', 150000, p_group_id => g_ops);
  perform public.create_fixed_item('expense', 'Rejsegruppe', 100000, p_group_id => g_ops);
  -- Negativ post: modregning
  perform public.create_fixed_item('expense', 'Clever', -51100, p_group_id => g_transport);
  insert into ctx values ('mobil', mobil::text);

  -- Variable budgetter: Buffer (reserve, fast beløb), Mad 65 %, Hygge 35 %
  perform public.create_budget_category('Buffer', 'sparkles', '#5f6b7a', 200000, null, 'reserve');
  perform public.create_budget_category('Mad', 'cart', '#1aa59a', null, null, 'spending', 'percent', 6500);
  perform public.create_budget_category('Hygge', 'heart', '#d65a9c', null, null, 'spending', 'percent', 3500);
end $$;

-- Månedens plan = præcis Excel-tallene
do $$
declare p record;
begin
  select * into p from public.month_plan(date_trunc('month', now())::date);
  assert p.income_ore = 3000000, 'indkomst 30.000,00';
  assert p.fixed_expenses_ore = 2382213, format('faste udgifter 23.822,13 (fik %s)', p.fixed_expenses_ore);
  assert p.available_ore = 617787, 'tilbage 6.177,87';
  assert p.fixed_allocations_ore = 200000, 'buffer 2.000,00';
  assert p.distributable_ore = 417787, 'til fordeling 4.177,87';
  assert p.percent_total_bp = 10000, '100 % fordelt';
  assert p.unallocated_ore = 0, 'intet ufordelt';
  assert (select budget_ore from public.budget_month_summary(date_trunc('month', now())::date) where name = 'Mad') = 271562, 'Mad 65 % = 2.715,62';
  assert (select budget_ore from public.budget_month_summary(date_trunc('month', now())::date) where name = 'Hygge') = 146225, 'Hygge 35 % = 1.462,25';
  assert (select kind from public.budget_month_summary(date_trunc('month', now())::date) where name = 'Buffer') = 'reserve', 'Buffer er reserve';
end $$;

-- Historik: mobil 478 → 499 fra næste måned. Denne måned uændret.
select public.set_fixed_item_amount((select v from ctx where k = 'mobil')::uuid, (date_trunc('month', now()) + interval '1 month')::date, 49900);
do $$
declare cur date := date_trunc('month', now())::date; nxt date := (date_trunc('month', now()) + interval '1 month')::date; ok boolean;
begin
  assert (select amount_ore from public.fixed_items_month(cur) where name = 'Mobilabonnement') = 47800, 'denne måned: 478 kr.';
  assert (select amount_ore from public.fixed_items_month(nxt) where name = 'Mobilabonnement') = 49900, 'næste måned: 499 kr.';
  assert (select fixed_expenses_ore from public.month_plan(nxt)) = 2384313, 'næste måned +21 kr.';
  assert (select fixed_expenses_ore from public.month_plan(cur)) = 2382213, 'denne måned uændret';
  -- Mad/Hygge genberegnes for næste måned ud fra det nye rådighedsbeløb
  assert (select budget_ore from public.budget_month_summary(nxt) where name = 'Mad') + (select budget_ore from public.budget_month_summary(nxt) where name = 'Hygge') = 415687, 'fordeling næste måned går op';

  begin
    perform public.set_fixed_item_amount((select v from ctx where k = 'mobil')::uuid, (cur - interval '1 month')::date, 1);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kan ikke ændre beløb bagud i tid';

  begin
    insert into public.fixed_item_versions (household_id, item_id, valid_from, amount_ore)
    values ('11111111-1111-1111-1111-111111111111', (select v from ctx where k = 'mobil')::uuid, (cur - interval '2 month')::date, 1);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kan ikke indsætte historisk version direkte';

  begin
    perform public.create_fixed_item('expense', 'Bagud', 100, p_group_id => (select id from public.fixed_groups where name = 'Andet'), p_start_month => (cur - interval '1 month')::date);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ny post kan ikke starte i fortiden';
end $$;

-- Kvartalsvis og årlig: månedligt gennemsnit + betalingsmåned
do $$
declare cur date := date_trunc('month', now())::date; m int := extract(month from now())::int; r record;
begin
  perform public.create_fixed_item('expense', 'Bilforsikring', 600000, 'yearly', m::smallint, (select id from public.fixed_groups where name = 'Forsikring'));
  perform public.create_fixed_item('expense', 'Vandafgift', 90000, 'quarterly', (((m % 12)) + 1)::smallint, (select id from public.fixed_groups where name = 'Bolig'));
  select * into r from public.fixed_items_month(cur) where name = 'Bilforsikring';
  assert r.monthly_ore = 50000 and r.amount_ore = 600000 and r.due_this_month, 'årlig: 6.000 kr. = 500 kr./md, betales nu';
  select * into r from public.fixed_items_month(cur) where name = 'Vandafgift';
  assert r.monthly_ore = 30000 and not r.due_this_month, 'kvartalsvis: 900 kr. = 300 kr./md, ikke denne måned';
  select * into r from public.fixed_items_month((cur + interval '1 month')::date) where name = 'Vandafgift';
  assert r.due_this_month, 'kvartalsvis: betales næste måned';
end $$;

-- Overstyring af Mad ændrer ikke Hygge; forskellen vises som ufordelt
do $$
declare cur date := date_trunc('month', now())::date; before_unalloc bigint; mad uuid := (select id from public.budget_categories where name = 'Mad');
begin
  before_unalloc := (select unallocated_ore from public.month_plan(cur));
  perform public.set_monthly_budget(mad, cur, 300000);
  assert (select budget_ore from public.budget_month_summary(cur) where name = 'Mad') = 300000, 'Mad overstyret';
  assert (select budget_source from public.budget_month_summary(cur) where name = 'Mad') = 'override', 'kilde overstyring';
  assert (select budget_ore from public.budget_month_summary(cur) where name = 'Hygge') =
         (select budget_ore from public.budget_month_summary(cur) where name = 'Hygge'), 'Hygge uændret';
  assert (select unallocated_ore from public.month_plan(cur)) < before_unalloc, 'overfordeling vises som negativt ufordelt';
  perform public.set_monthly_budget(mad, cur, null);
end $$;

-- Over 100 %: skaleres, så der aldrig fordeles mere end der er
do $$
declare cur date := date_trunc('month', now())::date; p record;
begin
  perform public.set_category_default((select id from public.budget_categories where name = 'Hygge'), cur, null, 'percent', 5000);
  select * into p from public.month_plan(cur);
  assert p.percent_total_bp = 11500, '115 % registreret';
  assert (select sum(budget_ore) from public.budget_month_summary(cur) where name in ('Mad', 'Hygge')) = p.distributable_ore, 'aldrig mere end til fordeling';
  perform public.set_category_default((select id from public.budget_categories where name = 'Hygge'), cur, null, 'percent', 3500);
end $$;

-- Stop/genoptag: kun fra forrige måned og frem
do $$
declare cur date := date_trunc('month', now())::date; ok boolean; canva uuid := (select id from public.fixed_items where name = 'Canva');
begin
  update public.fixed_items set end_month = cur where id = canva;
  assert (select count(*) from public.fixed_items_month((cur + interval '1 month')::date) where name = 'Canva') = 0, 'stoppet fra næste måned';
  assert (select count(*) from public.fixed_items_month(cur) where name = 'Canva') = 1, 'tæller stadig denne måned';
  begin
    update public.fixed_items set end_month = (cur - interval '3 month')::date where id = canva;
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kan ikke stoppe bagud i tid';
end $$;

-- Negativt rådighedsbeløb: procentbudgetter bliver 0, aldrig negative
do $$
declare nxt2 date := (date_trunc('month', now()) + interval '2 month')::date;
begin
  perform public.create_fixed_item('expense', 'Stor udgift', 1000000, p_group_id => (select id from public.fixed_groups where name = 'Andet'), p_start_month => nxt2);
  assert (select available_ore from public.month_plan(nxt2)) < 0, 'negativt rådighedsbeløb';
  assert (select distributable_ore from public.month_plan(nxt2)) = 0, 'intet til fordeling';
  assert (select budget_ore from public.budget_month_summary(nxt2) where name = 'Mad') = 0, 'Mad 0';
end $$;

-- Sletning: kun poster uden historik
reset role;
insert into public.fixed_items (id, household_id, kind, name, group_id, start_month, created_by)
values ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'expense', 'Gammel post',
        (select id from public.fixed_groups where name = 'Andet'), (date_trunc('month', now()) - interval '6 month')::date, '00000000-0000-0000-0000-0000000000a1');
insert into public.fixed_item_versions (household_id, item_id, valid_from, amount_ore, created_by)
values ('11111111-1111-1111-1111-111111111111', 'f1000000-0000-0000-0000-000000000001', (date_trunc('month', now()) - interval '6 month')::date, 10000, '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
delete from public.fixed_items where name = 'Gammel post';
delete from public.fixed_items where name = 'Stor udgift';
do $$ begin
  assert exists (select 1 from public.fixed_items where name = 'Gammel post'), 'post med historik kan ikke slettes';
  assert not exists (select 1 from public.fixed_items where name = 'Stor udgift'), 'ny post uden historik kan slettes';
  -- Gammel post tæller i en tidligere måned
  assert (select count(*) from public.fixed_items_month((date_trunc('month', now()) - interval '3 month')::date) where name = 'Gammel post') = 1, 'historik bevaret';
end $$;

-- Isolation: B ser intet og kan intet ændre
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.fixed_items) = 0, 'B ser ingen faste poster';
  assert (select count(*) from public.fixed_groups) = 0, 'B ser ingen grupper';
  assert (select income_ore from public.month_plan(date_trunc('month', now())::date)) = 0, 'B''s plan er tom';
  begin
    perform public.set_fixed_item_amount((select v from ctx where k = 'mobil')::uuid, (date_trunc('month', now()) + interval '1 month')::date, 1);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'B kan ikke ændre A''s post';
  begin
    perform public.create_fixed_item('expense', 'x', 1, p_group_id => (select id from public.fixed_groups limit 1));
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'B kan ikke bruge A''s gruppe';
  update public.fixed_items set name = 'hacket';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.fixed_items where name = 'hacket'), 'B kunne ikke omdøbe A''s poster';
end $$;

rollback;
