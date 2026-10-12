-- Familieoplysninger: familiens sammensætning er adskilt fra hvem der har login
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hamza@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'sumaya@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-x@internal.home'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'child'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare c jsonb; hid uuid := public.current_household_id();
begin
  -- Uden oplysninger: voksne = voksne med login, ingen børn (ikke antal child-brugere)
  c := public.household_composition();
  assert (c->>'adults')::int = 2, 'to voksne med login';
  assert jsonb_array_length(c->'children') = 0, 'barn med login tæller ikke, før det står i familieoplysningerne';

  -- 2 voksne, 2 børn (3 og 10 år) – kun det 10-årige har login
  insert into public.household_children (household_id, name, born_on) values (hid, 'Lille', current_date - interval '3 years 2 months');
  insert into public.household_children (household_id, name, born_on, member_user_id)
    values (hid, 'Noah', current_date - interval '10 years 1 day', '00000000-0000-0000-0000-0000000000c1');
  c := public.household_composition();
  assert (c->>'adults')::int = 2 and jsonb_array_length(c->'children') = 2, '2 voksne + 2 børn';
  assert c->'children'->0->>'age' = '10' and c->'children'->1->>'age' = '3', 'aldre beregnes fra fødselsdato: ' || c::text;
  assert c->'children'->0->>'user_id' = '00000000-0000-0000-0000-0000000000c1', 'koblet til barnets login';

  -- Samme barn kan ikke kobles til to poster (ingen dobbelttælling)
  begin
    insert into public.household_children (household_id, name, born_on, member_user_id) values (hid, 'Noah igen', current_date - interval '9 years', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'dobbelt kobling blev accepteret';
  exception when unique_violation then null; end;
  -- Koblingen skal være et barn i husstanden
  begin
    insert into public.household_children (household_id, name, born_on, member_user_id) values (hid, 'Far', current_date - interval '9 years', '00000000-0000-0000-0000-0000000000a2');
    raise exception 'en voksen blev koblet som barn';
  exception when check_violation then null; end;

  -- Antal voksne kan sættes uafhængigt af logins (fx en voksen uden app)
  update public.households set adults = 3 where id = hid;
  assert (public.household_composition()->>'adults')::int = 3, 'antal voksne fra familieoplysninger';
  update public.households set adults = null where id = hid;
  assert (public.household_composition()->>'adults')::int = 2, 'tomt = voksne med login';

  -- Eksporten tager børnene med
  assert jsonb_array_length(public.export_household_data()->'household_children') = 2, 'eksport';
end $$;

-- Barnet mister sit login → posten bliver, men uden kobling
reset role;
delete from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.household_children where name = 'Noah' and member_user_id is null) = 1, 'kobling fjernes, barnet bliver i familien';
end $$;

-- Husstand B ser intet; børn ser ikke familieoplysningerne
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.household_children) = 0, 'B ser ikke A''s børn';
end $$;

rollback;
