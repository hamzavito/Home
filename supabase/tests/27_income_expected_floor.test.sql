-- Månedens plan: små beløb erstatter ikke forventet løn; indtægter uden kilde tæller ikke med
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'hamza@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare
  cur date := date_trunc('month', now())::date;
  loen uuid := private.income_type_named(public.current_household_id(), 'Løn');
  src uuid;
  r record;
  p record;
begin
  perform public.create_default_fixed_groups();
  src := public.income_source_create('Løn', loen, 'member', '00000000-0000-0000-0000-0000000000a1', 2800000);

  -- To MobilePay-beløb lagt på "Løn" ved en fejl
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source_id)
  values (public.current_household_id(), 6000, cur, 'MobilePay A', 'member', '00000000-0000-0000-0000-0000000000a1', src),
         (public.current_household_id(), 1200, cur, 'MobilePay B', 'member', '00000000-0000-0000-0000-0000000000a1', src);
  select * into r from public.month_income(cur) where source_id = src;
  assert r.status = 'expected' and r.used_ore = 2800000 and r.actual_ore = 7200, 'forventet løn bruges stadig (72 kr. modtaget)';

  -- Indtægter uden kilde (ikke godkendt) tæller ikke med
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id)
  values (public.current_household_id(), 272100, cur, 'Pant', 'member', '00000000-0000-0000-0000-0000000000a1');
  select * into r from public.month_income(cur) where source_id is null;
  assert r.status = 'unassigned' and r.used_ore = 0 and r.actual_ore = 272100, 'uden kilde: vises, men tæller ikke';
  select * into p from public.month_plan(cur);
  assert p.income_ore = 2800000, 'planen: kun den forventede løn';

  -- Lønnen kommer (lidt mindre end forventet): det faktiske beløb bruges
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source_id)
  values (public.current_household_id(), 2750000, cur, 'Løn', 'member', '00000000-0000-0000-0000-0000000000a1', src);
  select * into r from public.month_income(cur) where source_id = src;
  assert r.status = 'actual' and r.used_ore = 2757200, 'faktisk løn + de små beløb';
  select * into p from public.month_plan(cur);
  assert p.income_ore = 2757200 and p.actual_income_ore = 2757200, 'planen bruger det faktiske';
end $$;

rollback;
