-- =============================================================================
-- Fase 2: Budgetkategorier, standardbudgetter med historik, månedsbudgetter
--         og transaktioner
-- =============================================================================
-- Principper:
--  * Beløb i øre (bigint).
--  * Sammensatte fremmednøgler (household_id, x_id) forhindrer krydshenvisning
--    mellem husstande – også hvis klienten sender forkerte data.
--  * Historik må aldrig gå i stykker: kategorier arkiveres (archived_at) og kan
--    ikke slettes fra appen; transaktioner refererer med ON DELETE RESTRICT.
--  * Standardbudget har en "gælder fra"-måned. Ændringer gælder kun fremad,
--    så tidligere måneder aldrig skifter beløb.
--  * "Forbrugt" gemmes ikke – det beregnes af budget_month_summary().
-- =============================================================================

-- Indeværende måned i dansk tid (første dag)
create or replace function private.current_month()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Europe/Copenhagen')::date;
$$;
grant execute on function private.current_month() to authenticated;

-- -----------------------------------------------------------------------------
-- budget_categories
-- -----------------------------------------------------------------------------
create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  icon text not null default 'sparkles' check (icon ~ '^[a-z-]{1,24}$'),
  color text not null default '#6d5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

-- Navne skal være unikke blandt aktive kategorier (arkiverede må genbruges)
create unique index budget_categories_active_name_uq
  on public.budget_categories (household_id, lower(trim(name)))
  where archived_at is null;

create trigger budget_categories_updated_at
  before update on public.budget_categories
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- budget_category_defaults – standardbudget med "gælder fra"
-- -----------------------------------------------------------------------------
create table public.budget_category_defaults (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  category_id uuid not null,
  valid_from date not null check (extract(day from valid_from) = 1),
  amount_ore bigint not null check (amount_ore between 0 and 100000000000),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, valid_from),
  foreign key (household_id, category_id)
    references public.budget_categories (household_id, id) on delete cascade
);

create index budget_category_defaults_lookup_idx
  on public.budget_category_defaults (category_id, valid_from desc);

create trigger budget_category_defaults_updated_at
  before update on public.budget_category_defaults
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- monthly_budgets – overstyring for én bestemt måned
-- -----------------------------------------------------------------------------
create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount_ore bigint not null check (amount_ore between 0 and 100000000000),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, month),
  foreign key (household_id, category_id)
    references public.budget_categories (household_id, id) on delete cascade
);

create trigger monthly_budgets_updated_at
  before update on public.monthly_budgets
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null,
  amount_ore bigint not null check (amount_ore between 1 and 100000000000),
  occurred_on date not null,
  description text not null check (length(trim(description)) between 1 and 80),
  note text check (note is null or length(note) <= 1000),
  -- "Betalt af": et husstandsmedlem eller fælles
  paid_by_kind text not null default 'shared' check (paid_by_kind in ('member', 'shared')),
  paid_by_user_id uuid,
  source text not null default 'manual' check (source in ('manual', 'receipt', 'upcoming')),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_paid_by_consistent
    check ((paid_by_kind = 'member') = (paid_by_user_id is not null)),
  foreign key (household_id, category_id)
    references public.budget_categories (household_id, id) on delete restrict,
  foreign key (household_id, paid_by_user_id)
    references public.household_members (household_id, user_id) on delete restrict,
  unique (household_id, id)
);

create index transactions_household_date_idx on public.transactions (household_id, occurred_on desc, created_at desc);
create index transactions_category_date_idx on public.transactions (category_id, occurred_on);

create trigger transactions_updated_at
  before update on public.transactions
  for each row execute function private.set_updated_at();

-- Nye transaktioner (eller flytning til anden kategori) må ikke bruge en arkiveret kategori.
-- Eksisterende transaktioner i en arkiveret kategori kan stadig redigeres.
create or replace function private.transactions_check_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    if exists (
      select 1 from public.budget_categories c
      where c.id = new.category_id and c.archived_at is not null
    ) then
      raise exception 'Kategorien er arkiveret' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_check_category
  before insert or update of category_id on public.transactions
  for each row execute function private.transactions_check_category();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.budget_categories enable row level security;
alter table public.budget_category_defaults enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.transactions enable row level security;

revoke all on public.budget_categories, public.budget_category_defaults,
  public.monthly_budgets, public.transactions from anon;

-- budget_categories: læs, opret, redigér. Aldrig slet (arkivér i stedet).
create policy "Se husstandens kategorier" on public.budget_categories
  for select to authenticated using (private.is_household_member(household_id));
create policy "Opret kategori i egen husstand" on public.budget_categories
  for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Redigér husstandens kategorier" on public.budget_categories
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

revoke insert, update, delete, truncate on public.budget_categories from authenticated;
grant insert (household_id, name, icon, color, sort_order) on public.budget_categories to authenticated;
grant update (name, icon, color, sort_order, archived_at) on public.budget_categories to authenticated;

-- budget_category_defaults: historik er låst. Kun indeværende og fremtidige
-- måneder kan oprettes, ændres eller fjernes.
create policy "Se standardbudgetter" on public.budget_category_defaults
  for select to authenticated using (private.is_household_member(household_id));
create policy "Opret standardbudget fremadrettet" on public.budget_category_defaults
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and created_by = (select auth.uid())
    and valid_from >= (select private.current_month())
  );
create policy "Ret fremtidigt standardbudget" on public.budget_category_defaults
  for update to authenticated
  using (private.is_household_member(household_id) and valid_from >= (select private.current_month()))
  with check (private.is_household_member(household_id) and valid_from >= (select private.current_month()));
create policy "Fjern fremtidigt standardbudget" on public.budget_category_defaults
  for delete to authenticated
  using (private.is_household_member(household_id) and valid_from >= (select private.current_month()));

revoke insert, update, truncate on public.budget_category_defaults from authenticated;
grant insert (household_id, category_id, valid_from, amount_ore) on public.budget_category_defaults to authenticated;
grant update (amount_ore) on public.budget_category_defaults to authenticated;

-- monthly_budgets: eksplicit overstyring for en bestemt måned (også tidligere måneder).
create policy "Se månedsbudgetter" on public.monthly_budgets
  for select to authenticated using (private.is_household_member(household_id));
create policy "Opret månedsbudget" on public.monthly_budgets
  for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret månedsbudget" on public.monthly_budgets
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy "Fjern månedsbudget" on public.monthly_budgets
  for delete to authenticated using (private.is_household_member(household_id));

revoke insert, update, truncate on public.monthly_budgets from authenticated;
grant insert (household_id, category_id, month, amount_ore) on public.monthly_budgets to authenticated;
grant update (amount_ore) on public.monthly_budgets to authenticated;

-- transactions: begge kan oprette, redigere og slette husstandens transaktioner.
create policy "Se husstandens transaktioner" on public.transactions
  for select to authenticated using (private.is_household_member(household_id));
create policy "Opret transaktion" on public.transactions
  for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Redigér transaktion" on public.transactions
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy "Slet transaktion" on public.transactions
  for delete to authenticated using (private.is_household_member(household_id));

revoke insert, update, truncate on public.transactions from authenticated;
grant insert (household_id, category_id, amount_ore, occurred_on, description, note, paid_by_kind, paid_by_user_id, source)
  on public.transactions to authenticated;
grant update (category_id, amount_ore, occurred_on, description, note, paid_by_kind, paid_by_user_id)
  on public.transactions to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: opret kategori + standardbudget i én transaktion
-- -----------------------------------------------------------------------------
create or replace function public.create_budget_category(
  p_name text,
  p_icon text,
  p_color text,
  p_default_amount_ore bigint default null,
  p_valid_from date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  cid uuid;
  next_sort integer;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(max(sort_order), -1) + 1 into next_sort
  from public.budget_categories where household_id = hid;

  insert into public.budget_categories (household_id, name, icon, color, sort_order)
  values (hid, trim(p_name), p_icon, p_color, next_sort)
  returning id into cid;

  if p_default_amount_ore is not null then
    insert into public.budget_category_defaults (household_id, category_id, valid_from, amount_ore)
    values (hid, cid, coalesce(date_trunc('month', p_valid_from)::date, private.current_month()), p_default_amount_ore);
  end if;

  return cid;
end;
$$;

revoke all on function public.create_budget_category(text, text, text, bigint, date) from public, anon;
grant execute on function public.create_budget_category(text, text, text, bigint, date) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: budgetoversigt for en måned
-- -----------------------------------------------------------------------------
-- Effektivt budget = månedens overstyring, ellers det standardbudget der var
-- gældende i måneden (seneste valid_from <= måned), ellers 0.
-- SECURITY INVOKER: RLS gælder, så man kun ser egen husstand.
create or replace function public.budget_month_summary(p_month date)
returns table (
  category_id uuid,
  name text,
  icon text,
  color text,
  sort_order integer,
  archived boolean,
  budget_ore bigint,
  budget_source text,
  default_ore bigint,
  spent_ore bigint,
  transaction_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select date_trunc('month', p_month)::date as start,
           (date_trunc('month', p_month) + interval '1 month')::date as next
  )
  select
    c.id,
    c.name,
    c.icon,
    c.color,
    c.sort_order,
    c.archived_at is not null,
    case
      when c.archived_at is not null and c.archived_at < m.start then 0
      else coalesce(o.amount_ore, d.amount_ore, 0)
    end::bigint,
    case
      when c.archived_at is not null and c.archived_at < m.start then 'none'
      when o.amount_ore is not null then 'override'
      when d.amount_ore is not null then 'default'
      else 'none'
    end,
    coalesce(d.amount_ore, 0)::bigint,
    coalesce(t.spent, 0)::bigint,
    coalesce(t.cnt, 0)::integer
  from public.budget_categories c
  cross join m
  left join public.monthly_budgets o
    on o.category_id = c.id and o.month = m.start
  left join lateral (
    select bd.amount_ore
    from public.budget_category_defaults bd
    where bd.category_id = c.id and bd.valid_from <= m.start
    order by bd.valid_from desc
    limit 1
  ) d on true
  left join lateral (
    select sum(tr.amount_ore) as spent, count(*) as cnt
    from public.transactions tr
    where tr.category_id = c.id and tr.occurred_on >= m.start and tr.occurred_on < m.next
  ) t on true
  where c.household_id = public.current_household_id()
    -- Arkiverede kategorier vises kun i måneder hvor de var aktive eller har forbrug
    and (c.archived_at is null or c.archived_at >= m.start or coalesce(t.cnt, 0) > 0)
    -- Kategorier oprettet efter måneden vises kun hvis de har budget eller forbrug
    and (c.created_at < m.next or o.amount_ore is not null or d.amount_ore is not null or coalesce(t.cnt, 0) > 0)
  order by (c.archived_at is not null), c.sort_order, c.name;
$$;

revoke all on function public.budget_month_summary(date) from public, anon;
grant execute on function public.budget_month_summary(date) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: sæt standardbudget fra en given måned (opretter eller opdaterer)
-- -----------------------------------------------------------------------------
create or replace function public.set_category_default(p_category_id uuid, p_valid_from date, p_amount_ore bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid;
  vf date := date_trunc('month', p_valid_from)::date;
begin
  select household_id into hid from public.budget_categories where id = p_category_id;
  if hid is null then
    raise exception 'Kategorien findes ikke' using errcode = 'no_data_found';
  end if;
  if vf < private.current_month() then
    raise exception 'Standardbudgettet kan kun ændres fra indeværende måned og frem' using errcode = 'check_violation';
  end if;

  update public.budget_category_defaults
     set amount_ore = p_amount_ore
   where category_id = p_category_id and valid_from = vf;
  if not found then
    insert into public.budget_category_defaults (household_id, category_id, valid_from, amount_ore)
    values (hid, p_category_id, vf, p_amount_ore);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: sæt eller fjern månedens overstyring (NULL = brug standardbudget)
-- -----------------------------------------------------------------------------
create or replace function public.set_monthly_budget(p_category_id uuid, p_month date, p_amount_ore bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid;
  m date := date_trunc('month', p_month)::date;
begin
  select household_id into hid from public.budget_categories where id = p_category_id;
  if hid is null then
    raise exception 'Kategorien findes ikke' using errcode = 'no_data_found';
  end if;

  if p_amount_ore is null then
    delete from public.monthly_budgets where category_id = p_category_id and month = m;
    return;
  end if;

  update public.monthly_budgets set amount_ore = p_amount_ore
   where category_id = p_category_id and month = m;
  if not found then
    insert into public.monthly_budgets (household_id, category_id, month, amount_ore)
    values (hid, p_category_id, m, p_amount_ore);
  end if;
end;
$$;

revoke all on function public.set_category_default(uuid, date, bigint) from public, anon;
revoke all on function public.set_monthly_budget(uuid, date, bigint) from public, anon;
grant execute on function public.set_category_default(uuid, date, bigint) to authenticated;
grant execute on function public.set_monthly_budget(uuid, date, bigint) to authenticated;
