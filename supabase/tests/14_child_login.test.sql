-- Barnelogin: husstandskode + brugernavn + PIN, oprettelse, lås, deaktivering
begin;
-- Vores hjem: Far (owner), Mor (adult). Farhats hjem: Farhat (owner).
-- Auth-brugere til børnene oprettes som Edge Function "child-admin" gør det (skjult e-mail).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'far@test.dk'),
  ('00000000-0000-0000-0000-0000000000f2', 'mor@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'farhat@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-aaaa@internal.home'),
  ('00000000-0000-0000-0000-0000000000c2', 'child-bbbb@internal.home'),
  ('00000000-0000-0000-0000-0000000000c3', 'child-cccc@internal.home'),
  ('00000000-0000-0000-0000-0000000000c4', 'child-dddd@internal.home'),
  ('00000000-0000-0000-0000-0000000000b9', 'child-eeee@internal.home');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'Vores hjem'), ('22222222-2222-2222-2222-222222222222', 'Farhats hjem');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f2', 'adult'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');

-- Familiens data (til at kontrollere hvad børn kan se)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
insert into public.shopping_lists (id, household_id, name) values ('5b000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Indkøb');
insert into public.shopping_items (household_id, list_id, name, added_by) values ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000001', 'Mælk', '00000000-0000-0000-0000-0000000000f1');
insert into public.savings_goals (household_id, name, target_ore, created_by) values ('11111111-1111-1111-1111-111111111111', 'Ferie', 100000, '00000000-0000-0000-0000-0000000000f1');
insert into public.fixed_items (household_id, kind, name, owner_kind, owner_user_id, start_month, created_by)
values ('11111111-1111-1111-1111-111111111111', 'income', 'Løn', 'member', '00000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-0000-0000-0000-0000000000f1');
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------- husstandskoder
do $$
declare c1 text; c2 text;
begin
  select code into c1 from private.household_login_codes where household_id = '11111111-1111-1111-1111-111111111111';
  select code into c2 from private.household_login_codes where household_id = '22222222-2222-2222-2222-222222222222';
  assert c1 ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'kode genereres automatisk og er let at læse';
  assert c1 <> c2, 'koder er unikke';
  -- Faste koder gør testen nem at læse
  update private.household_login_codes set code = 'VHJM42' where household_id = '11111111-1111-1111-1111-111111111111';
  update private.household_login_codes set code = 'FARH82' where household_id = '22222222-2222-2222-2222-222222222222';
end $$;

-- ---------------------------------------------------------------- kun service_role må kalde login/oprettelse direkte
do $$ begin
  assert not has_function_privilege('anon', 'public.child_login_verify(text, text, text, text)', 'execute'), 'anon kan ikke kalde login-tjekket direkte';
  assert not has_function_privilege('authenticated', 'public.child_login_verify(text, text, text, text)', 'execute'), 'authenticated kan ikke kalde login-tjekket';
  assert not has_function_privilege('authenticated', 'public.child_account_create(uuid, uuid, text, text, text, int)', 'execute'), 'authenticated kan ikke oprette børn direkte';
  assert not has_function_privilege('authenticated', 'public.child_account_set_disabled(uuid, uuid, boolean)', 'execute'), 'authenticated kan ikke slå login fra direkte';
  assert has_function_privilege('service_role', 'public.child_login_verify(text, text, text, text)', 'execute'), 'service_role kan kalde login-tjekket';
  assert not has_table_privilege('authenticated', 'private.child_credentials', 'select'), 'PIN-hash kan ikke læses';
  assert not has_table_privilege('authenticated', 'private.household_login_codes', 'select'), 'koder kan ikke læses direkte';
end $$;

-- ---------------------------------------------------------------- oprettelse
do $$
declare ok boolean;
begin
  -- Kun owner
  assert public.child_account_check('00000000-0000-0000-0000-0000000000f1', 'noah') = 'ok', 'owner må oprette';
  assert public.child_account_check('00000000-0000-0000-0000-0000000000f2', 'noah') = 'not_owner', 'adult må ikke';
  assert public.child_account_check('00000000-0000-0000-0000-0000000000f1', 'N') = 'invalid_username', 'for kort brugernavn';
  assert public.child_account_check('00000000-0000-0000-0000-0000000000f1', 'no ah') = 'invalid_username', 'mellemrum afvises';
  begin
    perform public.child_account_create('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', 'Noah', 'noah', '482611', 6);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'adult kan ikke oprette barn';

  perform public.child_account_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'Noah', 'Noah', '482611', 6);
  perform public.child_account_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'Lina', 'lina', '7395', 4);
  assert (select role from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1') = 'child', 'barnet får rollen child';
  assert (select child_username from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1') = 'noah', 'brugernavn gemmes med små bogstaver';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'Noah', 'profil oprettet';

  -- Child kan ikke oprette (heller ikke via service-funktionen med sit eget id)
  begin
    perform public.child_account_create('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', 'Hack', 'hack', '482611', 6);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'child kan ikke oprette barn';

  -- Samme brugernavn i samme husstand afvises
  assert public.child_account_check('00000000-0000-0000-0000-0000000000f1', 'NOAH') = 'username_taken', 'tjek: brugernavn optaget';
  begin
    perform public.child_account_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'Noah 2', 'noah', '482611', 6);
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'samme husstand kan ikke have to børn med samme brugernavn';
  assert not exists (select 1 from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c3'), 'intet halvfærdigt medlemskab efter fejl';
  assert not exists (select 1 from private.child_credentials where user_id = '00000000-0000-0000-0000-0000000000c3'), 'ingen PIN efter fejl';

  -- En anden husstand må gerne have en "noah"
  perform public.child_account_create('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b9', 'Noah F', 'noah', '582917', 6);
  assert (select count(*) from public.household_members where child_username = 'noah') = 2, 'to husstande kan begge have en noah';

  -- Lette PIN'er er tilladt (forældrene bestemmer); forkert længde eller bogstaver afvises
  assert private.valid_pin('123456', 6) and private.valid_pin('1111', 4), 'lette PIN''er er tilladt';
  assert not private.valid_pin('12a456', 6) and not private.valid_pin('1234', 6), 'kun cifre i den valgte længde';
  begin
    perform public.child_account_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'Ali', 'ali', '48261', 6);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'forkert længde afvises';
end $$;

-- ---------------------------------------------------------------- PIN gemmes aldrig i klar tekst
do $$ begin
  assert (select pin_hash from private.child_credentials where user_id = '00000000-0000-0000-0000-0000000000c1') like '$2a$10$%', 'bcrypt-hash';
  assert not exists (
    select 1 from private.child_credentials c where position('482611' in c::text) > 0 or position('7395' in c::text) > 0
  ), 'PIN står ingen steder i credentials';
  assert not exists (select 1 from public.household_members m where position('482611' in m::text) > 0), 'PIN står ikke i medlemmer';
  assert not exists (select 1 from public.profiles p where position('482611' in p::text) > 0), 'PIN står ikke i profiler';
end $$;

-- ---------------------------------------------------------------- login
do $$
declare r jsonb;
begin
  r := public.child_login_verify('vhjm42', 'Noah', '482611', '10.0.0.1');
  assert (r ->> 'ok')::boolean and (r ->> 'user_id')::uuid = '00000000-0000-0000-0000-0000000000c1', 'korrekt PIN logger ind (kode og navn uafhængigt af store/små bogstaver)';
  assert r ->> 'email' = 'child-aaaa@internal.home', 'Edge Function får den skjulte identitet';
  r := public.child_login_verify(' VH JM42 ', 'lina', '7395', '10.0.0.1');
  assert (r ->> 'ok')::boolean, '4-cifret PIN virker; mellemrum i koden ignoreres';
  -- Brugernavn identificeres altid sammen med husstandskoden
  r := public.child_login_verify('FARH82', 'noah', '582917', '10.0.0.1');
  assert (r ->> 'user_id')::uuid = '00000000-0000-0000-0000-0000000000b9', 'noah i Farhats hjem er et andet barn';
  r := public.child_login_verify('FARH82', 'noah', '482611', '10.0.0.1');
  assert not (r ->> 'ok')::boolean, 'Vores hjems PIN virker ikke i Farhats hjem';

  -- Forkert PIN, forkert navn og forkert kode giver præcis samme svar
  r := public.child_login_verify('VHJM42', 'noah', '000001', '10.0.0.2');
  assert r = '{"ok": false, "reason": "invalid"}'::jsonb, 'forkert PIN afvises';
  r := public.child_login_verify('VHJM42', 'ukendt', '482611', '10.0.0.2');
  assert r = '{"ok": false, "reason": "invalid"}'::jsonb, 'ukendt brugernavn: samme svar';
  r := public.child_login_verify('XXXXXX', 'noah', '482611', '10.0.0.2');
  assert r = '{"ok": false, "reason": "invalid"}'::jsonb, 'ukendt husstandskode: samme svar';
  r := public.child_login_verify(null, null, null, null);
  assert r = '{"ok": false, "reason": "invalid"}'::jsonb, 'tomme felter afvises';
end $$;

-- ---------------------------------------------------------------- lås ved gentagne fejl
do $$
declare r jsonb; lvl int;
begin
  for i in 1..5 loop
    r := public.child_login_verify('VHJM42', 'lina', '0000', '10.0.1.' || i);
    assert r ->> 'reason' = 'invalid', 'forsøg ' || i || ' er blot forkert';
  end loop;
  r := public.child_login_verify('VHJM42', 'lina', '7395', '10.0.2.1');
  assert r = '{"ok": false, "reason": "locked"}'::jsonb, 'efter 5 fejl er login låst – også med korrekt PIN og fra en anden IP';
  assert (select locked_until from private.login_throttle where scope = 'combo' and key = 'VHJM42:lina') between now() + interval '9 minutes' and now() + interval '11 minutes', 'første lås: 10 min';

  -- Ukendte kombinationer låses på samme måde (afslører ikke om brugeren findes)
  for i in 1..5 loop
    perform public.child_login_verify('VHJM42', 'findesikke', '0000', '10.0.3.' || i);
  end loop;
  assert public.child_login_verify('VHJM42', 'findesikke', '0000', '10.0.3.9') ->> 'reason' = 'locked', 'ukendt bruger: samme lås';

  -- Låsen udløber; næste lås er længere
  update private.login_throttle set locked_until = now() - interval '1 second' where scope = 'combo' and key = 'VHJM42:lina';
  for i in 1..5 loop
    perform public.child_login_verify('VHJM42', 'lina', '0000', '10.0.4.' || i);
  end loop;
  assert (select locked_until from private.login_throttle where scope = 'combo' and key = 'VHJM42:lina') between now() + interval '19 minutes' and now() + interval '21 minutes', 'anden lås: 20 min';
  select lock_level into lvl from private.login_throttle where scope = 'combo' and key = 'VHJM42:lina';
  assert lvl = 2, 'låseniveau tælles op';

  -- Korrekt login efter udløb nulstiller optrapningen
  update private.login_throttle set locked_until = now() - interval '1 second' where scope = 'combo' and key = 'VHJM42:lina';
  r := public.child_login_verify('VHJM42', 'lina', '7395', '10.0.4.9');
  assert (r ->> 'ok')::boolean, 'login virker igen efter låsen';
  assert (select lock_level from private.login_throttle where scope = 'combo' and key = 'VHJM42:lina') = 0, 'nulstillet efter korrekt login';

  -- Rate limit pr. IP: 30 fejl på 15 min, uanset brugernavn
  for i in 1..30 loop
    perform public.child_login_verify('VHJM42', 'spray' || i, '0000', '10.9.9.9');
  end loop;
  r := public.child_login_verify('VHJM42', 'noah', '482611', '10.9.9.9');
  assert r ->> 'reason' = 'locked', 'IP er låst efter 30 fejl – også for korrekt PIN';
  r := public.child_login_verify('VHJM42', 'noah', '482611', '10.9.9.10');
  assert (r ->> 'ok')::boolean, 'andre IP-adresser påvirkes ikke';
end $$;

-- ---------------------------------------------------------------- som barn Noah (indlogget)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.shopping_items) = 0, 'barnet ser ikke indkøbslisten';
  assert (select count(*) from public.savings_goals) = 0, 'barnet ser ikke voksnes opsparing';
  assert (select count(*) from public.fixed_items) = 0, 'barnet ser ikke løn';
  assert (select count(*) from public.household_members) = 4, 'barnet ser husstandens medlemmer';
  begin
    perform public.household_login_code();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke se husstandskoden';
  begin
    perform public.child_set_pin('00000000-0000-0000-0000-0000000000c1', '918273', 6);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke ændre sin PIN';
  begin
    perform public.child_set_username('00000000-0000-0000-0000-0000000000c2', 'hacker');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke ændre brugernavne';
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000c1', 'owner');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke ændre sin rolle';
  begin
    update public.household_members set role = 'owner', disabled_at = null where user_id = '00000000-0000-0000-0000-0000000000c1';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke rette medlemsrækken direkte';
end $$;

-- ---------------------------------------------------------------- som Mor (adult)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$
declare ok boolean;
begin
  begin
    perform public.household_login_code();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'adult kan ikke se husstandskoden';
  begin
    perform public.child_set_pin('00000000-0000-0000-0000-0000000000c1', '918273', 6);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'adult kan ikke ændre PIN';
end $$;

-- ---------------------------------------------------------------- som Far (owner)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare ok boolean;
begin
  assert public.household_login_code() = 'VHJM42', 'owner ser husstandskoden';
  -- Ny PIN
  perform public.child_set_pin('00000000-0000-0000-0000-0000000000c1', '918273', 6);
  -- Nyt brugernavn (unikt i husstanden)
  perform public.child_set_username('00000000-0000-0000-0000-0000000000c2', 'Lina.b');
  assert (select child_username from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c2') = 'lina.b', 'brugernavn ændret';
  begin
    perform public.child_set_username('00000000-0000-0000-0000-0000000000c2', 'noah');
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'brugernavn skal være unikt i husstanden';
  -- Kan ikke styre børn i en anden husstand
  begin
    perform public.child_set_pin('00000000-0000-0000-0000-0000000000b9', '918273', 6);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'owner kan ikke ændre PIN i en anden husstand';
  -- Et PIN-login kan ikke gøres til voksen
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000c1', 'adult');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'et barns PIN-login kan ikke gøres til voksen';
end $$;
reset role;

do $$
declare r jsonb;
begin
  assert not (public.child_login_verify('VHJM42', 'noah', '482611', '10.1.0.1') ->> 'ok')::boolean, 'gammel PIN virker ikke efter ændring';
  assert (public.child_login_verify('VHJM42', 'noah', '918273', '10.1.0.1') ->> 'ok')::boolean, 'ny PIN virker';
  assert (public.child_login_verify('VHJM42', 'lina.b', '7395', '10.1.0.1') ->> 'ok')::boolean, 'nyt brugernavn virker';
  assert not (public.child_login_verify('VHJM42', 'lina', '7395', '10.1.0.2') ->> 'ok')::boolean, 'gammelt brugernavn virker ikke';

  -- Ny PIN ophæver en lås
  for i in 1..5 loop
    perform public.child_login_verify('VHJM42', 'noah', '0000', '10.1.1.' || i);
  end loop;
  assert public.child_login_verify('VHJM42', 'noah', '918273', '10.1.1.9') ->> 'reason' = 'locked', 'låst';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.child_set_pin('00000000-0000-0000-0000-0000000000c1', '527104', 6);
reset role;
do $$ begin
  assert (public.child_login_verify('VHJM42', 'noah', '527104', '10.1.1.10') ->> 'ok')::boolean, 'ny PIN ophæver låsen';
end $$;

-- ---------------------------------------------------------------- deaktivering
do $$
declare ok boolean;
begin
  begin
    perform public.child_account_set_disabled('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', true);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'adult kan ikke deaktivere';
  begin
    perform public.child_account_set_disabled('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', true);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'owner i en anden husstand kan ikke deaktivere';
  begin
    perform public.child_account_set_disabled('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', true);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'kun børn kan deaktiveres';

  perform public.child_account_set_disabled('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', true);
  assert public.child_login_verify('VHJM42', 'noah', '527104', '10.2.0.1') = '{"ok": false, "reason": "invalid"}'::jsonb, 'deaktiveret barn kan ikke logge ind (samme svar)';
  assert exists (select 1 from public.household_members where user_id = '00000000-0000-0000-0000-0000000000c1'), 'medlemskab bevares';
  assert exists (select 1 from private.child_credentials where user_id = '00000000-0000-0000-0000-0000000000c1'), 'login bevares til genaktivering';
end $$;

-- En eksisterende session for et deaktiveret barn giver ingen adgang
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select count(*) from public.households) = 0, 'deaktiveret barn ser ikke husstanden';
  assert (select count(*) from public.household_members) = 0, 'deaktiveret barn ser ingen medlemmer';
  assert (select count(*) from public.meal_plan_entries) = 0, 'deaktiveret barn ser ikke madplanen';
end $$;
reset role;

do $$ begin
  perform public.child_account_set_disabled('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', false);
  assert (public.child_login_verify('VHJM42', 'noah', '527104', '10.2.0.1') ->> 'ok')::boolean, 'genaktiveret barn kan logge ind igen';
end $$;

-- ---------------------------------------------------------------- husstande er stadig adskilte
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b9';
do $$ begin
  assert (select count(*) from public.households) = 1 and (select name from public.households) = 'Farhats hjem', 'Farhats noah ser kun Farhats hjem';
  assert (select count(*) from public.household_members) = 2, 'Farhats noah ser kun egne medlemmer';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert public.household_login_code() = 'FARH82', 'Farhat ser kun sin egen kode';
  assert (select count(*) from public.household_members where household_id = '11111111-1111-1111-1111-111111111111') = 0, 'Farhat ser ikke Vores hjems børn';
end $$;
reset role;

-- Nye husstande får automatisk en kode
insert into public.households (id, name) values ('33333333-3333-3333-3333-333333333333', 'Ny husstand');
do $$ begin
  assert exists (select 1 from private.household_login_codes where household_id = '33333333-3333-3333-3333-333333333333'), 'ny husstand får kode';
end $$;
rollback;
