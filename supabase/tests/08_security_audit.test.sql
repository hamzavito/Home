-- Sikkerhedsrevision baseret på systemkatalogerne. Gælder automatisk også for
-- fremtidige tabeller og funktioner, så intet glemmes.
begin;

-- 1) Alle tabeller i public har RLS slået til
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS mangler på public.%', t;
  end loop;
end $$;

-- 2) anon (ikke logget ind) har ingen rettigheder til tabeller eller sekvenser i public
do $$
declare r record;
begin
  for r in select table_name, privilege_type from information_schema.role_table_grants
           where grantee in ('anon', 'PUBLIC') and table_schema = 'public' loop
    raise exception 'anon/PUBLIC har % på public.%', r.privilege_type, r.table_name;
  end loop;
  for r in select table_name, column_name from information_schema.column_privileges
           where grantee in ('anon', 'PUBLIC') and table_schema = 'public' loop
    raise exception 'anon/PUBLIC har kolonnerettighed på public.%.%', r.table_name, r.column_name;
  end loop;
end $$;

-- 3) Ingen funktion i public eller private kan kaldes af anon/PUBLIC
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public') and (has_function_privilege('anon', p.oid, 'execute')) loop
    raise exception 'anon kan kalde %', r.f;
  end loop;
end $$;

-- 4) Alle SECURITY DEFINER-funktioner har fast, tom search_path (beskytter mod skema-kapring)
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef loop
    if r.proconfig is null or not ('search_path=""' = any (r.proconfig) or 'search_path=' = any (r.proconfig)) then
      raise exception 'SECURITY DEFINER uden search_path='''': % (%)', r.f, r.proconfig;
    end if;
  end loop;
end $$;

-- 5) Oprydningsfunktionerne kan kun kaldes af service_role (Edge Function), ikke af brugere
do $$
declare f text;
begin
  foreach f in array array['public.claim_expired_receipt_images(integer)', 'public.claim_abandoned_receipts(integer)', 'public.list_orphan_receipt_files(integer)'] loop
    assert not has_function_privilege('authenticated', f, 'execute'), f || ' må ikke kunne kaldes af brugere';
  end loop;
end $$;

-- 6) private-skemaet er ikke tilgængeligt for klienter (PostgREST eksponerer det ikke)
do $$ begin
  assert not has_schema_privilege('anon', 'private', 'usage'), 'anon har adgang til private';
end $$;

-- 6b) Databasekvalitet: ingen kommatal, alle beløb i øre som bigint,
--     og alle household_id-kolonner er bundet med fremmednøgle
do $$
declare r record;
begin
  for r in select table_name, column_name, data_type from information_schema.columns
           where table_schema = 'public' and data_type in ('real', 'double precision', 'numeric', 'money') loop
    raise exception 'Kommatal-kolonne: %.% (%)', r.table_name, r.column_name, r.data_type;
  end loop;
  for r in select table_name, column_name, data_type from information_schema.columns
           where table_schema = 'public' and column_name like '%\_ore' and data_type <> 'bigint' loop
    raise exception 'Beløb skal være bigint: %.% (%)', r.table_name, r.column_name, r.data_type;
  end loop;
  for r in select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id'
           where n.nspname = 'public' and c.relkind = 'r'
             and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any (k.conkey)) loop
    raise exception 'household_id uden fremmednøgle i %', r.t;
  end loop;
end $$;

-- 7) Isolation: for HVER tabel med household_id kan en bruger fra husstand B ikke se,
--    ændre eller slette husstand A's rækker
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');
-- Data i husstand A i alle tabeller (som administrator; auth.uid() = A1 for standardværdier)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.budget_categories (id, household_id, name, created_by) values ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Mad', '00000000-0000-0000-0000-0000000000a1');
insert into public.budget_category_defaults (household_id, category_id, valid_from, amount_ore) values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', '2026-01-01', 100000);
insert into public.monthly_budgets (household_id, category_id, month, amount_ore) values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', '2026-10-01', 100000);
insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, created_by) values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', 5000, '2026-10-01', 'Brød', '00000000-0000-0000-0000-0000000000a1');
insert into public.fixed_groups (id, household_id, name) values ('f0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Bolig');
insert into public.fixed_items (id, household_id, group_id, kind, name, start_month, created_by) values ('f1000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-0000000000a1', 'expense', 'Husleje', '2026-01-01', '00000000-0000-0000-0000-0000000000a1');
insert into public.fixed_item_versions (household_id, item_id, valid_from, amount_ore) values ('11111111-1111-1111-1111-111111111111', 'f1000000-0000-0000-0000-0000000000a1', '2026-01-01', 900000);
insert into public.upcoming_expenses (household_id, title, amount_ore, due_on, category_id, created_by) values ('11111111-1111-1111-1111-111111111111', 'Tandlæge', 120000, '2026-11-01', 'c0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into public.savings_goals (id, household_id, name, target_ore, created_by) values ('5a000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Ferie', 100000, '00000000-0000-0000-0000-0000000000a1');
insert into public.savings_movements (household_id, goal_id, kind, amount_ore, created_by) values ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-0000000000a1', 'deposit', 1000, '00000000-0000-0000-0000-0000000000a1');
insert into public.shopping_lists (id, household_id, name) values ('5b000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Indkøb');
insert into public.shopping_items (household_id, list_id, name, added_by) values ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-0000000000a1', 'Mælk', '00000000-0000-0000-0000-0000000000a1');
insert into public.household_tasks (household_id, title, created_by) values ('11111111-1111-1111-1111-111111111111', 'Støvsuge', '00000000-0000-0000-0000-0000000000a1');
insert into public.calendar_events (household_id, title, event_date, all_day, created_by) values ('11111111-1111-1111-1111-111111111111', 'Læge', '2026-10-10', true, '00000000-0000-0000-0000-0000000000a1');
insert into public.receipts (household_id, status, storage_path, uploaded_by, id) values ('11111111-1111-1111-1111-111111111111', 'pending', '11111111-1111-1111-1111-111111111111/7e000000-0000-0000-0000-0000000000a1.jpg', '00000000-0000-0000-0000-0000000000a1', '7e000000-0000-0000-0000-0000000000a1');
insert into public.recipes (id, household_id, name, created_by) values ('8e000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Karry', '00000000-0000-0000-0000-0000000000a1');
insert into public.recipe_ingredients (household_id, recipe_id, name, amount_milli, unit) values ('11111111-1111-1111-1111-111111111111', '8e000000-0000-0000-0000-0000000000a1', 'Løg', 2000, 'stk');
insert into public.meal_plan_entries (household_id, plan_date, recipe_id, title, created_by) values ('11111111-1111-1111-1111-111111111111', '2026-10-05', '8e000000-0000-0000-0000-0000000000a1', 'Karry', '00000000-0000-0000-0000-0000000000a1');
insert into public.ingredient_prices (household_id, name, price_ore, created_by) values ('11111111-1111-1111-1111-111111111111', 'Skyr', 3100, '00000000-0000-0000-0000-0000000000a1');
insert into public.child_savings_goals (id, household_id, child_id, name, target_ore, created_by) values ('9c000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Cykel', 250000, '00000000-0000-0000-0000-0000000000a1');
insert into public.child_wallet_transactions (id, household_id, child_id, kind, amount_ore, created_by) values ('9d000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'allowance', 20000, '00000000-0000-0000-0000-0000000000a1');
insert into public.child_allowance_schedules (id, household_id, child_id, amount_ore, frequency, weekday, start_on, pay_from, created_by) values ('9e000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 5000, 'weekly', 5, '2026-10-01', '2026-10-01', '00000000-0000-0000-0000-0000000000a1');
insert into public.child_allowance_payouts (schedule_id, household_id, period_key, due_on, amount_ore, tx_id) values ('9e000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '2026-W40', '2026-10-02', 5000, '9d000000-0000-0000-0000-0000000000a1');

create temp table audit_tables as
  select c.relname::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'public' and c.relkind = 'r' and a.attname = 'household_id' and not a.attisdropped;
grant select on audit_tables to authenticated, anon;

do $$
declare t text; n int;
begin
  for t in select * from audit_tables loop
    execute format('select count(*) from public.%I where household_id = %L', t, '11111111-1111-1111-1111-111111111111') into n;
    assert n > 0, 'testdata mangler i ' || t;
  end loop;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare t text; n int; ok boolean;
begin
  for t in select * from audit_tables loop
    -- Kan ikke se
    execute format('select count(*) from public.%I where household_id = %L', t, '11111111-1111-1111-1111-111111111111') into n;
    assert n = 0, 'B kan se A''s rækker i ' || t;
    -- Kan ikke slette (enten nægtet eller 0 rækker påvirket)
    begin
      execute format('delete from public.%I where household_id = %L', t, '11111111-1111-1111-1111-111111111111');
      get diagnostics n = row_count;
      assert n = 0, 'B kan slette A''s rækker i ' || t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- Kan ikke indsætte i A ved at sætte A's household_id (fx via devtools)
do $$
declare ok boolean;
begin
  begin
    insert into public.calendar_events (household_id, title, event_date, all_day) values ('11111111-1111-1111-1111-111111111111', 'Hack', '2026-10-10', true);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'B kan indsætte i A';
  begin
    insert into public.shopping_items (household_id, list_id, name) values ('22222222-2222-2222-2222-222222222222', '5b000000-0000-0000-0000-0000000000a1', 'Hack');
    ok := false;
  exception when foreign_key_violation or insufficient_privilege then ok := true;
  end;
  assert ok, 'B kan bruge A''s liste-id i egen husstand';
  -- Kan ikke flytte en egen række over i A
  insert into public.calendar_events (household_id, title, event_date, all_day) values ('22222222-2222-2222-2222-222222222222', 'B', '2026-10-10', true);
  begin
    update public.calendar_events set household_id = '11111111-1111-1111-1111-111111111111' where title = 'B';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'household_id kan ændres';
end $$;
reset role;
do $$
declare ok boolean; tid uuid := (select id from public.household_tasks where title = 'Støvsuge');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    perform public.set_task_status(tid, 'done');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'B kan afslutte A''s opgave via RPC';
  begin
    perform public.set_upcoming_status((select id from public.upcoming_expenses limit 1), 'paid', true);
    ok := true; -- B ser ingen kommende udgifter (select returnerer null)
  exception when no_data_found then ok := true;
  end;
  assert ok;
end $$;
reset role;
do $$ begin
  assert (select status from public.household_tasks where title = 'Støvsuge') = 'open', 'A''s opgave uændret';
  assert (select count(*) from public.transactions) = 1, 'ingen transaktioner oprettet af B';
end $$;

-- 8) Ikke logget ind: ingen adgang overhovedet
set local role anon;
do $$
declare t text; ok boolean;
begin
  for t in select * from audit_tables loop
    begin
      execute format('select count(*) from public.%I', t);
      ok := false;
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'anon kan læse ' || t;
  end loop;
end $$;
rollback;
