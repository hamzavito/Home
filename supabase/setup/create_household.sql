-- =============================================================================
-- Engangsopsætning: opret husstanden og tilknyt de to brugere.
-- =============================================================================
-- 1. Opret først begge brugere i Supabase: Authentication → Users → Add user
--    (sæt "Auto Confirm User" til, og vælg en adgangskode).
-- 2. Ret navne og e-mails nedenfor og kør scriptet i SQL Editor.
--    Scriptet kan køres igen uden at skabe dubletter.
-- =============================================================================
do $$
declare
  household_name constant text := 'Vores hjem';
  members constant jsonb := '[
    {"email": "mig@example.com",   "display_name": "Mig",     "role": "owner"},
    {"email": "kone@example.com",  "display_name": "Min kone", "role": "owner"}
  ]';
  hid uuid;
  m jsonb;
  uid uuid;
begin
  -- Genbrug eksisterende husstand, hvis en af brugerne allerede er tilknyttet.
  select hm.household_id into hid
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where lower(u.email) in (select lower(x ->> 'email') from jsonb_array_elements(members) x)
  limit 1;

  if hid is null then
    insert into public.households (name) values (household_name) returning id into hid;
  end if;

  for m in select * from jsonb_array_elements(members) loop
    select id into uid from auth.users where lower(email) = lower(m ->> 'email');
    if uid is null then
      raise exception 'Brugeren % findes ikke i Authentication → Users', m ->> 'email';
    end if;

    insert into public.profiles (id, display_name)
    values (uid, m ->> 'display_name')
    on conflict (id) do update set display_name = excluded.display_name;

    insert into public.household_members (household_id, user_id, role)
    values (hid, uid, m ->> 'role')
    on conflict (household_id, user_id) do update set role = excluded.role;
  end loop;

  raise notice 'Husstand % er klar', hid;
end;
$$;
