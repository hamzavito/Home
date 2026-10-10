-- =============================================================================
-- Børn uden login, lommepenge til/fra og sletning af et barn
-- =============================================================================
-- * Et lille barn kan oprettes uden login (ingen brugernavn/PIN). Barnet er med i
--   kalender, opgaver og overblik, men kan ikke logge ind. Login kan gives senere.
-- * Lommepenge kan slås fra pr. barn (fx et lille barn uden økonomi).
-- * Ejeren kan slette et barn: barnets lommepenge, mål og login slettes; opgaver
--   bliver uden ansvarlig, og aftaler kun for barnet slettes.
-- Login-identiteten oprettes/slettes af Edge Function "child-admin".
-- =============================================================================
alter table public.household_members
  add column no_login boolean not null default false,
  add column wallet_enabled boolean not null default true,
  add constraint household_members_no_login_child check (not no_login or (role = 'child' and child_username is null));

-- Barn uden login (kun Edge Functionen; auth-identiteten er oprettet og spærret i forvejen)
create or replace function public.child_profile_create(p_owner uuid, p_child uuid, p_name text, p_wallet boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
  v_name text := trim(coalesce(p_name, ''));
begin
  if hid is null then
    raise exception 'Kun ejere kan oprette børn' using errcode = 'insufficient_privilege';
  end if;
  if length(v_name) not between 1 and 40 then
    raise exception 'Ugyldigt navn' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from auth.users where id = p_child) then
    raise exception 'Brugeren findes ikke' using errcode = 'no_data_found';
  end if;
  insert into public.profiles (id, display_name) values (p_child, v_name)
  on conflict (id) do update set display_name = excluded.display_name;
  insert into public.household_members (household_id, user_id, role, no_login, wallet_enabled)
  values (hid, p_child, 'child', true, coalesce(p_wallet, false));
  return hid;
end;
$$;

-- Giv et barn uden login sit eget login (kun Edge Functionen)
create or replace function public.child_add_login(p_owner uuid, p_child uuid, p_username text, p_pin text, p_pin_length int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
  v_user text := private.normalize_username(p_username);
begin
  if hid is null then
    raise exception 'Kun ejere kan give børn login' using errcode = 'insufficient_privilege';
  end if;
  if not private.valid_pin(p_pin, p_pin_length) then
    raise exception 'Ugyldig PIN' using errcode = 'check_violation';
  end if;
  update public.household_members set no_login = false, child_username = v_user
  where household_id = hid and user_id = p_child and role = 'child' and no_login and left_at is null;
  if not found then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  insert into private.child_credentials (user_id, household_id, pin_hash, pin_length)
  values (p_child, hid, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), p_pin_length);
end;
$$;

-- Lommepenge til/fra for et barn (ejere)
create or replace function public.child_set_wallet(p_child uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan ændre lommepenge' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(p_enabled, false) and exists (
    select 1 from public.child_allowance_schedules s
    where s.household_id = hid and s.child_id = p_child and s.stopped_at is null
      and (s.end_on is null or s.end_on >= (now() at time zone 'Europe/Copenhagen')::date)) then
    raise exception 'Stop de faste lommepenge først' using errcode = 'check_violation';
  end if;
  update public.household_members set wallet_enabled = coalesce(p_enabled, false)
  where household_id = hid and user_id = p_child and role = 'child' and left_at is null;
  if not found then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Et barn uden login kan ikke gøres til voksen (der er ingen at logge ind som)
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
  if p_role <> 'child' and (exists (select 1 from private.child_credentials where user_id = p_user)
      or exists (select 1 from public.household_members where household_id = hid and user_id = p_user and no_login)) then
    raise exception 'Et barns login kan ikke gøres til voksen' using errcode = 'check_violation';
  end if;
  update public.household_members set role = p_role where household_id = hid and user_id = p_user;
  if not found then
    raise exception 'Medlemmet findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.child_profile_create(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.child_add_login(uuid, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.child_profile_create(uuid, uuid, text, boolean) to service_role;
grant execute on function public.child_add_login(uuid, uuid, text, text, int) to service_role;
revoke all on function public.child_set_wallet(uuid, boolean) from public, anon;
grant execute on function public.child_set_wallet(uuid, boolean) to authenticated;
