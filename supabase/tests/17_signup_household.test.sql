-- Tilmelding: opret husstand, invitationer, forlad husstand, slet konto
begin;
-- a1: ny Apple-bruger (skjult e-mail), a2: partner, a3: anden voksen, x9: fremmed med for mange forsøg
-- b1: ejer af en anden husstand
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'q7x2abc@privaterelay.appleid.com', '{"full_name": "Hamza"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'partner@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000a3', 'anden@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000a4', null, '{}'),
  ('00000000-0000-0000-0000-0000000000a5', 'meget.meget.meget.meget.meget.meget.langt.navn@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000a6', 'sidst@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000e9', 'gaet@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.dk', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-z@internal.home', '{}');
insert into public.households (id, name) values ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------- profiler fra Apple/Google/e-mail
do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Hamza', 'navn fra Apple/Google';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'partner', 'navn fra e-mail';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a4') = 'Bruger', 'uden e-mail';
  assert length((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a5')) = 40, 'langt navn afkortes – oprettelsen fejler aldrig';
  assert not has_function_privilege('authenticated', 'public.account_delete_prepare(uuid)', 'execute'), 'kun service_role kan slette konti';
  assert not has_table_privilege('authenticated', 'private.household_invites', 'select'), 'invitationer kan ikke læses direkte';
end $$;

set local role authenticated;
-- ---------------------------------------------------------------- opret husstand
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare hid uuid; ok boolean;
begin
  assert public.current_household_id() is null, 'ny bruger har ingen husstand';
  begin
    perform public.household_create('   ');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'navn kræves';
  hid := public.household_create('Familien Test', 'Hamza A.');
  insert into ctx values ('hid', hid::text);
  assert public.current_household_id() = hid, 'ny husstand';
  assert (select role from public.household_members where user_id = auth.uid()) = 'owner', 'opretteren er ejer';
  assert (select display_name from public.profiles where id = auth.uid()) = 'Hamza A.', 'navnet gemmes';
  assert (select name from public.households where id = hid) = 'Familien Test', 'kan se sin husstand';
  begin
    perform public.household_create('To husstande');
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'kun én husstand pr. bruger';
end $$;

-- Data i husstanden
reset role;
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-0000000000a1', (select v from ctx where k = 'hid')::uuid, 'Mad', '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;

-- ---------------------------------------------------------------- invitationer
do $$
declare c text; i int;
begin
  select code into c from public.invite_create();
  assert c ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'kode på 8 letlæselige tegn';
  insert into ctx values ('code1', c);
  assert (select count(*) from public.invite_list()) = 1, 'aktiv invitation vises';
  -- Kun hash gemmes
  reset role;
  assert not exists (select 1 from private.household_invites where code_hash = c), 'koden gemmes ikke i klartekst';
  set local role authenticated;
  for i in 2..10 loop perform public.invite_create(); end loop;
  begin
    perform public.invite_create();
    assert false, 'højst 10 aktive invitationer';
  exception when check_violation then null;
  end;
end $$;
-- Ryd de 9 ekstra (tilbagekald)
do $$
declare r record;
begin
  for r in select invite_id from public.invite_list() offset 1 loop
    perform public.invite_revoke(r.invite_id);
  end loop;
  assert (select count(*) from public.invite_list()) = 1, 'tilbagekaldte vises ikke';
end $$;

-- Partneren ser invitationen og siger ja (koden må skrives med mellemrum og småt)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare c text := (select v from ctx where k = 'code1');
declare hid uuid := (select v from ctx where k = 'hid')::uuid;
begin
  assert (select household_name from public.invite_preview(lower(substr(c, 1, 4) || ' ' || substr(c, 5)))) = 'Familien Test', 'forhåndsvisning';
  assert (select invited_by from public.invite_preview(c)) = 'Hamza A.', 'hvem inviterer';
  assert public.invite_accept(c, 'Sara') = hid, 'medlem';
  assert (select role from public.household_members where user_id = auth.uid() and left_at is null) = 'adult', 'som voksen';
  assert public.current_household_id() = hid, 'har nu husstanden';
  assert (select count(*) from public.budget_categories) = 1, 'kan se husstandens data';
  assert (select display_name from public.profiles where id = auth.uid()) = 'Sara', 'navn sat ved tilmelding';
  -- Voksne må også invitere
  insert into ctx select 'code2', code from public.invite_create();
end $$;

-- Koden kan kun bruges én gang
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert public.invite_accept((select v from ctx where k = 'code1')) is null, 'brugt kode virker ikke';
  assert not exists (select 1 from public.invite_preview((select v from ctx where k = 'code1'))), 'brugt kode giver ingen forhåndsvisning';
  assert public.current_household_id() is null, 'stadig uden husstand';
end $$;

-- Medlem af en anden husstand kan ikke tage imod
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  begin
    perform public.invite_accept((select v from ctx where k = 'code2'));
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'allerede i en husstand';
  -- …og kan ikke se eller tilbagekalde andres invitationer
  assert (select count(*) from public.invite_list()) = 0, 'ser ikke andre husstandes invitationer';
end $$;

-- Gætteri låses efter 10 forkerte forsøg
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e9';
do $$
declare i int; ok boolean;
begin
  for i in 1..10 loop
    assert public.invite_accept('AAAA' || lpad(i::text, 4, 'B')) is null, 'forkert kode';
  end loop;
  begin
    perform public.invite_accept((select v from ctx where k = 'code2'));
    ok := false;
  exception when others then ok := sqlerrm like 'For mange forsøg%';
  end;
  assert ok, 'låst – selv med rigtig kode';
end $$;

-- Udløbet og tilbagekaldt
reset role;
update private.household_invites set expires_at = now() - interval '1 minute'
where code_hash = private.invite_hash((select v from ctx where k = 'code2'));
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert public.invite_accept((select v from ctx where k = 'code2')) is null, 'udløbet kode virker ikke';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into ctx select 'code3', code from public.invite_create();
insert into ctx select 'code4', code from public.invite_create();
reset role;
insert into ctx select 'inv4', id::text from private.household_invites where code_hash = private.invite_hash((select v from ctx where k = 'code4'));
set local role authenticated;
do $$ begin
  perform public.invite_revoke((select v from ctx where k = 'inv4')::uuid);
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$
declare ok boolean;
begin
  assert public.invite_accept((select v from ctx where k = 'code4')) is null, 'tilbagekaldt kode virker ikke';
  begin
    perform public.invite_revoke((select v from ctx where k = 'inv4')::uuid);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'fremmede kan ikke tilbagekalde';
  assert public.invite_accept((select v from ctx where k = 'code3')) = (select v from ctx where k = 'hid')::uuid, 'a3 er med';
end $$;

-- ---------------------------------------------------------------- forlad husstanden
-- Partneren har historik (betalt af Sara)
reset role;
insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id, created_by)
values ((select v from ctx where k = 'hid')::uuid, 'c0000000-0000-0000-0000-0000000000a1', 5000, '2026-10-01', 'Netto', 'member', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-0000000000a2', 'https://push.example/abc', repeat('A', 87), repeat('B', 22));
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  perform public.household_leave();
  assert public.current_household_id() is null, 'ingen husstand efter at have forladt den';
  assert (select count(*) from public.transactions) = 0, 'kan ikke længere se husstandens data';
  assert (select count(*) from public.budget_categories) = 0, 'heller ikke kategorier';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.push_subscriptions where user_id = '00000000-0000-0000-0000-0000000000a2'), 'ingen notifikationer efter at have forladt husstanden';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.transactions) = 1, 'historikken bevares';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'Sara', 'tidligere medlems navn vises stadig';
  assert (select left_at is not null from public.household_members where user_id = '00000000-0000-0000-0000-0000000000a2'), 'markeret som gået';
  -- Kan inviteres igen: samme række genaktiveres
  insert into ctx select 'code5', code from public.invite_create();
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert public.invite_accept((select v from ctx where k = 'code5')) = (select v from ctx where k = 'hid')::uuid, 'kommer tilbage';
  assert (select count(*) from public.transactions) = 1, 'ser historikken igen';
  perform public.household_leave();
  -- …og kan nu oprette sin egen husstand
  insert into ctx values ('hid_sara', public.household_create('Saras hjem')::text);
  assert public.current_household_id() = (select v from ctx where k = 'hid_sara')::uuid, 'ny husstand efter at have forladt den gamle';
end $$;

-- Den eneste voksne kan ikke bare gå
do $$
declare ok boolean;
begin
  begin
    perform public.household_leave();
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'sidste voksne skal slette i stedet';
end $$;

-- ---------------------------------------------------------------- fjern medlem
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$
declare ok boolean;
begin
  begin
    perform public.household_remove_member('00000000-0000-0000-0000-0000000000a1');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kun ejere kan fjerne medlemmer';
end $$;
-- Ejeren går – den anden voksne bliver automatisk ejer
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform public.household_leave();
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  assert (select role from public.household_members where user_id = auth.uid() and left_at is null) = 'owner', 'ny ejer';
  assert (select role from public.household_members where user_id = '00000000-0000-0000-0000-0000000000a1') = 'adult', 'den gamle ejer er ikke længere ejer';
  insert into ctx select 'code6', code from public.invite_create();
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
do $$ begin
  assert public.invite_accept((select v from ctx where k = 'code6')) is not null, 'a6 med';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  perform public.household_remove_member('00000000-0000-0000-0000-0000000000a6');
  assert (select left_at is not null from public.household_members where user_id = '00000000-0000-0000-0000-0000000000a6'), 'fjernet';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
do $$ begin
  assert public.current_household_id() is null, 'den fjernede har ingen adgang';
end $$;

-- ---------------------------------------------------------------- slet konto
reset role;
reset request.jwt.claim.sub;
-- Et barn i Saras husstand og data med "betalt af"
insert into public.household_members (household_id, user_id, role) values ((select v from ctx where k = 'hid_sara')::uuid, '00000000-0000-0000-0000-0000000000c1', 'child');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-0000000000a2', (select v from ctx where k = 'hid_sara')::uuid, 'Mad', '00000000-0000-0000-0000-0000000000a2');
insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id, created_by)
values ((select v from ctx where k = 'hid_sara')::uuid, 'c0000000-0000-0000-0000-0000000000a2', 100, '2026-10-01', 'Kaffe', 'member', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');
insert into public.fixed_items (household_id, kind, name, owner_kind, owner_user_id, start_month, created_by)
values ((select v from ctx where k = 'hid_sara')::uuid, 'income', 'Løn', 'member', '00000000-0000-0000-0000-0000000000a2', '2026-01-01', '00000000-0000-0000-0000-0000000000a2');
do $$
declare r jsonb;
begin
  -- Sara er sidste voksne: hele husstanden slettes, barnets login returneres
  r := public.account_delete_prepare('00000000-0000-0000-0000-0000000000a2');
  assert r ->> 'household_deleted' = (select v from ctx where k = 'hid_sara'), 'husstanden slettes';
  assert r -> 'child_ids' = '["00000000-0000-0000-0000-0000000000c1"]'::jsonb, 'barnets login skal slettes';
  assert not exists (select 1 from public.households where id = (select v from ctx where k = 'hid_sara')::uuid), 'husstanden er væk';
  assert not exists (select 1 from public.transactions where description = 'Kaffe'), 'alle data er væk';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'Tidligere medlem', 'profilen anonymiseres';
  -- Den gamle husstand bevarer historikken med det anonyme navn
  assert exists (select 1 from public.transactions where description = 'Netto'), 'anden husstands historik bevares';

  -- Husstand B har kun én voksen
  r := public.account_delete_prepare('00000000-0000-0000-0000-0000000000b1');
  assert r ->> 'household_deleted' = '22222222-2222-2222-2222-222222222222', 'B slettes';

  -- Bruger uden husstand: kun anonymisering
  r := public.account_delete_prepare('00000000-0000-0000-0000-0000000000a4');
  assert r ->> 'household_deleted' is null, 'intet at slette';
end $$;
-- Ikke sidste voksne: forlader blot og anonymiseres
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
insert into ctx select 'code7', code from public.invite_create();
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  assert public.invite_accept((select v from ctx where k = 'code7')) is not null, 'a5 med';
end $$;
reset role;
reset request.jwt.claim.sub;
do $$
declare r jsonb;
begin
  r := public.account_delete_prepare('00000000-0000-0000-0000-0000000000a3');
  assert r ->> 'household_deleted' is null, 'husstanden bevares';
  assert exists (select 1 from public.households where id = (select v from ctx where k = 'hid')::uuid), 'stadig der';
  assert (select role from public.household_members where user_id = '00000000-0000-0000-0000-0000000000a5' and left_at is null) = 'owner', 'a5 overtager';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a3') = 'Tidligere medlem', 'anonymiseret';
end $$;
rollback;
