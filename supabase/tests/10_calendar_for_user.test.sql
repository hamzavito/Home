-- "Gælder for" på kalenderaftaler
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$
declare ok boolean; e uuid;
begin
  -- Fælles (NULL) er standard
  insert into public.calendar_events (household_id, title, event_date, all_day) values ('11111111-1111-1111-1111-111111111111', 'Fødselsdag', '2026-10-10', true) returning id into e;
  assert (select for_user_id from public.calendar_events where id = e) is null, 'standard er fælles';
  -- Oprettet af A1, gælder for A2
  insert into public.calendar_events (household_id, title, event_date, all_day, for_user_id)
  values ('11111111-1111-1111-1111-111111111111', 'Lægetid', '2026-10-11', true, '00000000-0000-0000-0000-0000000000a2') returning id into e;
  assert (select created_by = '00000000-0000-0000-0000-0000000000a1' and for_user_id = '00000000-0000-0000-0000-0000000000a2' from public.calendar_events where id = e), 'oprettet af ≠ gælder for';
  -- Kan ændres til en anden og tilbage til fælles
  update public.calendar_events set for_user_id = '00000000-0000-0000-0000-0000000000a1' where id = e;
  update public.calendar_events set for_user_id = null where id = e;
  assert (select for_user_id from public.calendar_events where id = e) is null, 'tilbage til fælles';
  -- Må ikke pege på en person fra en anden husstand
  begin
    insert into public.calendar_events (household_id, title, event_date, all_day, for_user_id)
    values ('11111111-1111-1111-1111-111111111111', 'Hack', '2026-10-12', true, '00000000-0000-0000-0000-0000000000b1');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'medlem af anden husstand afvist';
  begin
    update public.calendar_events set for_user_id = '00000000-0000-0000-0000-0000000000b1' where id = e;
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'opdatering til anden husstand afvist';
end $$;

-- Forlader et medlem husstanden, bliver aftalen fælles (data bevares)
-- (medlemskab kan ikke ændres fra appen; her som administrator)
reset role;
insert into public.calendar_events (household_id, title, event_date, all_day, for_user_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'Tandlæge', '2026-10-13', true, '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1');
delete from public.household_members where user_id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select for_user_id from public.calendar_events where title = 'Tandlæge') is null, 'bliver fælles';
  assert (select count(*) from public.calendar_events where title = 'Tandlæge') = 1, 'aftalen bevares';
end $$;
rollback;
