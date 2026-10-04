-- Tests for budgetter, standardbudget-historik og transaktioner.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Vores'),
  ('22222222-2222-2222-2222-222222222222', 'Fremmed');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');

-- Historik oprettes som admin (som hvis den var lavet tidligere)
insert into public.budget_categories (id, household_id, name, icon, color, created_by, created_at) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Dagligvarer', 'cart', '#1aa59a',
   '00000000-0000-0000-0000-0000000000a1', '2025-12-15'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'Fremmed kategori', 'cart', '#1aa59a',
   '00000000-0000-0000-0000-0000000000b1', '2025-12-15');
insert into public.budget_category_defaults (household_id, category_id, valid_from, amount_ore, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', '2026-01-01', 500000, '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', '2026-11-01', 550000, '00000000-0000-0000-0000-0000000000a1');
insert into public.monthly_budgets (household_id, category_id, month, amount_ore, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', '2026-12-01', 650000, '00000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------- bruger a1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- Budget pr. måned (jeres eksempel)
do $$
declare b bigint; src text;
begin
  select budget_ore, budget_source into b, src from public.budget_month_summary('2026-03-01');
  assert b = 500000 and src = 'default', 'marts: standard 5.000 kr.';
  select budget_ore into b from public.budget_month_summary('2026-10-01');
  assert b = 500000, 'oktober: stadig 5.000 kr.';
  select budget_ore into b from public.budget_month_summary('2026-11-01');
  assert b = 550000, 'november: ny standard 5.500 kr.';
  select budget_ore, budget_source into b, src from public.budget_month_summary('2026-12-01');
  assert b = 650000 and src = 'override', 'december: overstyring 6.500 kr.';
  select budget_ore into b from public.budget_month_summary('2027-01-01');
  assert b = 550000, 'januar 2027: tilbage til standard 5.500 kr.';
  assert (select count(*) from public.budget_month_summary('2025-06-01')) = 0, 'ingen kategori før oprettelse';
  assert (select count(*) from public.budget_month_summary('2026-10-01')) = 1, 'ser kun egen husstands kategorier';
end $$;

-- Transaktioner tæller i forbrug
insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id)
values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 63875, '2026-10-04', 'Bilka', 'member', '00000000-0000-0000-0000-0000000000a2'),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 10000, '2026-10-31', 'Netto', 'shared', null),
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 5000, '2026-11-01', 'Rema', 'shared', null);

do $$
declare s bigint; n int;
begin
  select spent_ore, transaction_count into s, n from public.budget_month_summary('2026-10-01');
  assert s = 73875 and n = 2, 'forbrug i oktober (månedsgrænser)';
  assert (select created_by from public.transactions where description = 'Bilka') = '00000000-0000-0000-0000-0000000000a1',
    'created_by sættes automatisk';
end $$;

-- Ændring af standardbudget via RPC: kun fra indeværende måned og frem
select public.set_category_default('c0000000-0000-0000-0000-000000000001', '2099-01-01', 600000);
select public.set_category_default('c0000000-0000-0000-0000-000000000001', '2099-01-01', 610000);
do $$
declare ok boolean;
begin
  assert (select amount_ore from public.budget_category_defaults where valid_from = '2099-01-01') = 610000, 'upsert af fremtidig standard';
  assert (select budget_ore from public.budget_month_summary('2026-10-01')) = 500000, 'historik uændret efter ændring';

  begin
    perform public.set_category_default('c0000000-0000-0000-0000-000000000001', '2026-01-01', 1);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kan ikke ændre standard bagud i tid (RPC)';

  begin
    update public.budget_category_defaults set amount_ore = 1 where valid_from = '2026-01-01';
    ok := (select amount_ore from public.budget_category_defaults where valid_from = '2026-01-01') = 500000;
  end;
  assert ok, 'kan ikke ændre historisk standard direkte (RLS)';

  delete from public.budget_category_defaults where valid_from = '2026-01-01';
  assert exists (select 1 from public.budget_category_defaults where valid_from = '2026-01-01'), 'kan ikke slette historisk standard';
end $$;

-- Månedsoverstyring via RPC (sæt, ret, fjern)
select public.set_monthly_budget('c0000000-0000-0000-0000-000000000001', '2026-10-15', 450000);
do $$ begin
  assert (select budget_ore from public.budget_month_summary('2026-10-01')) = 450000, 'overstyring sat';
end $$;
select public.set_monthly_budget('c0000000-0000-0000-0000-000000000001', '2026-10-01', null);
do $$ begin
  assert (select budget_source from public.budget_month_summary('2026-10-01')) = 'default', 'overstyring fjernet';
end $$;

-- Opret kategori via RPC
do $$
declare cid uuid;
begin
  cid := public.create_budget_category('Restaurant', 'utensils', '#d65a9c', 150000, null);
  assert (select household_id from public.budget_categories where id = cid) = '11111111-1111-1111-1111-111111111111', 'egen husstand';
  assert (select amount_ore from public.budget_category_defaults where category_id = cid) = 150000, 'standard oprettet';
end $$;

-- Forbudte handlinger
do $$
declare ok boolean;
begin
  -- Kategori fra anden husstand
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000b1', 100, '2026-10-01', 'x');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'kan ikke bruge fremmed husstands kategori';

  -- Indsæt i fremmed husstand
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
    values ('22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-0000000000b1', 100, '2026-10-01', 'x');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kan ikke indsætte i fremmed husstand';

  -- "Betalt af" en person uden for husstanden
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 100, '2026-10-01', 'x', 'member', '00000000-0000-0000-0000-0000000000b1');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'betalt af skal være medlem af husstanden';

  -- Inkonsistent betalt af
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 100, '2026-10-01', 'x', 'shared', '00000000-0000-0000-0000-0000000000a1');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'fælles kan ikke have en person';

  -- Forfalsket created_by
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, created_by)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 100, '2026-10-01', 'x', '00000000-0000-0000-0000-0000000000a2');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'created_by kan ikke forfalskes';

  -- Slet kategori
  begin
    delete from public.budget_categories where id = 'c0000000-0000-0000-0000-000000000001';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kategorier kan ikke slettes (kun arkiveres)';

  -- Flyt transaktion til anden husstand
  begin
    update public.transactions set household_id = '22222222-2222-2222-2222-222222222222' where description = 'Bilka';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'household_id kan ikke ændres';
end $$;

-- Arkivering: ny transaktion afvises, gamle bevares og kan redigeres
update public.budget_categories set archived_at = now() where id = 'c0000000-0000-0000-0000-000000000001';
update public.transactions set note = 'redigeret' where description = 'Bilka';
do $$
declare ok boolean;
begin
  assert (select note from public.transactions where description = 'Bilka') = 'redigeret', 'gammel transaktion kan redigeres';
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
    values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 100, '2026-10-01', 'x');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'arkiveret kategori afviser nye transaktioner';
  assert (select spent_ore from public.budget_month_summary('2026-10-01') where name = 'Dagligvarer') = 73875,
    'arkiveret kategori vises stadig med forbrug i oktober';
end $$;

-- ---------------------------------------------------------------- bruger b1
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.transactions) = 0, 'b1 ser ingen af vores transaktioner';
  assert (select count(*) from public.budget_category_defaults) = 0, 'b1 ser ingen af vores budgetter';
  assert (select count(*) from public.budget_month_summary('2026-10-01')) = 1, 'b1 ser kun egen kategori';
end $$;
delete from public.transactions;
update public.budget_categories set name = 'hacket' where id = 'c0000000-0000-0000-0000-000000000001';
do $$
declare ok boolean;
begin
  begin
    perform public.set_monthly_budget('c0000000-0000-0000-0000-000000000001', '2026-10-01', 1);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'b1 kan ikke sætte budget på vores kategori';
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.transactions) = 3, 'b1 kunne ikke slette vores transaktioner';
  assert (select name from public.budget_categories where id = 'c0000000-0000-0000-0000-000000000001') = 'Dagligvarer', 'navn uændret';
end $$;

rollback;
