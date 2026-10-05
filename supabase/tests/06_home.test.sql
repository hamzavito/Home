-- Tests for indkøb, opgaver og kalender
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

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------- indkøb
insert into ctx select 'list', public.ensure_shopping_list()::text;
do $$
declare ok boolean; lid uuid := (select v from ctx where k = 'list')::uuid;
begin
  assert public.ensure_shopping_list() = lid, 'samme liste ved gentagelse';
  assert (select count(*) from public.shopping_lists) = 1, 'én liste';
  insert into public.shopping_items (household_id, list_id, name, quantity) values ('11111111-1111-1111-1111-111111111111', lid, 'Mælk', '2 l');
  assert (select added_by from public.shopping_items) = '00000000-0000-0000-0000-0000000000a1', 'tilføjet af';
  begin
    insert into public.shopping_items (household_id, list_id, name, added_by) values ('11111111-1111-1111-1111-111111111111', lid, 'x', '00000000-0000-0000-0000-0000000000a2');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'tilføjet af kan ikke forfalskes';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
update public.shopping_items set is_checked = true where name = 'Mælk';
do $$ begin
  assert (select checked_by from public.shopping_items where name = 'Mælk') = '00000000-0000-0000-0000-0000000000a2', 'købt af partneren';
  assert (select checked_at from public.shopping_items where name = 'Mælk') is not null, 'tidspunkt sat';
end $$;
update public.shopping_items set is_checked = false where name = 'Mælk';
do $$ begin
  assert (select checked_by from public.shopping_items where name = 'Mælk') is null, 'fortryd købt';
end $$;

-- ---------------------------------------------------------------- opgaver
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.household_tasks (household_id, title, due_on, recurrence, recurrence_interval, assignee_id)
values ('11111111-1111-1111-1111-111111111111', 'Støvsuge', '2026-10-05', 'weekly', 2, '00000000-0000-0000-0000-0000000000a2');
insert into public.household_tasks (household_id, title, due_on, recurrence)
values ('11111111-1111-1111-1111-111111111111', 'Skifte filter', '2026-01-31', 'monthly');
insert into public.household_tasks (household_id, title) values ('11111111-1111-1111-1111-111111111111', 'Rengøre ovn');

do $$
declare n1 uuid; n2 uuid; t uuid := (select id from public.household_tasks where title = 'Støvsuge'); ok boolean;
begin
  -- Direkte statusændring er ikke tilladt
  begin
    update public.household_tasks set status = 'done' where id = t;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'status kun via funktion';

  perform public.set_task_status(t, 'in_progress');
  assert (select status from public.household_tasks where id = t) = 'in_progress', 'i gang';

  n1 := public.set_task_status(t, 'done');
  n2 := public.set_task_status(t, 'done');
  assert n1 = n2 and n1 is not null, 'samme næste forekomst ved dobbelt afslutning';
  assert (select count(*) from public.household_tasks where title = 'Støvsuge') = 2, 'ingen dubletter';
  assert (select due_on from public.household_tasks where id = n1) = '2026-10-19', 'hver 2. uge';
  assert (select assignee_id from public.household_tasks where id = n1) = '00000000-0000-0000-0000-0000000000a2', 'ansvarlig følger med';
  assert (select status from public.household_tasks where id = n1) = 'open', 'næste er åben';

  -- Genåbn: den urørte efterfølger fjernes
  perform public.set_task_status(t, 'open');
  assert (select count(*) from public.household_tasks where title = 'Støvsuge') = 1, 'efterfølger fjernet ved genåbning';
  assert (select completed_at from public.household_tasks where id = t) is null, 'genåbnet';

  -- Månedlig fra 31. januar → 28. februar
  n1 := public.set_task_status((select id from public.household_tasks where title = 'Skifte filter'), 'done');
  assert (select due_on from public.household_tasks where id = n1) = '2026-02-28', 'måned klemmes';

  -- Ikke-gentagende opgave giver ingen efterfølger
  assert public.set_task_status((select id from public.household_tasks where title = 'Rengøre ovn'), 'done') is null, 'ingen gentagelse';

  -- Ansvarlig skal være medlem af husstanden
  begin
    insert into public.household_tasks (household_id, title, assignee_id) values ('11111111-1111-1111-1111-111111111111', 'x', '00000000-0000-0000-0000-0000000000b1');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'ansvarlig fra fremmed husstand afvises';
end $$;

-- ---------------------------------------------------------------- kalender
do $$
declare ok boolean;
begin
  insert into public.calendar_events (household_id, title, event_date, start_time, end_time, type)
  values ('11111111-1111-1111-1111-111111111111', 'Lægetid', '2026-10-07', '09:30', '10:00', 'doctor');
  insert into public.calendar_events (household_id, title, event_date, end_date, all_day, type)
  values ('11111111-1111-1111-1111-111111111111', 'Efterårsferie', '2026-10-12', '2026-10-18', true, 'vacation');
  assert (select count(*) from public.calendar_events) = 2, 'to aftaler';
  begin
    insert into public.calendar_events (household_id, title, event_date, start_time, end_time)
    values ('11111111-1111-1111-1111-111111111111', 'x', '2026-10-07', '10:00', '09:00');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'sluttid før starttid afvises';
  begin
    insert into public.calendar_events (household_id, title, event_date, all_day)
    values ('11111111-1111-1111-1111-111111111111', 'x', '2026-10-07', false);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ikke-heldag kræver starttid';
end $$;

-- ---------------------------------------------------------------- isolation
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.shopping_items) = 0, 'B ser ingen varer';
  assert (select count(*) from public.household_tasks) = 0, 'B ser ingen opgaver';
  assert (select count(*) from public.calendar_events) = 0, 'B ser ingen aftaler';
  assert public.ensure_shopping_list() <> (select v from ctx where k = 'list')::uuid, 'B får sin egen liste';
  begin
    insert into public.shopping_items (household_id, list_id, name) values ('22222222-2222-2222-2222-222222222222', (select v from ctx where k = 'list')::uuid, 'x');
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'B kan ikke tilføje til A''s liste';
  begin
    perform public.set_task_status((select id from public.household_tasks limit 1), 'done');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'B kan ikke ændre A''s opgaver';
  delete from public.calendar_events;
  update public.shopping_items set name = 'hacket';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.calendar_events) = 2, 'B kunne ikke slette A''s aftaler';
  assert not exists (select 1 from public.shopping_items where name = 'hacket'), 'B kunne ikke ændre A''s varer';
end $$;
rollback;
