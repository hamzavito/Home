-- =============================================================================
-- Barnelogin: husstandskode + brugernavn + PIN
-- =============================================================================
-- Model: hvert barn er en almindelig Supabase Auth-bruger med en skjult
-- systemidentitet (child-<uuid>@internal.home) og en tilfældig adgangskode som
-- ingen kender. Barnet logger ind via Edge Function "child-login", der kalder
-- child_login_verify() (kun service_role). Ved korrekt PIN udsteder funktionen en
-- normal session, så auth.uid() og alle RLS-regler virker uændret.
--
-- * PIN gemmes kun som bcrypt-hash (pgcrypto) i private.child_credentials, som
--   hverken anon, authenticated eller PostgREST kan nå.
-- * Husstandskoden findes kun i private.household_login_codes. Den er ikke en
--   hemmelighed – den udpeger blot husstanden ved barnelogin.
-- * Brute force: lås pr. (husstandskode, brugernavn) efter 5 forkerte forsøg –
--   10 min, derefter dobbelt så længe hver gang (højst 24 timer) – og pr. IP efter
--   30 forkerte forsøg på 15 min. Låsen gælder også ukendte kombinationer, så
--   svaret aldrig afslører, om husstand eller brugernavn findes.
-- * Deaktivering sætter household_members.disabled_at. Alle rolle-hjælpere
--   ignorerer deaktiverede medlemmer, så adgangen lukkes med det samme. Intet slettes.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Medlemmer: brugernavn (kun børn, unikt pr. husstand) og deaktivering
-- -----------------------------------------------------------------------------
alter table public.household_members
  add column child_username text,
  add column disabled_at timestamptz;
alter table public.household_members
  add constraint household_members_child_username_format
    check (child_username is null or child_username ~ '^[a-z0-9æøå][a-z0-9æøå._-]{1,19}$'),
  add constraint household_members_child_username_role
    check (child_username is null or role = 'child'),
  add constraint household_members_child_username_unique unique (household_id, child_username);

-- Rolle-hjælpere: deaktiverede medlemmer har ingen adgang
create or replace function private.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.role <> 'child'
      and m.disabled_at is null
  );
$$;

create or replace function private.is_household_any(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.disabled_at is null
  );
$$;

create or replace function private.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner' and m.disabled_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Husstandskode: 6 tegn uden forvekslelige tegn (0/O, 1/I/L)
-- -----------------------------------------------------------------------------
create table private.household_login_codes (
  household_id uuid primary key references public.households (id) on delete cascade,
  code text not null unique check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  created_at timestamptz not null default now()
);

create or replace function private.new_login_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  c text;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from private.household_login_codes where code = c);
  end loop;
  return c;
end;
$$;

create or replace function private.household_login_code_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.household_login_codes (household_id, code) values (new.id, private.new_login_code());
  return new;
end;
$$;
create trigger households_login_code after insert on public.households
  for each row execute function private.household_login_code_trigger();

-- Eksisterende husstande får en kode (én ad gangen, så unikhedstjekket ser de forrige)
do $$
declare r record;
begin
  for r in select id from public.households h where not exists (select 1 from private.household_login_codes l where l.household_id = h.id) loop
    insert into private.household_login_codes (household_id, code) values (r.id, private.new_login_code());
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- PIN (kun hash) og forsøgsbegrænsning
-- -----------------------------------------------------------------------------
create table private.child_credentials (
  user_id uuid primary key,
  household_id uuid not null,
  pin_hash text not null check (pin_hash like '$2_$%'),
  pin_length smallint not null check (pin_length in (4, 6)),
  pin_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);

create table private.login_throttle (
  scope text not null check (scope in ('ip', 'combo')),
  key text not null check (length(key) <= 200),
  failures int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  lock_level int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

revoke all on private.household_login_codes, private.child_credentials, private.login_throttle from public, anon, authenticated;

-- 4 eller 6 cifre, og ikke lette at gætte (fx 000000, 123456, 654321)
create or replace function private.valid_pin(p_pin text, p_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_len in (4, 6)
    and coalesce(p_pin, '') ~ ('^[0-9]{' || p_len || '}$')
    and p_pin !~ '^(.)\1+$'
    and position(p_pin in '01234567890123') = 0
    and position(p_pin in '98765432109876') = 0;
$$;

create or replace function private.normalize_username(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(trim(coalesce(p, ''))) $$;

create or replace function private.normalize_login_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')) $$;

create or replace function private.throttle_locked(p_scope text, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.login_throttle where scope = p_scope and key = p_key and locked_until > now());
$$;

-- Registrér et forkert forsøg. Ved p_max fejl inden for p_window låses nøglen.
-- p_escalate: låsetiden fordobles for hver lås (10, 20, 40 … min, højst 24 t).
create or replace function private.throttle_fail(p_scope text, p_key text, p_max int, p_window interval, p_base interval, p_escalate boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.login_throttle;
begin
  insert into private.login_throttle (scope, key) values (p_scope, p_key) on conflict do nothing;
  select * into t from private.login_throttle where scope = p_scope and key = p_key for update;
  -- Efter et døgn uden fejl starter optrapningen forfra
  if t.updated_at < now() - interval '24 hours' then
    t.lock_level := 0;
  end if;
  if t.window_start < now() - p_window or t.failures = 0 then
    t.failures := 0;
    t.window_start := now();
  end if;
  t.failures := t.failures + 1;
  if t.failures >= p_max then
    t.locked_until := now() + least(
      case when p_escalate then p_base * power(2, least(t.lock_level, 10)) else p_base end,
      interval '24 hours');
    t.lock_level := t.lock_level + 1;
    t.failures := 0;
  end if;
  update private.login_throttle
  set failures = t.failures, window_start = t.window_start, locked_until = t.locked_until,
      lock_level = t.lock_level, updated_at = now()
  where scope = p_scope and key = p_key;
end;
$$;

-- -----------------------------------------------------------------------------
-- Login (kun service_role – kaldes af Edge Function "child-login")
-- -----------------------------------------------------------------------------
create or replace function public.child_login_verify(p_code text, p_username text, p_pin text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := left(private.normalize_login_code(p_code), 20);
  v_user text := left(private.normalize_username(p_username), 40);
  v_combo text := v_code || ':' || v_user;
  v_ip text := left(coalesce(nullif(trim(p_ip), ''), 'ukendt'), 100);
  v_uid uuid;
  v_hash text;
  v_email text;
  v_ok boolean := false;
begin
  if private.throttle_locked('ip', v_ip) or private.throttle_locked('combo', v_combo) then
    perform private.throttle_fail('ip', v_ip, 30, interval '15 minutes', interval '15 minutes', false);
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  select c.user_id, c.pin_hash, u.email into v_uid, v_hash, v_email
  from private.household_login_codes l
  join public.household_members m
    on m.household_id = l.household_id and m.child_username = v_user and m.role = 'child' and m.disabled_at is null
  join private.child_credentials c on c.user_id = m.user_id and c.household_id = m.household_id
  join auth.users u on u.id = m.user_id
  where l.code = v_code;

  if v_hash is not null then
    v_ok := extensions.crypt(coalesce(p_pin, ''), v_hash) = v_hash;
  else
    -- Samme arbejde som et rigtigt tjek, så svartiden ikke afslører noget
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
  end if;

  if v_ok then
    update private.login_throttle set failures = 0, lock_level = 0, locked_until = null, updated_at = now()
    where scope = 'combo' and key = v_combo;
    return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_email);
  end if;

  perform private.throttle_fail('combo', v_combo, 5, interval '1 hour', interval '10 minutes', true);
  perform private.throttle_fail('ip', v_ip, 30, interval '15 minutes', interval '15 minutes', false);
  return jsonb_build_object('ok', false, 'reason', 'invalid');
end;
$$;

-- -----------------------------------------------------------------------------
-- Oprettelse og deaktivering (kun service_role – kaldes af Edge Function "child-admin",
-- som selv har bekræftet, hvem den indloggede ejer er)
-- -----------------------------------------------------------------------------
create or replace function private.owner_household(p_owner uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.household_members
  where user_id = p_owner and role = 'owner' and disabled_at is null;
$$;

-- Forhåndstjek før auth-brugeren oprettes: 'ok' | 'not_owner' | 'invalid_username' | 'username_taken'
create or replace function public.child_account_check(p_owner uuid, p_username text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
  v_user text := private.normalize_username(p_username);
begin
  if hid is null then return 'not_owner'; end if;
  if v_user !~ '^[a-z0-9æøå][a-z0-9æøå._-]{1,19}$' then return 'invalid_username'; end if;
  if exists (select 1 from public.household_members where household_id = hid and child_username = v_user) then
    return 'username_taken';
  end if;
  return 'ok';
end;
$$;

-- Atomisk: profil + medlemskab som barn + PIN-hash. Fejler alt eller intet.
create or replace function public.child_account_create(p_owner uuid, p_child uuid, p_name text, p_username text, p_pin text, p_pin_length int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
  v_user text := private.normalize_username(p_username);
  v_name text := trim(coalesce(p_name, ''));
begin
  if hid is null then
    raise exception 'Kun ejere kan oprette børn' using errcode = 'insufficient_privilege';
  end if;
  if length(v_name) not between 1 and 40 then
    raise exception 'Ugyldigt navn' using errcode = 'check_violation';
  end if;
  if not private.valid_pin(p_pin, p_pin_length) then
    raise exception 'Ugyldig PIN' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from auth.users where id = p_child) then
    raise exception 'Brugeren findes ikke' using errcode = 'no_data_found';
  end if;
  insert into public.profiles (id, display_name) values (p_child, v_name)
  on conflict (id) do update set display_name = excluded.display_name;
  insert into public.household_members (household_id, user_id, role, child_username)
  values (hid, p_child, 'child', v_user);
  insert into private.child_credentials (user_id, household_id, pin_hash, pin_length)
  values (p_child, hid, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), p_pin_length);
  return hid;
end;
$$;

create or replace function public.child_account_set_disabled(p_owner uuid, p_child uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
begin
  if hid is null then
    raise exception 'Kun ejere kan slå børns login fra' using errcode = 'insufficient_privilege';
  end if;
  update public.household_members
  set disabled_at = case when p_disabled then coalesce(disabled_at, now()) else null end
  where household_id = hid and user_id = p_child and role = 'child';
  if not found then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ejerens værktøjer (indloggede ejere)
-- -----------------------------------------------------------------------------
create or replace function public.household_login_code()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan se husstandskoden' using errcode = 'insufficient_privilege';
  end if;
  return (select code from private.household_login_codes where household_id = hid);
end;
$$;

create or replace function public.child_set_pin(p_child uuid, p_pin text, p_pin_length int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  v_user text;
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan ændre PIN' using errcode = 'insufficient_privilege';
  end if;
  if not private.valid_pin(p_pin, p_pin_length) then
    raise exception 'Ugyldig PIN' using errcode = 'check_violation';
  end if;
  update private.child_credentials
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), pin_length = p_pin_length, pin_changed_at = now()
  where user_id = p_child and household_id = hid;
  if not found then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  -- Ny PIN ophæver en eventuel lås
  select child_username into v_user from public.household_members where household_id = hid and user_id = p_child;
  update private.login_throttle set failures = 0, lock_level = 0, locked_until = null, updated_at = now()
  where scope = 'combo' and key = (select code from private.household_login_codes where household_id = hid) || ':' || v_user;
end;
$$;

create or replace function public.child_set_username(p_child uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  v_user text := private.normalize_username(p_username);
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan ændre brugernavne' using errcode = 'insufficient_privilege';
  end if;
  if v_user !~ '^[a-z0-9æøå][a-z0-9æøå._-]{1,19}$' then
    raise exception 'Ugyldigt brugernavn' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.household_members where household_id = hid and child_username = v_user and user_id <> p_child) then
    raise exception 'Brugernavnet er optaget' using errcode = 'unique_violation';
  end if;
  update public.household_members set child_username = v_user
  where household_id = hid and user_id = p_child and role = 'child'
    and exists (select 1 from private.child_credentials c where c.user_id = p_child);
  if not found then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Roller: et barns PIN-login kan ikke gøres til voksen/ejer
create or replace function public.set_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan ændre roller' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then
    raise exception 'Du kan ikke ændre din egen rolle' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('owner', 'adult', 'child') then
    raise exception 'Ugyldig rolle' using errcode = 'check_violation';
  end if;
  if p_role <> 'child' and exists (select 1 from private.child_credentials where user_id = p_user) then
    raise exception 'Et barns login kan ikke gøres til voksen' using errcode = 'check_violation';
  end if;
  update public.household_members set role = p_role where household_id = hid and user_id = p_user;
  if not found then
    raise exception 'Medlemmet findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.new_login_code() from public, anon, authenticated;
revoke all on function private.household_login_code_trigger() from public, anon, authenticated;
revoke all on function private.throttle_locked(text, text) from public, anon, authenticated;
revoke all on function private.throttle_fail(text, text, int, interval, interval, boolean) from public, anon, authenticated;
revoke all on function private.owner_household(uuid) from public, anon, authenticated;

revoke all on function public.child_login_verify(text, text, text, text) from public, anon, authenticated;
revoke all on function public.child_account_check(uuid, text) from public, anon, authenticated;
revoke all on function public.child_account_create(uuid, uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.child_account_set_disabled(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.child_login_verify(text, text, text, text) to service_role;
grant execute on function public.child_account_check(uuid, text) to service_role;
grant execute on function public.child_account_create(uuid, uuid, text, text, text, int) to service_role;
grant execute on function public.child_account_set_disabled(uuid, uuid, boolean) to service_role;

revoke all on function public.household_login_code() from public, anon;
revoke all on function public.child_set_pin(uuid, text, int) from public, anon;
revoke all on function public.child_set_username(uuid, text) from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.household_login_code() to authenticated;
grant execute on function public.child_set_pin(uuid, text, int) to authenticated;
grant execute on function public.child_set_username(uuid, text) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
