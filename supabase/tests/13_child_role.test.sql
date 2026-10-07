-- Børnerolle: hvad børn må og ikke må – håndhævet i databasen (RLS + RPC)
begin;
-- Vores hjem: Far (owner), Mor (adult), Barn A og Barn B (child). Farhats hjem: F1 (owner) og et barn.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'far@test.dk'),
  ('00000000-0000-0000-0000-0000000000f2', 'mor@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'barn-a@test.dk'),
  ('00000000-0000-0000-0000-0000000000c2', 'barn-b@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'farhat@test.dk'),
  ('00000000-0000-0000-0000-0000000000b9', 'farhat-barn@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'Vores hjem'), ('22222222-2222-2222-2222-222222222222', 'Farhats hjem');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f2', 'adult'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'child'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c2', 'child'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b9', 'child');

-- Familiens data (som administrator; standardværdier = far)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
insert into public.budget_categories (id, household_id, name, created_by) values ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mad', '00000000-0000-0000-0000-0000000000f1');
insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, created_by)
values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 5000, '2026-10-01', 'Brød', '00000000-0000-0000-0000-0000000000f1');
insert into public.shopping_lists (id, household_id, name) values ('5b000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Indkøb');
insert into public.shopping_items (household_id, list_id, name, added_by) values ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000001', 'Mælk', '00000000-0000-0000-0000-0000000000f1');
insert into public.fixed_groups (id, household_id, name) values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Bolig');
insert into public.fixed_items (household_id, kind, name, owner_kind, owner_user_id, start_month, created_by)
values ('11111111-1111-1111-1111-111111111111', 'income', 'Løn', 'member', '00000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-0000-0000-0000-0000000000f1');
insert into public.savings_goals (household_id, name, target_ore, created_by) values ('11111111-1111-1111-1111-111111111111', 'Ferie', 100000, '00000000-0000-0000-0000-0000000000f1');
insert into public.upcoming_expenses (household_id, title, amount_ore, due_on, category_id, created_by) values ('11111111-1111-1111-1111-111111111111', 'Tandlæge', 50000, '2026-11-01', 'c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1');
insert into public.receipts (id, household_id, status, storage_path, uploaded_by) values ('7e000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'pending', '11111111-1111-1111-1111-111111111111/7e000000-0000-0000-0000-000000000009.jpg', '00000000-0000-0000-0000-0000000000f1');
-- Opgaver: én til hvert barn og én til far
insert into public.household_tasks (id, household_id, title, assignee_id, created_by, recurrence, due_on) values
  ('7a000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Ryd dit værelse', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'weekly', '2026-10-10'),
  ('7a000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'Tøm opvaskemaskinen', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f1', 'none', null),
  ('7a000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'Betal husleje', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'none', null);
-- Kalender: fælles, barn A, far privat, far + barn B
insert into public.calendar_events (household_id, title, event_date, all_day, participant_ids, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Fødselsdag hos mormor', '2026-10-12', true, '{}', '00000000-0000-0000-0000-0000000000f1'),
  ('11111111-1111-1111-1111-111111111111', 'Fodbold', '2026-10-13', true, '{00000000-0000-0000-0000-0000000000c1}', '00000000-0000-0000-0000-0000000000f1'),
  ('11111111-1111-1111-1111-111111111111', 'Lægetid far', '2026-10-14', true, '{00000000-0000-0000-0000-0000000000f1}', '00000000-0000-0000-0000-0000000000f1'),
  ('11111111-1111-1111-1111-111111111111', 'Svømning', '2026-10-15', true, '{00000000-0000-0000-0000-0000000000f1,00000000-0000-0000-0000-0000000000c2}', '00000000-0000-0000-0000-0000000000f1');
insert into public.meal_plan_entries (household_id, plan_date, title, created_by) values ('11111111-1111-1111-1111-111111111111', '2026-10-12', 'Lasagne', '00000000-0000-0000-0000-0000000000f1');

-- ---------------------------------------------------------------- kalender: deltagere
do $$
declare ok boolean;
begin
  -- for_user_id holdes i sync (ældre app-versioner)
  assert (select for_user_id from public.calendar_events where title = 'Fodbold') = '00000000-0000-0000-0000-0000000000c1', 'én deltager → for_user_id';
  assert (select for_user_id from public.calendar_events where title = 'Svømning') is null, 'flere deltagere → for_user_id null';
  -- Gammel klient sætter kun for_user_id
  insert into public.calendar_events (household_id, title, event_date, all_day, for_user_id, created_by)
  values ('11111111-1111-1111-1111-111111111111', 'Gammel app', '2026-10-16', true, '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1');
  assert (select participant_ids from public.calendar_events where title = 'Gammel app') = '{00000000-0000-0000-0000-0000000000f2}', 'for_user_id → deltager';
  update public.calendar_events set for_user_id = null where title = 'Gammel app';
  assert (select participant_ids from public.calendar_events where title = 'Gammel app') = '{}', 'for_user_id null → hele familien';
  -- Deltager fra en anden husstand afvises
  begin
    insert into public.calendar_events (household_id, title, event_date, all_day, participant_ids, created_by)
    values ('11111111-1111-1111-1111-111111111111', 'Hack', '2026-10-16', true, '{00000000-0000-0000-0000-0000000000b9}', '00000000-0000-0000-0000-0000000000f1');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'deltager fra anden husstand afvist';
end $$;

-- ---------------------------------------------------------------- som barn A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean; n int;
begin
  -- Familiens økonomi, indkøb og administration er usynlige
  assert (select count(*) from public.budget_categories) = 0, 'barn ser ikke budgetter';
  assert (select count(*) from public.transactions) = 0, 'barn ser ikke transaktioner';
  assert (select count(*) from public.shopping_items) = 0, 'barn ser ikke indkøbslisten';
  assert (select count(*) from public.shopping_lists) = 0, 'barn ser ikke indkøbslister';
  assert (select count(*) from public.fixed_items) = 0, 'barn ser ikke faste indtægter/udgifter (løn)';
  assert (select count(*) from public.fixed_groups) = 0, 'barn ser ikke faste grupper';
  assert (select count(*) from public.savings_goals) = 0, 'barn ser ikke de voksnes opsparing';
  assert (select count(*) from public.upcoming_expenses) = 0, 'barn ser ikke kommende udgifter';
  assert (select count(*) from public.receipts) = 0, 'barn ser ikke kvitteringer';
  assert (select count(*) from public.budget_month_summary('2026-10-01')) = 0, 'budgetoversigt er tom';
  begin
    perform public.export_household_data();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke eksportere';
  begin
    perform public.create_pending_receipt();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke oprette kvittering';
  begin
    perform public.ensure_shopping_list();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke oprette en indkøbsliste';
  -- Kan ikke skrive i familiens data
  begin
    insert into public.shopping_items (household_id, list_id, name) values ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000001', 'Slik');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke tilføje til indkøbslisten';
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description) values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 100, '2026-10-01', 'x');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke oprette transaktioner';
  update public.households set name = 'Hacket' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'barn kan ikke ændre husstandens indstillinger';

  -- Må se: husstand, medlemmer, madplan
  assert (select name from public.households) = 'Vores hjem', 'barn ser egen husstand';
  assert (select count(*) from public.household_members) = 4, 'barn ser husstandens medlemmer';
  assert (select title from public.meal_plan_entries) = 'Lasagne', 'barn ser aftensmaden';
  begin
    insert into public.meal_plan_entries (household_id, plan_date, title) values ('11111111-1111-1111-1111-111111111111', '2026-10-13', 'Slik');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke redigere madplanen';

  -- Kalender: fælles + egne, ikke fars private og ikke barn B's
  assert (select array_agg(title order by title) from public.calendar_events) = array['Fodbold', 'Fødselsdag hos mormor', 'Gammel app'], 'barn ser fælles og egne aftaler: ' || (select array_agg(title order by title) from public.calendar_events)::text;
  begin
    insert into public.calendar_events (household_id, title, event_date, all_day) values ('11111111-1111-1111-1111-111111111111', 'Fest', '2026-10-20', true);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke oprette aftaler';

  -- Opgaver: kun egne
  assert (select array_agg(title) from public.household_tasks) = array['Ryd dit værelse'], 'barn ser kun egne opgaver';
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a1', 'in_progress');
  assert (select status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a1') = 'in_progress', 'barn kan sætte i gang';
  begin
    perform public.set_task_status('7a000000-0000-0000-0000-0000000000b2', 'done');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barn kan ikke afslutte barn B''s opgave';
  update public.household_tasks set assignee_id = '00000000-0000-0000-0000-0000000000c2', recurrence = 'none' where id = '7a000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'barn kan ikke ændre ansvarlig eller gentagelse';
  delete from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'barn kan ikke slette opgaver';
  begin
    insert into public.household_tasks (household_id, title, assignee_id) values ('11111111-1111-1111-1111-111111111111', 'Far skal vaske op', '00000000-0000-0000-0000-0000000000f1');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke oprette opgaver til andre';
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a1', 'done');
  assert (select count(*) from public.household_tasks where title = 'Ryd dit værelse') = 2, 'færdig gentagende opgave giver næste forekomst';

  -- Kan ikke ændre roller – heller ikke sin egen
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000c1', 'owner');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke ændre sin rolle';
  begin
    update public.household_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000c1';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke opdatere medlemskab direkte';
end $$;

-- ---------------------------------------------------------------- lommepenge
-- Far giver begge børn lommepenge
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare ok boolean; tx uuid;
begin
  perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'allowance', 20000, 'Lommepenge');
  perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c2', 'allowance', 15000, 'Lommepenge');
  tx := public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'deposit', 5000, 'Fejl');
  perform public.child_wallet_void(tx);
  -- Kan ikke give lommepenge til en voksen eller et barn i en anden husstand
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000f2', 'allowance', 100);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'kun børn har lommepenge';
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000b9', 'allowance', 100);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'ikke andre husstandes børn';
  assert (select count(*) from public.child_wallet_transactions) = 3, 'forælder ser begge børns bevægelser';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean; gid uuid; n int;
begin
  -- Ser kun egne bevægelser; fortrudte tæller ikke
  assert (select count(*) from public.child_wallet_transactions where child_id <> '00000000-0000-0000-0000-0000000000c1') = 0, 'barn A ser ikke barn B''s lommepenge';
  assert (select coalesce(sum(case when kind in ('allowance','deposit','from_goal') then amount_ore else -amount_ore end), 0)
          from public.child_wallet_transactions where voided_at is null) = 20000, 'saldo 200 kr.';
  -- Køb og mål
  perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'purchase', 7500, 'Biograf');
  gid := public.child_goal_create('00000000-0000-0000-0000-0000000000c1', 'PlayStation', 300000);
  perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'to_goal', 10000, null, gid);
  assert (select sum(case when kind = 'to_goal' then amount_ore else -amount_ore end) from public.child_wallet_transactions where goal_id = gid) = 10000, '100 kr. på målet';
  -- Ikke mere end saldoen (125 - 100 = 25 kr. tilbage)
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'purchase', 5000, 'Slik');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'barn kan ikke bruge mere end saldoen';
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'from_goal', 20000, null, gid);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kan ikke tage mere fra målet end der er';
  -- Barnet må ikke give sig selv lommepenge eller fortryde
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'allowance', 100000);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn kan ikke give sig selv lommepenge';
  begin
    perform public.child_wallet_void((select id from public.child_wallet_transactions where kind = 'purchase'));
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barn kan ikke fortryde bevægelser';
  -- Barn A kan ikke røre barn B's penge eller oprette mål til B
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c2', 'purchase', 100);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn A kan ikke bruge barn B''s penge';
  begin
    perform public.child_goal_create('00000000-0000-0000-0000-0000000000c2', 'Hack', 1000);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barn A kan ikke oprette mål til barn B';
  -- Ingen direkte skrivning i tabellerne
  begin
    insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'deposit', 100000);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ingen direkte indsættelse';
  -- Afslut mål → pengene tilbage på saldoen
  perform public.child_goal_update(gid, null, null, true);
  assert (select coalesce(sum(case when kind in ('allowance','deposit','from_goal') then amount_ore else -amount_ore end), 0)
          from public.child_wallet_transactions where voided_at is null) = 12500, 'saldo efter afsluttet mål: 125 kr.';
  -- Lommepenge påvirker aldrig familiens økonomi
  reset role;
  assert (select count(*) from public.transactions) = 1, 'familiens transaktioner uændrede';
end $$;

-- Barn B ser kun sine egne
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
do $$ begin
  assert (select count(*) from public.child_wallet_transactions) = 1, 'barn B ser kun sine egne bevægelser';
  assert (select count(*) from public.child_savings_goals) = 0, 'barn B ser ikke barn A''s mål';
  assert (select array_agg(title order by title) from public.calendar_events) = array['Fødselsdag hos mormor', 'Gammel app', 'Svømning'], 'barn B ser fælles + egne';
end $$;

-- ---------------------------------------------------------------- forældre
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$
declare ok boolean;
begin
  -- Mor (adult) ser alt i husstanden og administrerer begge børn
  assert (select count(*) from public.calendar_events) = 5, 'voksne ser alle aftaler';
  assert (select count(*) from public.household_tasks) = 4, 'voksne ser alle opgaver';
  assert (select count(*) from public.child_savings_goals) = 1, 'voksne ser børnenes mål';
  perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c2', 'deduction', 2000, 'Ødelagt vindue');
  insert into public.household_tasks (household_id, title, assignee_id, reward_ore) values ('11111111-1111-1111-1111-111111111111', 'Pak skoletasken', '00000000-0000-0000-0000-0000000000c2', 1000);
  -- Kun ejere kan ændre roller
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000c1', 'adult');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'adult kan ikke ændre roller';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare ok boolean;
begin
  perform public.set_member_role('00000000-0000-0000-0000-0000000000c2', 'adult');
  assert (select role from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c2') = 'adult', 'owner kan ændre rolle';
  perform public.set_member_role('00000000-0000-0000-0000-0000000000c2', 'child');
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000f1', 'child');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ingen kan ændre sin egen rolle';
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000b9', 'adult');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'kan ikke ændre roller i en anden husstand';
end $$;

-- ---------------------------------------------------------------- husstande er adskilte
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.calendar_events) = 0, 'Farhats hjem ser ikke Vores hjems aftaler';
  assert (select count(*) from public.child_wallet_transactions) = 0, 'Farhats hjem ser ikke Vores hjems lommepenge';
  assert (select count(*) from public.household_members where household_id = '11111111-1111-1111-1111-111111111111') = 0, 'Farhats hjem ser ikke Vores hjems medlemmer';
  assert (select count(*) from public.household_tasks) = 0, 'Farhats hjem ser ikke Vores hjems opgaver';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b9';
do $$ begin
  assert (select count(*) from public.households) = 1 and (select name from public.households) = 'Farhats hjem', 'barnet i Farhats hjem ser kun egen husstand';
  assert (select count(*) from public.meal_plan_entries) = 0, 'barnet ser ikke Vores hjems madplan';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert (select count(*) from public.households) = 1 and (select name from public.households) = 'Vores hjem', 'Vores hjem ser ikke Farhats hjem';
end $$;
reset role;
rollback;
