-- RLS-tests for husstand, profiler og medlemmer.
-- To husstande: "Vores" (a1, a2) og "Fremmed" (b1). Der må aldrig kunne ses
-- eller ændres data på tværs.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk', '{"display_name":"Anna"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'uden@test.dk', '{}');

insert into public.households (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Vores'),
  ('22222222-2222-2222-2222-222222222222', 'Fremmed');

insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- Trigger opretter profiler automatisk
do $$ begin
  assert (select count(*) from public.profiles) = 4, 'profiler oprettes af trigger';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Anna',
    'display_name fra metadata';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'a2',
    'display_name fra e-mail';
end $$;

-- ---------------------------------------------------------------- bruger a1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$ begin
  assert (select count(*) from public.households) = 1, 'a1 ser kun egen husstand';
  assert (select name from public.households) = 'Vores', 'a1 ser "Vores"';
  assert (select count(*) from public.household_members) = 2, 'a1 ser kun egne medlemmer';
  assert (select count(*) from public.profiles) = 2, 'a1 ser egen + partnerens profil';
  assert public.current_household_id() = '11111111-1111-1111-1111-111111111111', 'current_household_id';
end $$;

-- Opdatering af fremmed husstand rammer 0 rækker
update public.households set name = 'Hacket' where id = '22222222-2222-2222-2222-222222222222';
update public.households set name = 'Vores hjem' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Hacket' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set display_name = 'Anna B' where id = '00000000-0000-0000-0000-0000000000a1';

-- Forbudte handlinger skal fejle
do $$
declare ok boolean;
begin
  begin
    insert into public.households (name) values ('Ny');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'må ikke oprette husstande';

  begin
    insert into public.household_members (household_id, user_id)
    values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000a1');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'må ikke melde sig ind i andre husstande';

  begin
    update public.household_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a2';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'må ikke ændre roller';

  begin
    delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a2';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'må ikke slette profiler';
end $$;

-- ---------------------------------------------------------------- bruger b1
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.households) = 1, 'b1 ser kun egen husstand';
  assert (select name from public.households) = 'Fremmed', 'b1s husstand er uændret';
  assert (select count(*) from public.profiles) = 1, 'b1 ser kun sig selv';
end $$;

-- ---------------------------------------------- bruger uden husstand
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select count(*) from public.households) = 0, 'uden husstand ser intet';
  assert public.current_household_id() is null, 'ingen husstand';
  assert (select count(*) from public.profiles) = 1, 'ser kun egen profil';
end $$;

-- ---------------------------------------------------------------- anon
reset request.jwt.claim.sub;
set local role anon;
do $$
declare ok boolean;
begin
  begin
    perform count(*) from public.households;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'anon har ingen adgang';
end $$;

-- ---------------------------------------------------------------- resultat
reset role;
do $$ begin
  assert (select name from public.households where id = '11111111-1111-1111-1111-111111111111') = 'Vores hjem',
    'a1 kunne omdøbe egen husstand';
  assert (select name from public.households where id = '22222222-2222-2222-2222-222222222222') = 'Fremmed',
    'fremmed husstand er uændret';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'a2',
    'partnerens profil er uændret';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Anna B',
    'egen profil opdateret';
end $$;

rollback;
