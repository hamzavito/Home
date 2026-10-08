-- =============================================================================
-- Tilmelding: opret husstand, invitér voksne, forlad husstand, slet konto
-- =============================================================================
-- * Nye brugere (Apple, Google, e-mail) opretter selv en husstand eller tager
--   imod en invitation. Én aktiv husstand pr. bruger.
-- * Invitationer: engangskode (8 tegn), gyldig 7 dage, kun hash gemmes,
--   forsøgsbegrænsning pr. bruger. Alle voksne må invitere.
-- * At forlade en husstand bevarer historikken (udgifter m.m. peger stadig på
--   medlemmet), men medlemmet mister al adgang (left_at + disabled_at).
-- * Sletning af konto sker via Edge Function "account-delete" (service role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Skema
-- -----------------------------------------------------------------------------
alter table public.households add column created_by uuid;

alter table public.household_members add column left_at timestamptz;
alter table public.household_members
  add constraint household_members_left_disabled check (left_at is null or disabled_at is not null);

-- Én AKTIV husstand pr. bruger (tidligere medlemskaber bevares til historikken)
alter table public.household_members drop constraint household_members_user_id_key;
create unique index household_members_one_active on public.household_members (user_id) where left_at is null;

alter table private.login_throttle drop constraint login_throttle_scope_check;
alter table private.login_throttle add constraint login_throttle_scope_check check (scope in ('ip', 'combo', 'invite'));

create table private.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz
);
create index household_invites_household_idx on private.household_invites (household_id) where used_at is null and revoked_at is null;
revoke all on private.household_invites from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Hjælpere
-- -----------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid()) and m.left_at is null;
$$;

create or replace function private.shares_household_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Også tidligere medlemmer, så deres navn stadig vises i historikken
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and mine.left_at is null
      and mine.disabled_at is null
      and theirs.user_id = other_user
  );
$$;

-- Navn fra Apple/Google/e-mail – altid 1-40 tegn, så oprettelsen aldrig fejler
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Bruger'
    ), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.set_display_name(p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name is null or length(trim(p_name)) = 0 then
    return;
  end if;
  if length(trim(p_name)) > 40 then
    raise exception 'Navnet må højst være 40 tegn' using errcode = 'check_violation';
  end if;
  update public.profiles set display_name = trim(p_name) where id = p_user;
end;
$$;

create or replace function private.active_membership(p_user uuid)
returns public.household_members
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.household_members where user_id = p_user and left_at is null;
$$;

create or replace function private.normalize_invite_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')) $$;

create or replace function private.invite_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(private.normalize_invite_code(p_code), 'sha256'), 'hex') $$;

-- Gyldig (ubrugt, ikke tilbagekaldt, ikke udløbet) invitation ud fra koden
create or replace function private.find_invite(p_code text)
returns private.household_invites
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.household_invites
  where code_hash = private.invite_hash(p_code)
    and used_at is null and revoked_at is null and expires_at > now();
$$;

-- -----------------------------------------------------------------------------
-- Opret husstand
-- -----------------------------------------------------------------------------
create or replace function public.household_create(p_name text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'Ikke logget ind' using errcode = 'insufficient_privilege';
  end if;
  -- Samtidige tryk: én ad gangen pr. bruger
  perform pg_advisory_xact_lock(hashtext('household_create:' || uid::text));
  if (private.active_membership(uid)).user_id is not null then
    raise exception 'Du er allerede med i en husstand' using errcode = 'unique_violation';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Skriv et navn på husstanden' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.households where created_by = uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'For mange nye husstande i dag. Prøv igen i morgen.' using errcode = 'check_violation';
  end if;
  perform private.set_display_name(uid, p_display_name);
  insert into public.households (name, created_by) values (trim(p_name), uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  return hid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invitationer
-- -----------------------------------------------------------------------------
create or replace function private.new_invite_code()
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
    bytes := extensions.gen_random_bytes(8);
    c := '';
    for i in 0..7 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from private.household_invites where code_hash = private.invite_hash(c));
  end loop;
  return c;
end;
$$;

-- Ny invitation. Koden returneres kun her (kun hash gemmes).
create or replace function public.invite_create()
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  c text;
  inv private.household_invites;
begin
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Kun voksne i husstanden kan invitere' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from private.household_invites i
      where i.household_id = hid and i.used_at is null and i.revoked_at is null and i.expires_at > now()) >= 10 then
    raise exception 'For mange aktive invitationer. Tilbagekald en af dem først.' using errcode = 'check_violation';
  end if;
  c := private.new_invite_code();
  insert into private.household_invites (household_id, code_hash, created_by, expires_at)
  values (hid, private.invite_hash(c), auth.uid(), now() + interval '7 days')
  returning * into inv;
  return query select inv.id, c, inv.expires_at;
end;
$$;

create or replace function public.invite_list()
returns table (invite_id uuid, created_by uuid, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.created_by, i.created_at, i.expires_at
  from private.household_invites i
  where i.household_id = public.current_household_id()
    and private.is_household_member(i.household_id)
    and i.used_at is null and i.revoked_at is null and i.expires_at > now()
  order by i.created_at desc;
$$;

create or replace function public.invite_revoke(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.household_invites i set revoked_at = now()
  where i.id = p_invite_id and i.revoked_at is null and i.used_at is null
    and private.is_household_member(i.household_id);
  if not found then
    raise exception 'Invitationen findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Vis hvem invitationen er fra, før man siger ja. Ugyldig kode → ingen rækker
-- (ingen fejl, så det mislykkede forsøg tælles med i forsøgsbegrænsningen).
create or replace function public.invite_preview(p_code text)
returns table (household_name text, invited_by text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv private.household_invites;
begin
  if uid is null then
    raise exception 'Ikke logget ind' using errcode = 'insufficient_privilege';
  end if;
  if private.throttle_locked('invite', uid::text) then
    raise exception 'For mange forsøg. Vent lidt og prøv igen.' using errcode = 'P0001';
  end if;
  inv := private.find_invite(p_code);
  if inv.id is null then
    perform private.throttle_fail('invite', uid::text, 10, interval '1 hour', interval '15 minutes', true);
    return;
  end if;
  return query
    select h.name, coalesce(p.display_name, 'Et medlem'), inv.expires_at
    from public.households h
    left join public.profiles p on p.id = inv.created_by
    where h.id = inv.household_id;
end;
$$;

-- Tag imod en invitation. Returnerer husstandens id – eller null ved ugyldig kode.
create or replace function public.invite_accept(p_code text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv private.household_invites;
begin
  if uid is null then
    raise exception 'Ikke logget ind' using errcode = 'insufficient_privilege';
  end if;
  if private.throttle_locked('invite', uid::text) then
    raise exception 'For mange forsøg. Vent lidt og prøv igen.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('household_create:' || uid::text));
  if (private.active_membership(uid)).user_id is not null then
    raise exception 'Du er allerede med i en husstand' using errcode = 'unique_violation';
  end if;

  select * into inv from private.household_invites
  where code_hash = private.invite_hash(p_code)
    and used_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then
    perform private.throttle_fail('invite', uid::text, 10, interval '1 hour', interval '15 minutes', true);
    return null;
  end if;

  perform private.set_display_name(uid, p_display_name);
  -- Tidligere medlem af samme husstand: genaktivér (historikken peger allerede på rækken)
  update public.household_members
     set left_at = null, disabled_at = null, role = 'adult'
   where household_id = inv.household_id and user_id = uid;
  if not found then
    insert into public.household_members (household_id, user_id, role) values (inv.household_id, uid, 'adult');
  end if;
  update private.household_invites set used_at = now(), used_by = uid where id = inv.id;
  return inv.household_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Forlad husstand / fjern medlem
-- -----------------------------------------------------------------------------
create or replace function private.other_active_adults(p_household uuid, p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.household_members
  where household_id = p_household and user_id <> p_user
    and role in ('owner', 'adult') and left_at is null and disabled_at is null;
$$;

-- Medlemmet mister al adgang; historikken bevares
create or replace function private.member_depart(p_household uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Husstanden skal altid have en ejer: den ældste anden voksne overtager
  if not exists (
    select 1 from public.household_members
    where household_id = p_household and user_id <> p_user and role = 'owner' and left_at is null and disabled_at is null
  ) then
    update public.household_members set role = 'owner'
    where household_id = p_household and (household_id, user_id) = (
      select m.household_id, m.user_id from public.household_members m
      where m.household_id = p_household and m.user_id <> p_user and m.role = 'adult' and m.left_at is null and m.disabled_at is null
      order by m.created_at, m.user_id
      limit 1
    );
  end if;
  update public.household_members
     set left_at = now(), disabled_at = now(), role = case when role = 'owner' then 'adult' else role end
   where household_id = p_household and user_id = p_user;
  update private.household_invites set revoked_at = now()
   where household_id = p_household and created_by = p_user and used_at is null and revoked_at is null;
  -- Ingen notifikationer om husstanden til en, der er gået
  delete from public.push_subscriptions where user_id = p_user;
end;
$$;

create or replace function public.household_leave()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.household_members;
begin
  m := private.active_membership(uid);
  if m.user_id is null or m.disabled_at is not null then
    raise exception 'Du er ikke med i en husstand' using errcode = 'no_data_found';
  end if;
  if m.role = 'child' then
    raise exception 'Børn kan ikke selv forlade husstanden' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('household_members:' || m.household_id::text));
  if private.other_active_adults(m.household_id, uid) = 0 then
    raise exception 'Du er den eneste voksne. Slet kontoen for at slette husstanden.' using errcode = 'check_violation';
  end if;
  perform private.member_depart(m.household_id, uid);
end;
$$;

create or replace function public.household_remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  m public.household_members;
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan fjerne medlemmer' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then
    raise exception 'Brug "Forlad husstanden" for at fjerne dig selv' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('household_members:' || hid::text));
  select * into m from public.household_members where household_id = hid and user_id = p_user and left_at is null;
  if not found then
    raise exception 'Medlemmet findes ikke' using errcode = 'no_data_found';
  end if;
  if m.role = 'child' then
    raise exception 'Børn slås fra under barnets login' using errcode = 'check_violation';
  end if;
  perform private.member_depart(hid, p_user);
end;
$$;

-- -----------------------------------------------------------------------------
-- Slet konto (kun service_role – kaldes af Edge Function "account-delete")
-- -----------------------------------------------------------------------------
-- Er brugeren den sidste voksne, slettes hele husstanden (alle data). Ellers
-- forlader brugeren husstanden, og profilen anonymiseres. Returnerer det,
-- Edge Functionen skal rydde op i: husstandens billeder og børnenes logins.
create or replace function public.account_delete_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.household_members;
  kids uuid[];
begin
  m := private.active_membership(p_user);
  if m.user_id is not null then
    if m.role = 'child' then
      raise exception 'Et barns konto slettes af en voksen' using errcode = 'insufficient_privilege';
    end if;
    perform pg_advisory_xact_lock(hashtext('household_members:' || m.household_id::text));
    if private.other_active_adults(m.household_id, p_user) = 0 then
      select coalesce(array_agg(user_id), '{}') into kids
      from public.household_members where household_id = m.household_id and role = 'child';
      delete from public.households where id = m.household_id;
      update public.profiles set display_name = 'Tidligere medlem', color = null where id = p_user;
      return jsonb_build_object('household_deleted', m.household_id, 'child_ids', to_jsonb(kids));
    end if;
    perform private.member_depart(m.household_id, p_user);
  end if;
  update public.profiles set display_name = 'Tidligere medlem', color = null where id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  return jsonb_build_object('household_deleted', null, 'child_ids', '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.set_display_name(uuid, text) from public, anon, authenticated;
revoke all on function private.active_membership(uuid) from public, anon, authenticated;
revoke all on function private.find_invite(text) from public, anon, authenticated;
revoke all on function private.new_invite_code() from public, anon, authenticated;
revoke all on function private.other_active_adults(uuid, uuid) from public, anon, authenticated;
revoke all on function private.member_depart(uuid, uuid) from public, anon, authenticated;

revoke all on function public.household_create(text, text) from public, anon;
revoke all on function public.invite_create() from public, anon;
revoke all on function public.invite_list() from public, anon;
revoke all on function public.invite_revoke(uuid) from public, anon;
revoke all on function public.invite_preview(text) from public, anon;
revoke all on function public.invite_accept(text, text) from public, anon;
revoke all on function public.household_leave() from public, anon;
revoke all on function public.household_remove_member(uuid) from public, anon;
grant execute on function public.household_create(text, text) to authenticated;
grant execute on function public.invite_create() to authenticated;
grant execute on function public.invite_list() to authenticated;
grant execute on function public.invite_revoke(uuid) to authenticated;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.invite_accept(text, text) to authenticated;
grant execute on function public.household_leave() to authenticated;
grant execute on function public.household_remove_member(uuid) to authenticated;

revoke all on function public.account_delete_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_delete_prepare(uuid) to service_role;
