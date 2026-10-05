-- =============================================================================
-- Fast økonomi og fordeling af rådighedsbeløb
-- =============================================================================
-- Én økonomimodel i tre lag:
--   1. Fast økonomi (plan):     faste indtægter − faste udgifter = tilbage
--   2. Variable budgetter (plan): tilbage − faste budgetbeløb (fx Buffer)
--                                 = til fordeling → procentkategorier
--   3. Faktisk forbrug:           transaktioner (uændret)
--
-- Faste poster opretter ALDRIG transaktioner. Plan og faktisk forbrug er adskilt.
-- Historik: beløb og frekvens ligger i versioner med "gælder fra"-måned.
-- Tidligere måneder kan ikke ændres (samme princip som standardbudgetter).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Udgiftsgrupper (husstandens egne – fx Bolig, Transport, Abonnementer)
-- -----------------------------------------------------------------------------
create table public.fixed_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create unique index fixed_groups_active_name_uq
  on public.fixed_groups (household_id, lower(trim(name))) where archived_at is null;
create trigger fixed_groups_updated_at before update on public.fixed_groups
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Faste poster (identitet). Beløb ligger i fixed_item_versions.
-- -----------------------------------------------------------------------------
create table public.fixed_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (length(trim(name)) between 1 and 60),
  -- Kun udgifter har en gruppe
  group_id uuid,
  -- Kun indtægter har en ejer: et husstandsmedlem eller fælles
  owner_kind text check (owner_kind in ('member', 'shared')),
  owner_user_id uuid,
  payment_day smallint check (payment_day between 1 and 31),
  note text check (note is null or length(note) <= 500),
  sort_order integer not null default 0,
  -- Aktiv fra og med start_month til og med end_month (NULL = løbende)
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (end_month is null or extract(day from end_month) = 1),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  constraint fixed_items_period check (end_month is null or end_month >= start_month),
  constraint fixed_items_kind_fields check (
    (kind = 'expense' and group_id is not null and owner_kind is null and owner_user_id is null)
    or (kind = 'income' and group_id is null and owner_kind is not null
        and ((owner_kind = 'member') = (owner_user_id is not null)))
  ),
  foreign key (household_id, group_id) references public.fixed_groups (household_id, id) on delete restrict,
  foreign key (household_id, owner_user_id) references public.household_members (household_id, user_id) on delete restrict
);
create index fixed_items_household_idx on public.fixed_items (household_id, kind, sort_order);
create trigger fixed_items_updated_at before update on public.fixed_items
  for each row execute function private.set_updated_at();

create table public.fixed_item_versions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  item_id uuid not null,
  valid_from date not null check (extract(day from valid_from) = 1),
  -- Negativt beløb = modregning (fx tilskud/refusion under faste udgifter)
  amount_ore bigint not null check (amount_ore between -100000000000 and 100000000000 and amount_ore <> 0),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly')),
  -- Betalingsmåned for kvartalsvise/årlige poster (1–12). Bruges til "betales i denne måned".
  due_month smallint check (due_month between 1 and 12),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, valid_from),
  constraint fixed_item_versions_due check ((frequency = 'monthly') = (due_month is null)),
  foreign key (household_id, item_id) references public.fixed_items (household_id, id) on delete cascade
);
create index fixed_item_versions_lookup_idx on public.fixed_item_versions (item_id, valid_from desc);
create trigger fixed_item_versions_updated_at before update on public.fixed_item_versions
  for each row execute function private.set_updated_at();

-- Historikværn for slutmåned: man kan kun stoppe eller genoptage en post fra
-- forrige måned og frem (indeværende måned må stadig rettes).
create or replace function private.fixed_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  earliest date := (private.current_month() - interval '1 month')::date;
begin
  if tg_op = 'UPDATE' then
    if new.start_month is distinct from old.start_month then
      raise exception 'Startmåned kan ikke ændres' using errcode = 'check_violation';
    end if;
    if new.end_month is distinct from old.end_month then
      if (old.end_month is not null and old.end_month < earliest)
         or (new.end_month is not null and new.end_month < earliest) then
        raise exception 'En fast post kan kun stoppes eller genoptages fra denne måned og frem' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger fixed_items_guard before update on public.fixed_items
  for each row execute function private.fixed_items_guard();

-- -----------------------------------------------------------------------------
-- Budgetkategorier: forbrug eller reserve (fx Buffer)
-- Standardbudget: fast beløb ELLER procent af "til fordeling" (med historik)
-- -----------------------------------------------------------------------------
alter table public.budget_categories
  add column kind text not null default 'spending' check (kind in ('spending', 'reserve'));

alter table public.budget_category_defaults
  add column mode text not null default 'amount' check (mode in ('amount', 'percent')),
  add column percent_bp integer check (percent_bp between 0 and 10000),
  alter column amount_ore drop not null;
alter table public.budget_category_defaults
  add constraint budget_category_defaults_mode check (
    (mode = 'amount' and amount_ore is not null and percent_bp is null)
    or (mode = 'percent' and percent_bp is not null and amount_ore is null)
  );

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.fixed_groups enable row level security;
alter table public.fixed_items enable row level security;
alter table public.fixed_item_versions enable row level security;
revoke all on public.fixed_groups, public.fixed_items, public.fixed_item_versions from anon;

create policy "Se grupper" on public.fixed_groups for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret gruppe" on public.fixed_groups for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret gruppe" on public.fixed_groups for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
revoke insert, update, delete, truncate on public.fixed_groups from authenticated;
grant insert (household_id, name, sort_order) on public.fixed_groups to authenticated;
grant update (name, sort_order, archived_at) on public.fixed_groups to authenticated;

create policy "Se faste poster" on public.fixed_items for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret fast post" on public.fixed_items for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid())
              and start_month >= (select private.current_month()));
create policy "Ret fast post" on public.fixed_items for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
-- Sletning kun af poster uden historik (oprettet til denne eller en kommende måned)
create policy "Slet fast post uden historik" on public.fixed_items for delete to authenticated
  using (private.is_household_member(household_id) and start_month >= (select private.current_month()));
revoke insert, update, delete, truncate on public.fixed_items from authenticated;
grant insert (household_id, kind, name, group_id, owner_kind, owner_user_id, payment_day, note, sort_order, start_month)
  on public.fixed_items to authenticated;
grant update (name, group_id, owner_kind, owner_user_id, payment_day, note, sort_order, end_month, archived_at)
  on public.fixed_items to authenticated;
grant delete on public.fixed_items to authenticated;

create policy "Se versioner" on public.fixed_item_versions for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret version fremadrettet" on public.fixed_item_versions for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid())
              and valid_from >= (select private.current_month()));
create policy "Ret fremtidig version" on public.fixed_item_versions for update to authenticated
  using (private.is_household_member(household_id) and valid_from >= (select private.current_month()))
  with check (private.is_household_member(household_id) and valid_from >= (select private.current_month()));
create policy "Slet fremtidig version" on public.fixed_item_versions for delete to authenticated
  using (private.is_household_member(household_id) and valid_from >= (select private.current_month()));
revoke insert, update, truncate on public.fixed_item_versions from authenticated;
grant insert (household_id, item_id, valid_from, amount_ore, frequency, due_month) on public.fixed_item_versions to authenticated;
grant update (amount_ore, frequency, due_month) on public.fixed_item_versions to authenticated;

grant update (kind) on public.budget_categories to authenticated;
grant insert (mode, percent_bp) on public.budget_category_defaults to authenticated;
grant update (mode, percent_bp) on public.budget_category_defaults to authenticated;

-- -----------------------------------------------------------------------------
-- Beregning
-- -----------------------------------------------------------------------------
-- Gennemsnitligt månedsbeløb i øre (kvartal/3, år/12, afrundet til nærmeste øre)
create or replace function private.monthly_equivalent(p_amount bigint, p_frequency text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'monthly' then p_amount
    when 'quarterly' then round(p_amount::numeric / 3)::bigint
    when 'yearly' then round(p_amount::numeric / 12)::bigint
  end;
$$;

-- Aktive faste poster i en måned med den version der gjaldt dengang
create or replace function public.fixed_items_month(p_month date)
returns table (
  item_id uuid,
  kind text,
  name text,
  group_id uuid,
  owner_kind text,
  owner_user_id uuid,
  payment_day smallint,
  frequency text,
  due_month smallint,
  amount_ore bigint,
  monthly_ore bigint,
  due_this_month boolean,
  version_from date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (select date_trunc('month', p_month)::date as start)
  select
    i.id, i.kind, i.name, i.group_id, i.owner_kind, i.owner_user_id, i.payment_day,
    v.frequency, v.due_month, v.amount_ore,
    private.monthly_equivalent(v.amount_ore, v.frequency),
    case v.frequency
      when 'monthly' then true
      when 'quarterly' then ((extract(month from m.start)::int - v.due_month + 12) % 3) = 0
      when 'yearly' then extract(month from m.start)::int = v.due_month
    end,
    v.valid_from
  from public.fixed_items i
  cross join m
  join lateral (
    select fv.* from public.fixed_item_versions fv
    where fv.item_id = i.id and fv.valid_from <= m.start
    order by fv.valid_from desc
    limit 1
  ) v on true
  where i.household_id = public.current_household_id()
    and i.start_month <= m.start
    and (i.end_month is null or i.end_month >= m.start);
$$;

-- Effektive budgetter pr. kategori for en måned (den ENESTE fordelingslogik).
--   * Overstyring for måneden vinder altid.
--   * Ellers standard: fast beløb, eller procent af "til fordeling".
--   * Til fordeling = tilbage efter faste udgifter − summen af kategorier med fast beløb.
--   * Procentbeløb afrundes med største-rest-metoden, så summen går præcis op.
create or replace function private.category_budgets(p_month date)
returns table (
  category_id uuid,
  mode text,
  percent_bp integer,
  default_ore bigint,
  override_ore bigint,
  effective_ore bigint,
  budget_source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (select date_trunc('month', p_month)::date as start),
  available as (
    select coalesce(sum(case when f.kind = 'income' then f.monthly_ore else -f.monthly_ore end), 0)::bigint as v
    from public.fixed_items_month(p_month) f
  ),
  base as (
    select
      c.id,
      case when c.archived_at is not null and c.archived_at < m.start then 'none' else coalesce(d.mode, 'none') end as mode,
      d.percent_bp,
      d.amount_ore as default_ore,
      case when c.archived_at is not null and c.archived_at < m.start then null else o.amount_ore end as override_ore
    from public.budget_categories c
    cross join m
    left join public.monthly_budgets o on o.category_id = c.id and o.month = m.start
    left join lateral (
      select bd.mode, bd.percent_bp, bd.amount_ore
      from public.budget_category_defaults bd
      where bd.category_id = c.id and bd.valid_from <= m.start
      order by bd.valid_from desc limit 1
    ) d on true
    where c.household_id = public.current_household_id()
  ),
  totals as (
    select
      greatest((select v from available) - coalesce(sum(default_ore) filter (where mode = 'amount'), 0), 0)::bigint as dist,
      coalesce(sum(percent_bp) filter (where mode = 'percent'), 0)::int as bp
    from base
  ),
  pct as (
    -- Ved over 100 % skaleres procenterne ned, så der aldrig fordeles mere end der er
    select b.id,
           t.dist::numeric * b.percent_bp / greatest(t.bp, 10000) as raw
    from base b, totals t
    where b.mode = 'percent'
  ),
  pct_floor as (
    select id, floor(raw)::bigint as fl, raw - floor(raw) as frac,
           row_number() over (order by raw - floor(raw) desc, id) as rn
    from pct
  ),
  pct_final as (
    -- Største-rest: fordel de resterende øre, så summen går præcis op
    select f.id,
           f.fl + case when f.rn <= (
             round((select dist from totals)::numeric * least((select bp from totals), 10000) / 10000)
             - (select coalesce(sum(fl), 0) from pct_floor)
           ) then 1 else 0 end as ore
    from pct_floor f
  )
  select
    b.id, b.mode, b.percent_bp, b.default_ore, b.override_ore,
    coalesce(b.override_ore, case b.mode when 'amount' then b.default_ore when 'percent' then pf.ore else 0 end)::bigint,
    case when b.override_ore is not null then 'override' when b.mode in ('amount', 'percent') then 'default' else 'none' end
  from base b
  left join pct_final pf on pf.id = b.id;
$$;
grant execute on function private.category_budgets(date) to authenticated;
grant execute on function private.monthly_equivalent(bigint, text) to authenticated;

-- Månedens plan (ét tal pr. trin i vandfaldet)
create or replace function public.month_plan(p_month date)
returns table (
  income_ore bigint,
  fixed_expenses_ore bigint,
  available_ore bigint,
  fixed_allocations_ore bigint,
  distributable_ore bigint,
  percent_total_bp integer,
  allocated_ore bigint,
  unallocated_ore bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select
      coalesce(sum(monthly_ore) filter (where kind = 'income'), 0)::bigint as inc,
      coalesce(sum(monthly_ore) filter (where kind = 'expense'), 0)::bigint as exp
    from public.fixed_items_month(p_month)
  ),
  b as (
    select
      coalesce(sum(default_ore) filter (where mode = 'amount'), 0)::bigint as fixed_alloc,
      coalesce(sum(percent_bp) filter (where mode = 'percent'), 0)::int as bp,
      coalesce(sum(effective_ore), 0)::bigint as allocated
    from private.category_budgets(p_month)
  )
  select
    f.inc, f.exp, f.inc - f.exp, b.fixed_alloc,
    greatest(f.inc - f.exp - b.fixed_alloc, 0), b.bp, b.allocated,
    f.inc - f.exp - b.allocated
  from f, b;
$$;

-- Budgetoversigt (udvidet med type, tilstand og procent). Returtype ændres → drop + create.
drop function public.budget_month_summary(date);
create function public.budget_month_summary(p_month date)
returns table (
  category_id uuid,
  name text,
  icon text,
  color text,
  sort_order integer,
  archived boolean,
  kind text,
  budget_ore bigint,
  budget_source text,
  budget_mode text,
  percent_bp integer,
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
  ),
  cb as (select * from private.category_budgets(p_month))
  select
    c.id, c.name, c.icon, c.color, c.sort_order, c.archived_at is not null, c.kind,
    coalesce(cb.effective_ore, 0)::bigint,
    coalesce(cb.budget_source, 'none'),
    coalesce(cb.mode, 'none'),
    cb.percent_bp,
    coalesce(cb.default_ore, 0)::bigint,
    coalesce(t.spent, 0)::bigint,
    coalesce(t.cnt, 0)::integer
  from public.budget_categories c
  cross join m
  left join cb on cb.category_id = c.id
  left join lateral (
    select sum(tr.amount_ore) as spent, count(*) as cnt
    from public.transactions tr
    where tr.category_id = c.id and tr.occurred_on >= m.start and tr.occurred_on < m.next
  ) t on true
  where c.household_id = public.current_household_id()
    and (c.archived_at is null or c.archived_at >= m.start or coalesce(t.cnt, 0) > 0)
    and (c.created_at < m.next or cb.budget_source <> 'none' or coalesce(t.cnt, 0) > 0)
  order by (c.archived_at is not null), c.kind desc, c.sort_order, c.name;
$$;

-- -----------------------------------------------------------------------------
-- RPC: kategorier og standardbudgetter med beløb/procent
-- -----------------------------------------------------------------------------
drop function public.create_budget_category(text, text, text, bigint, date);
create function public.create_budget_category(
  p_name text,
  p_icon text,
  p_color text,
  p_default_amount_ore bigint default null,
  p_valid_from date default null,
  p_kind text default 'spending',
  p_mode text default 'amount',
  p_percent_bp integer default null
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
  select coalesce(max(sort_order), -1) + 1 into next_sort from public.budget_categories where household_id = hid;

  insert into public.budget_categories (household_id, name, icon, color, sort_order)
  values (hid, trim(p_name), p_icon, p_color, next_sort)
  returning id into cid;
  if p_kind is distinct from 'spending' then
    update public.budget_categories set kind = p_kind where id = cid;
  end if;

  if p_mode = 'percent' and p_percent_bp is not null then
    insert into public.budget_category_defaults (household_id, category_id, valid_from, mode, percent_bp)
    values (hid, cid, coalesce(date_trunc('month', p_valid_from)::date, private.current_month()), 'percent', p_percent_bp);
  elsif p_default_amount_ore is not null then
    insert into public.budget_category_defaults (household_id, category_id, valid_from, amount_ore)
    values (hid, cid, coalesce(date_trunc('month', p_valid_from)::date, private.current_month()), p_default_amount_ore);
  end if;
  return cid;
end;
$$;

drop function public.set_category_default(uuid, date, bigint);
create function public.set_category_default(
  p_category_id uuid,
  p_valid_from date,
  p_amount_ore bigint,
  p_mode text default 'amount',
  p_percent_bp integer default null
)
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
  if p_mode not in ('amount', 'percent') then
    raise exception 'Ugyldig budgettype' using errcode = 'check_violation';
  end if;

  update public.budget_category_defaults
     set mode = p_mode,
         amount_ore = case when p_mode = 'amount' then p_amount_ore end,
         percent_bp = case when p_mode = 'percent' then p_percent_bp end
   where category_id = p_category_id and valid_from = vf;
  if not found then
    insert into public.budget_category_defaults (household_id, category_id, valid_from, mode, amount_ore, percent_bp)
    values (hid, p_category_id, vf, p_mode,
            case when p_mode = 'amount' then p_amount_ore end,
            case when p_mode = 'percent' then p_percent_bp end);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: faste poster
-- -----------------------------------------------------------------------------
create or replace function public.create_fixed_item(
  p_kind text,
  p_name text,
  p_amount_ore bigint,
  p_frequency text default 'monthly',
  p_due_month smallint default null,
  p_group_id uuid default null,
  p_owner_kind text default null,
  p_owner_user_id uuid default null,
  p_payment_day smallint default null,
  p_note text default null,
  p_start_month date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  iid uuid;
  sm date := coalesce(date_trunc('month', p_start_month)::date, private.current_month());
  next_sort integer;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  if sm < private.current_month() then
    raise exception 'En ny fast post kan tidligst gælde fra denne måned' using errcode = 'check_violation';
  end if;
  select coalesce(max(sort_order), -1) + 1 into next_sort from public.fixed_items where household_id = hid and kind = p_kind;

  insert into public.fixed_items (household_id, kind, name, group_id, owner_kind, owner_user_id, payment_day, note, sort_order, start_month)
  values (hid, p_kind, trim(p_name),
          case when p_kind = 'expense' then p_group_id end,
          case when p_kind = 'income' then coalesce(p_owner_kind, 'shared') end,
          case when p_kind = 'income' and p_owner_kind = 'member' then p_owner_user_id end,
          p_payment_day, nullif(trim(p_note), ''), next_sort, sm)
  returning id into iid;

  insert into public.fixed_item_versions (household_id, item_id, valid_from, amount_ore, frequency, due_month)
  values (hid, iid, sm, p_amount_ore, p_frequency, case when p_frequency = 'monthly' then null else p_due_month end);
  return iid;
end;
$$;

create or replace function public.set_fixed_item_amount(
  p_item_id uuid,
  p_valid_from date,
  p_amount_ore bigint,
  p_frequency text default 'monthly',
  p_due_month smallint default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid;
  vf date := date_trunc('month', p_valid_from)::date;
  dm smallint := case when p_frequency = 'monthly' then null else p_due_month end;
begin
  select household_id into hid from public.fixed_items where id = p_item_id;
  if hid is null then
    raise exception 'Posten findes ikke' using errcode = 'no_data_found';
  end if;
  if vf < private.current_month() then
    raise exception 'Beløbet kan kun ændres fra indeværende måned og frem' using errcode = 'check_violation';
  end if;
  update public.fixed_item_versions
     set amount_ore = p_amount_ore, frequency = p_frequency, due_month = dm
   where item_id = p_item_id and valid_from = vf;
  if not found then
    insert into public.fixed_item_versions (household_id, item_id, valid_from, amount_ore, frequency, due_month)
    values (hid, p_item_id, vf, p_amount_ore, p_frequency, dm);
  end if;
end;
$$;

-- Standardgrupper (kan kaldes flere gange – opretter kun manglende)
create or replace function public.create_default_fixed_groups()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  g text;
  i integer := 0;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  foreach g in array array['Bolig', 'Transport', 'Forsikring', 'Abonnementer', 'Gæld', 'Opsparing', 'Andet'] loop
    if not exists (select 1 from public.fixed_groups where household_id = hid and lower(name) = lower(g) and archived_at is null) then
      insert into public.fixed_groups (household_id, name, sort_order) values (hid, g, i);
    end if;
    i := i + 1;
  end loop;
end;
$$;

revoke all on function public.fixed_items_month(date) from public, anon;
revoke all on function public.month_plan(date) from public, anon;
revoke all on function public.budget_month_summary(date) from public, anon;
revoke all on function public.create_budget_category(text, text, text, bigint, date, text, text, integer) from public, anon;
revoke all on function public.set_category_default(uuid, date, bigint, text, integer) from public, anon;
revoke all on function public.create_fixed_item(text, text, bigint, text, smallint, uuid, text, uuid, smallint, text, date) from public, anon;
revoke all on function public.set_fixed_item_amount(uuid, date, bigint, text, smallint) from public, anon;
revoke all on function public.create_default_fixed_groups() from public, anon;
grant execute on function public.fixed_items_month(date) to authenticated;
grant execute on function public.month_plan(date) to authenticated;
grant execute on function public.budget_month_summary(date) to authenticated;
grant execute on function public.create_budget_category(text, text, text, bigint, date, text, text, integer) to authenticated;
grant execute on function public.set_category_default(uuid, date, bigint, text, integer) to authenticated;
grant execute on function public.create_fixed_item(text, text, bigint, text, smallint, uuid, text, uuid, smallint, text, date) to authenticated;
grant execute on function public.set_fixed_item_amount(uuid, date, bigint, text, smallint) to authenticated;
grant execute on function public.create_default_fixed_groups() to authenticated;
