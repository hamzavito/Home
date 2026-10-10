-- Børn: uden login, lommepenge til/fra, giv login senere, slet barn
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'far@test.dk'),
  ('00000000-0000-0000-0000-0000000000f2', 'mor@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'anden@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-aaaa@internal.home'),
  ('00000000-0000-0000-0000-0000000000c2', 'child-bbbb@internal.home');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'Vores hjem'), ('22222222-2222-2222-2222-222222222222', 'Andet hjem');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f2', 'adult'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');
update private.household_login_codes set code = 'VHJM42' where household_id = '11111111-1111-1111-1111-111111111111';

do $$ begin
  assert not has_function_privilege('authenticated', 'public.child_profile_create(uuid, uuid, text, boolean)', 'execute'), 'kun Edge Function opretter';
  assert not has_function_privilege('authenticated', 'public.child_add_login(uuid, uuid, text, text, int)', 'execute'), 'kun Edge Function giver login';
  assert not has_function_privilege('authenticated', 'public.child_delete_prepare(uuid, uuid)', 'execute'), 'kun Edge Function sletter';
  assert has_function_privilege('authenticated', 'public.child_set_wallet(uuid, boolean)', 'execute');
end $$;

-- ---------------------------------------------------------------- barn uden login
do $$
declare ok boolean;
begin
  begin
    perform public.child_profile_create('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', 'Ella', false);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kun ejeren';
  perform public.child_profile_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', ' Ella ', false);
  assert (select role = 'child' and no_login and not wallet_enabled and child_username is null
          from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1'), 'barn uden login og uden lommepenge';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'Ella';
  assert not exists (select 1 from private.child_credentials where user_id = '00000000-0000-0000-0000-0000000000c1'), 'ingen PIN';
  assert not (public.child_login_verify('VHJM42', 'ella', '482611', '10.0.0.1') ->> 'ok')::boolean, 'kan ikke logge ind';
end $$;

-- Rolle kan ikke ændres til voksen; lommepenge kan slås til af ejeren
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare ok boolean;
begin
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000c1', 'adult');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'barn uden login kan ikke blive voksen';
  perform public.child_set_wallet('00000000-0000-0000-0000-0000000000c1', true);
  assert (select wallet_enabled from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1'), 'lommepenge slået til';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$
declare ok boolean;
begin
  begin
    perform public.child_set_wallet('00000000-0000-0000-0000-0000000000c1', false);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kun ejeren styrer lommepenge til/fra';
end $$;
reset role;

-- Faste lommepenge forhindrer at slå lommepenge fra
insert into public.child_allowance_schedules (household_id, child_id, amount_ore, frequency, weekday, start_on, pay_from, created_by)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 2000, 'weekly', 5, '2026-10-01', '2026-10-01', '00000000-0000-0000-0000-0000000000f1');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare ok boolean;
begin
  begin
    perform public.child_set_wallet('00000000-0000-0000-0000-0000000000c1', false);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'stop faste lommepenge først';
end $$;
reset role;

-- ---------------------------------------------------------------- giv login senere
do $$
declare ok boolean; r jsonb;
begin
  begin
    perform public.child_add_login('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'ella', '482611', 6);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'ejer af en anden husstand kan ikke';
  perform public.child_add_login('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'Ella', '482611', 6);
  assert (select not no_login and child_username = 'ella' from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1'), 'har nu login';
  r := public.child_login_verify('VHJM42', 'ella', '482611', '10.0.0.1');
  assert (r ->> 'ok')::boolean, 'kan logge ind';
  begin
    perform public.child_add_login('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'ella2', '482611', 6);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'kun børn uden login';
end $$;

-- ---------------------------------------------------------------- slet barn
-- Data om barnet: lommepenge, mål, opgave, aftaler, udgift betalt af barnet
insert into public.household_members (household_id, user_id, role, no_login) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c2', 'child', true);
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-0000000000c2', 'Bo') on conflict (id) do nothing;
insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore, created_by) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'deposit', 5000, '00000000-0000-0000-0000-0000000000f1');
insert into public.child_savings_goals (household_id, child_id, name, target_ore, created_by) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'Cykel', 100000, '00000000-0000-0000-0000-0000000000f1');
insert into public.household_tasks (id, household_id, title, assignee_id, created_by) values
  ('7a000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'Red seng', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1');
insert into public.calendar_events (household_id, title, event_date, all_day, participant_ids, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Svømning', '2026-10-13', true, '{00000000-0000-0000-0000-0000000000c1}', '00000000-0000-0000-0000-0000000000f1'),
  ('11111111-1111-1111-1111-111111111111', 'Tandlæge', '2026-10-14', true, '{00000000-0000-0000-0000-0000000000c1,00000000-0000-0000-0000-0000000000f1}', '00000000-0000-0000-0000-0000000000f1'),
  ('11111111-1111-1111-1111-111111111111', 'Bo til læge', '2026-10-15', true, '{00000000-0000-0000-0000-0000000000c2}', '00000000-0000-0000-0000-0000000000f1');
insert into public.calendar_events (household_id, title, event_date, all_day, for_user_id, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Gammel aftale', '2026-10-16', true, '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1');
update public.child_allowance_schedules set stopped_at = now();

do $$
declare ok boolean;
begin
  begin
    perform public.child_delete_prepare('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kun ejeren sletter';
  begin
    perform public.child_delete_prepare('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'voksne slettes ikke her';
  begin
    perform public.child_delete_prepare('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'ikke en anden husstands barn';

  perform public.child_delete_prepare('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1');
  assert not exists (select 1 from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1'), 'medlemskab væk';
  assert not exists (select 1 from private.child_credentials where user_id = '00000000-0000-0000-0000-0000000000c1'), 'PIN væk';
  assert not exists (select 1 from public.child_wallet_transactions where child_id = '00000000-0000-0000-0000-0000000000c1'), 'lommepenge væk';
  assert not exists (select 1 from public.child_savings_goals where child_id = '00000000-0000-0000-0000-0000000000c1'), 'mål væk';
  assert not exists (select 1 from public.child_allowance_schedules where child_id = '00000000-0000-0000-0000-0000000000c1'), 'faste lommepenge væk';
  assert (select assignee_id is null from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000e1'), 'opgaven bliver uden ansvarlig';
  assert not exists (select 1 from public.calendar_events where title = 'Svømning'), 'aftale kun for barnet slettet';
  assert (select participant_ids = '{00000000-0000-0000-0000-0000000000f1}' from public.calendar_events where title = 'Tandlæge'), 'fjernet fra fælles aftale';
  assert not exists (select 1 from public.calendar_events where title = 'Gammel aftale'), 'ældre aftale kun for barnet slettet';
  assert exists (select 1 from public.calendar_events where title = 'Bo til læge'), 'andre børns aftaler bevares';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'Tidligere medlem', 'anonymiseret';
  assert not (public.child_login_verify('VHJM42', 'ella', '482611', '10.0.0.9') ->> 'ok')::boolean, 'kan ikke logge ind';

  -- Barn uden login kan også slettes
  perform public.child_delete_prepare('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2');
  assert not exists (select 1 from public.calendar_events where title = 'Bo til læge');
  assert (select count(*) from public.household_members where household_id = '11111111-1111-1111-1111-111111111111') = 2, 'de voksne er tilbage';
end $$;

-- Begrænsning: no_login kun for børn uden brugernavn
do $$
declare ok boolean;
begin
  begin
    update public.household_members set no_login = true where user_id = '00000000-0000-0000-0000-0000000000f2';
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'voksne kan ikke være uden login';
end $$;
rollback;
