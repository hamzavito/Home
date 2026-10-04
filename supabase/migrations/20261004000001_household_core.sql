-- =============================================================================
-- Fase 1: Husstand, profiler og medlemmer + RLS-fundament
-- =============================================================================
-- Princip: Alle domænedata hører til en husstand (household_id). Adgang styres
-- udelukkende af Row Level Security ud fra household_members.
-- Hjælpefunktioner ligger i skemaet "private", som ikke eksponeres via API'et.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Fælles trigger: updated_at
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- households
-- -----------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_updated_at
  before update on public.households
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles (1:1 med auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Opret automatisk en profil når en bruger oprettes i Supabase Auth.
-- display_name tages fra user metadata, ellers fra delen før @ i e-mailen.
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
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Bruger'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- household_members
-- -----------------------------------------------------------------------------
-- Medlemmer slettes ikke, når der findes historik (transaktioner m.m. vil
-- referere (household_id, user_id) med RESTRICT fra fase 2). Profil-sletning
-- er derfor også blokeret, så længe der er historik.
create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  -- Én husstand pr. bruger. Forenkler appen; kan løsnes senere hvis behovet opstår.
  unique (user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

-- -----------------------------------------------------------------------------
-- Hjælpefunktioner til RLS
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER så de kan læse household_members uden at udløse RLS på
-- samme tabel (undgår rekursion). STABLE så Postgres kan cache resultatet
-- inden for en forespørgsel.

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
  );
$$;

create or replace function private.shares_household_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke all on function private.is_household_member(uuid) from public;
revoke all on function private.shares_household_with(uuid) from public;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.shares_household_with(uuid) to authenticated;

-- Den indloggede brugers husstand. Bruges af klienten og som default-værdi.
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid());
$$;

revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;

-- Anonyme brugere har ingen adgang overhovedet (RLS ville også blokere, men
-- vi fjerner rettighederne for en ekstra sikkerhedsmargin).
revoke all on public.households, public.profiles, public.household_members from anon;

-- households: medlemmer kan se og omdøbe deres husstand.
-- Oprettelse/sletning sker kun via SQL (service role), ikke fra appen.
create policy "Medlemmer kan se egen husstand"
  on public.households for select to authenticated
  using (private.is_household_member(id));

create policy "Medlemmer kan omdøbe egen husstand"
  on public.households for update to authenticated
  using (private.is_household_member(id))
  with check (private.is_household_member(id));

revoke insert, update, delete, truncate on public.households from authenticated;
grant update (name) on public.households to authenticated;

-- profiles: se egen profil og husstandsmedlemmers profiler; redigér kun egen.
create policy "Se egen og husstandens profiler"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.shares_household_with(id)
  );

create policy "Redigér egen profil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, delete, truncate on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, color) on public.profiles to authenticated;

-- household_members: kun læsning for medlemmer af samme husstand.
-- Ændringer i medlemskab sker kun via SQL (service role).
create policy "Se medlemmer af egen husstand"
  on public.household_members for select to authenticated
  using (private.is_household_member(household_id));

revoke insert, update, delete, truncate on public.household_members from authenticated;
