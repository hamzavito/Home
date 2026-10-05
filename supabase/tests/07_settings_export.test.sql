-- Tests for indstillinger og eksport
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');
insert into public.calendar_events (household_id, title, event_date, all_day, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'A-aftale', '2026-10-10', true, '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', 'B-aftale', '2026-10-10', true, '00000000-0000-0000-0000-0000000000b1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- Standardværdier kan ændres af medlemmer, men kun gyldige værdier
update public.households set default_receipt_retention = '6m' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set default_paid_by = 'shared' where id = '00000000-0000-0000-0000-0000000000a1';
do $$
declare ok boolean;
begin
  assert (select default_receipt_retention from public.households where id = '11111111-1111-1111-1111-111111111111') = '6m', 'retention gemt';
  assert (select default_paid_by from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'shared', 'betalt af gemt';
  begin
    update public.households set default_receipt_retention = '10y' where id = '11111111-1111-1111-1111-111111111111';
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ugyldig retention afvises';
  -- Kan ikke ændre en anden husstand eller en andens profil
  update public.households set default_receipt_retention = 'permanent' where id = '22222222-2222-2222-2222-222222222222';
  update public.profiles set default_paid_by = 'shared' where id = '00000000-0000-0000-0000-0000000000a2';
end $$;

-- Eksport indeholder kun egen husstand
do $$
declare e jsonb := public.export_household_data();
begin
  assert e ->> 'format' = 'hjem-export', 'format';
  assert e -> 'household' ->> 'name' = 'A', 'egen husstand';
  assert jsonb_array_length(e -> 'calendar_events') = 1, 'kun egne aftaler';
  assert e -> 'calendar_events' -> 0 ->> 'title' = 'A-aftale', 'rigtig aftale';
  assert jsonb_array_length(e -> 'profiles') = 2, 'begge medlemmer';
  assert jsonb_array_length(e -> 'transactions') = 0, 'tomme lister er []';
end $$;

-- Bruger uden husstand kan ikke eksportere
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  begin
    perform public.export_household_data();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ingen husstand → afvist';
end $$;

reset role;
do $$ begin
  assert (select default_receipt_retention from public.households where id = '22222222-2222-2222-2222-222222222222') = '30d', 'B uændret';
  assert (select default_paid_by from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'me', 'partnerens profil uændret';
end $$;

-- anon må ikke kalde eksport
do $$
begin
  assert not has_function_privilege('anon', 'public.export_household_data()', 'execute'), 'anon kan ikke eksportere';
end $$;
rollback;
