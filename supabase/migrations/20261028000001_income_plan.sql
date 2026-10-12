-- =============================================================================
-- Indtægtskilder, faktiske indtægter og månedens plan
-- =============================================================================
-- Model:
--   income_types    Løn, Børnepenge, Barsel, SU, Bonus, Refusion, Andet (+ egne)
--   income_sources  "Løn – Hamza": identiteten. Kan have et forventet beløb via en
--                   fast indtægt (fixed_items, med historik).
--   income_entries  de faktiske indtægter (manuelle eller fra banken) med kilde,
--                   type og hvilken måned de hører til (period_month).
--
-- Månedens indtægt beregnes altid fra indtægterne – der gemmes ingen månedstotal:
--   pr. kilde: faktiske indtægter i måneden, ellers det forventede beløb (markeret).
--   Indtægter uden kilde tæller med som faktiske.
-- Planen: indtægter − faste udgifter − faste budgetbeløb → resten fordeles i procent.
--
-- Bank: en banktransaktion kan højst blive til én indtægt (unik bank_transaction_id).
-- Appen foreslår kilde ud fra tidligere valg (husket pr. modpart) eller ejer+beløb,
-- men et forslag er kun et forslag, indtil brugeren bekræfter eller retter det.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Typer
-- -----------------------------------------------------------------------------
create table public.income_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);
create unique index income_types_active_name_uq on public.income_types (household_id, lower(trim(name))) where archived_at is null;

create or replace function private.seed_income_types(p_household uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.income_types (household_id, name, sort_order, is_default)
  select p_household, t.name, t.ord, true
  from (values ('Løn', 0), ('Børnepenge', 1), ('Barsel', 2), ('SU', 3), ('Bonus', 4), ('Refusion', 5), ('Andet', 6)) t (name, ord)
  where not exists (
    select 1 from public.income_types x
    where x.household_id = p_household and lower(x.name) = lower(t.name) and x.archived_at is null
  );
$$;

create or replace function private.households_seed_income_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_income_types(new.id);
  return new;
end;
$$;
create trigger households_income_types after insert on public.households
  for each row execute function private.households_seed_income_types();
select private.seed_income_types(id) from public.households;

-- Husstandens type med et bestemt navn (fx 'Andet')
create or replace function private.income_type_named(p_household uuid, p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.income_types
  where household_id = p_household and lower(name) = lower(p_name) and archived_at is null
  order by is_default desc, created_at limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Kilder
-- -----------------------------------------------------------------------------
create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  type_id uuid not null,
  owner_kind text not null default 'shared' check (owner_kind in ('member', 'shared')),
  owner_user_id uuid,
  -- Forventet beløb (med historik) ligger på en fast indtægt
  fixed_item_id uuid unique,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  constraint income_sources_owner check ((owner_kind = 'member') = (owner_user_id is not null)),
  foreign key (household_id, type_id) references public.income_types (household_id, id) on delete restrict,
  foreign key (household_id, owner_user_id) references public.household_members (household_id, user_id) on delete restrict,
  foreign key (household_id, fixed_item_id) references public.fixed_items (household_id, id) on delete set null (fixed_item_id)
);
create unique index income_sources_active_name_uq on public.income_sources (household_id, lower(trim(name))) where archived_at is null;
create trigger income_sources_updated_at before update on public.income_sources
  for each row execute function private.set_updated_at();

-- Entydigt kildenavn: "Løn" → "Løn – Sumaya" (ejerens navn) → "Løn – Sumaya (2)" …
create or replace function private.unique_source_name(p_household uuid, p_name text, p_owner uuid, p_except uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base text := left(trim(p_name), 60);
  candidate text := base;
  n int := 2;
  taken boolean;
  owner_added boolean := p_owner is null;
begin
  loop
    select exists (select 1 from public.income_sources s where s.household_id = p_household and s.archived_at is null
                     and lower(trim(s.name)) = lower(candidate) and s.id is distinct from p_except) into taken;
    exit when not taken;
    if not owner_added then
      owner_added := true;
      candidate := left(base, 40) || ' – ' || left(coalesce((select display_name from public.profiles where id = p_owner), 'ejer'), 19);
      base := candidate;
    else
      candidate := left(base, 54) || ' (' || n || ')';
      n := n + 1;
    end if;
  end loop;
  return candidate;
end;
$$;

-- En fast indtægt er en indtægtskilde med et forventet beløb: opret/omdøb kilden automatisk
create or replace function private.fixed_income_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.kind <> 'income' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_name := private.unique_source_name(new.household_id, new.name, new.owner_user_id);
    insert into public.income_sources (household_id, name, type_id, owner_kind, owner_user_id, fixed_item_id, sort_order, created_by)
    values (new.household_id, v_name,
            coalesce(private.income_type_named(new.household_id, case when new.name ~* 'løn' then 'Løn' else 'Andet' end),
                     private.income_type_named(new.household_id, 'Andet')),
            new.owner_kind, new.owner_user_id, new.id, new.sort_order, new.created_by)
    on conflict do nothing;
  elsif new.name is distinct from old.name then
    update public.income_sources s set name = private.unique_source_name(new.household_id, new.name, new.owner_user_id, s.id)
    where s.fixed_item_id = new.id;
  end if;
  return new;
end;
$$;
create trigger fixed_items_income_source after insert or update of name on public.fixed_items
  for each row execute function private.fixed_income_source();

-- Eksisterende faste indtægter bliver til kilder (én ad gangen, så navnene bliver entydige)
do $$
declare i public.fixed_items;
begin
  for i in select * from public.fixed_items x where x.kind = 'income'
             and not exists (select 1 from public.income_sources s where s.fixed_item_id = x.id)
           order by x.household_id, x.sort_order, x.created_at
  loop
    insert into public.income_sources (household_id, name, type_id, owner_kind, owner_user_id, fixed_item_id, sort_order, created_by, archived_at)
    values (i.household_id,
            case when i.archived_at is null then private.unique_source_name(i.household_id, i.name, i.owner_user_id) else left(trim(i.name), 60) end,
            private.income_type_named(i.household_id, case when i.name ~* 'løn' then 'Løn' else 'Andet' end),
            i.owner_kind, i.owner_user_id, i.id, i.sort_order, i.created_by, i.archived_at);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Faktiske indtægter: kilde, type, måned og banklink
-- -----------------------------------------------------------------------------
alter table public.income_entries
  add column source_id uuid,
  add column type_id uuid,
  add column period_month date check (period_month is null or extract(day from period_month) = 1),
  add column bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  add column match_confidence smallint check (match_confidence between 0 and 100),
  add column matched_by_user boolean not null default false,
  add constraint income_entries_source_fk foreign key (household_id, source_id) references public.income_sources (household_id, id) on delete restrict,
  add constraint income_entries_type_fk foreign key (household_id, type_id) references public.income_types (household_id, id) on delete restrict;
-- Samme banktransaktion kan aldrig blive til to indtægter
create unique index income_entries_bank_tx_uq on public.income_entries (bank_transaction_id) where bank_transaction_id is not null;
create index income_entries_period_idx on public.income_entries (household_id, period_month);
create index income_entries_source_idx on public.income_entries (source_id, period_month);

-- Udfyld måned og type; brugerens valg af kilde gør forslaget til et bekræftet valg
create or replace function private.income_entries_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  by_user boolean := current_user = 'authenticated';
begin
  if tg_op = 'INSERT' then
    new.period_month := coalesce(date_trunc('month', new.period_month)::date, date_trunc('month', new.received_on)::date);
    if by_user then
      new.matched_by_user := new.source_id is not null;
      new.match_confidence := case when new.source_id is not null then 100 end;
    end if;
  else
    if new.received_on is distinct from old.received_on and new.period_month is not distinct from old.period_month
       and old.period_month = date_trunc('month', old.received_on)::date then
      new.period_month := date_trunc('month', new.received_on)::date;
    end if;
    new.period_month := date_trunc('month', coalesce(new.period_month, new.received_on))::date;
    if by_user then
      -- Kun appen må sætte banklink og forslag
      new.bank_transaction_id := old.bank_transaction_id;
      if new.source_id is distinct from old.source_id or (new.matched_by_user and not old.matched_by_user) then
        new.matched_by_user := new.source_id is not null;
        new.match_confidence := case when new.source_id is not null then 100 end;
      else
        new.matched_by_user := old.matched_by_user;
        new.match_confidence := old.match_confidence;
      end if;
    end if;
  end if;
  if new.type_id is null or (tg_op = 'UPDATE' and new.source_id is distinct from old.source_id and new.type_id is not distinct from old.type_id) then
    new.type_id := coalesce(
      (select s.type_id from public.income_sources s where s.id = new.source_id and s.household_id = new.household_id),
      new.type_id,
      private.income_type_named(new.household_id, 'Andet'));
  end if;
  return new;
end;
$$;
create trigger income_entries_defaults before insert or update on public.income_entries
  for each row execute function private.income_entries_defaults();

-- Eksisterende indtægter: måned, banklink og type
update public.income_entries e set period_month = date_trunc('month', e.received_on)::date where e.period_month is null;
update public.income_entries e set bank_transaction_id = b.id
  from public.bank_transactions b
  where b.income_id = e.id and e.bank_transaction_id is null
    and not exists (select 1 from public.income_entries x where x.bank_transaction_id = b.id);
update public.income_entries e set type_id = private.income_type_named(e.household_id, 'Andet') where e.type_id is null;
alter table public.income_entries alter column period_month set not null, alter column type_id set not null;

grant insert (source_id, type_id, period_month) on public.income_entries to authenticated;
grant update (source_id, type_id, period_month, matched_by_user) on public.income_entries to authenticated;

-- -----------------------------------------------------------------------------
-- Huskede kilder pr. modpart (lært, når brugeren vælger kilde for en bankindtægt)
-- -----------------------------------------------------------------------------
create table private.income_source_rules (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  merchant_key text not null check (length(merchant_key) between 1 and 140),
  source_id uuid not null references public.income_sources (id) on delete cascade,
  account_id uuid,
  last_amount_ore bigint,
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id, merchant_key)
);
revoke all on private.income_source_rules from public, anon, authenticated;

create or replace function private.income_learn_rule(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.income_entries;
  b public.bank_transactions;
  k text;
begin
  select * into e from public.income_entries where id = p_entry;
  if e.id is null or e.bank_transaction_id is null or e.source_id is null then
    return;
  end if;
  select * into b from public.bank_transactions where id = e.bank_transaction_id;
  k := private.merchant_key(b.counterparty, b.description);
  if k is null then
    return;
  end if;
  insert into private.income_source_rules (household_id, user_id, merchant_key, source_id, account_id, last_amount_ore)
  values (b.household_id, b.user_id, k, e.source_id, b.account_id, e.amount_ore)
  on conflict (household_id, user_id, merchant_key)
  do update set source_id = excluded.source_id, account_id = excluded.account_id, last_amount_ore = excluded.last_amount_ore, updated_at = now();
end;
$$;

create or replace function private.income_entries_learn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.matched_by_user and new.source_id is not null and new.bank_transaction_id is not null
     and (new.source_id is distinct from old.source_id or not old.matched_by_user) then
    perform private.income_learn_rule(new.id);
  end if;
  return new;
end;
$$;
create trigger income_entries_learn after update on public.income_entries
  for each row execute function private.income_entries_learn();

-- Forslag til kilde for en bankindtægt: (kilde, sikkerhed 0–100) eller ingen
--   90  husket modpart, beløbet ligner sidste gang (±25 %)
--   70  husket modpart (første gang) · 60 husket modpart, men beløbet afviger
--   40  ingen husket modpart: kontoejerens kilde, hvis forventede beløb ligner (±35 %)
--       og som ikke allerede har en indtægt i måneden
create or replace function private.suggest_income_source(p_household uuid, p_user uuid, p_key text, p_amount bigint, p_month date)
returns table (source_id uuid, confidence smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r private.income_source_rules;
begin
  select x.* into r from private.income_source_rules x
  join public.income_sources s on s.id = x.source_id and s.archived_at is null
  where x.household_id = p_household and x.user_id = p_user and x.merchant_key = p_key;
  if r.source_id is not null then
    source_id := r.source_id;
    confidence := case
      when r.last_amount_ore is null or r.last_amount_ore = 0 then 70
      when abs(p_amount - r.last_amount_ore)::numeric / abs(r.last_amount_ore) <= 0.25 then 90
      else 60 end;
    return next;
    return;
  end if;
  return query
    select s.id, 40::smallint
    from public.income_sources s
    join public.fixed_items i on i.id = s.fixed_item_id and i.start_month <= p_month and (i.end_month is null or i.end_month >= p_month)
    join lateral (
      select fv.amount_ore from public.fixed_item_versions fv
      where fv.item_id = i.id and fv.valid_from <= p_month order by fv.valid_from desc limit 1
    ) v on true
    where s.household_id = p_household and s.archived_at is null
      and s.owner_kind = 'member' and s.owner_user_id = p_user
      and v.amount_ore > 0 and abs(p_amount - v.amount_ore)::numeric / v.amount_ore <= 0.35
      and not exists (select 1 from public.income_entries e where e.source_id = s.id and e.period_month = p_month)
    order by abs(p_amount - v.amount_ore), s.sort_order
    limit 1;
end;
$$;

-- Bankindtægt → indtægt (én gang pr. banktransaktion) med forslag til kilde
create or replace function private.bank_import_income(b public.bank_transactions)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  m date := date_trunc('month', b.booked_on)::date;
  sug record;
begin
  select * into sug from private.suggest_income_source(b.household_id, b.user_id, private.merchant_key(b.counterparty, b.description), b.amount_ore, m);
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source, created_by,
                                     period_month, bank_transaction_id, source_id, match_confidence, matched_by_user)
  values (b.household_id, b.amount_ore, b.booked_on,
          left(coalesce(nullif(trim(b.counterparty), ''), b.description), 80), 'member', b.user_id, 'bank', b.user_id,
          m, b.id, sug.source_id, sug.confidence, false)
  on conflict (bank_transaction_id) where bank_transaction_id is not null do nothing
  returning id into new_id;
  if new_id is null then
    select id into new_id from public.income_entries where bank_transaction_id = b.id;
  end if;
  update public.bank_transactions set state = 'imported', income_id = new_id where id = b.id;
  return new_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: opret kilde (evt. med forventet beløb som fast indtægt med historik)
-- -----------------------------------------------------------------------------
create or replace function public.income_source_create(
  p_name text,
  p_type_id uuid,
  p_owner_kind text default 'shared',
  p_owner_user_id uuid default null,
  p_expected_ore bigint default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  sid uuid;
  item uuid;
begin
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Ingen adgang' using errcode = 'insufficient_privilege';
  end if;
  if p_owner_kind = 'member' and not exists (
    select 1 from public.household_members m where m.household_id = hid and m.user_id = p_owner_user_id and m.role <> 'child' and m.left_at is null) then
    raise exception 'Vælg en voksen i husstanden' using errcode = 'check_violation';
  end if;
  if p_expected_ore is not null and p_expected_ore > 0 then
    item := public.create_fixed_item(p_kind => 'income', p_name => p_name, p_amount_ore => p_expected_ore, p_owner_kind => p_owner_kind, p_owner_user_id => p_owner_user_id);
    update public.income_sources set type_id = coalesce(p_type_id, type_id) where fixed_item_id = item returning id into sid;
  end if;
  if sid is null then
    insert into public.income_sources (household_id, name, type_id, owner_kind, owner_user_id)
    values (hid, trim(p_name), coalesce(p_type_id, private.income_type_named(hid, 'Andet')), coalesce(p_owner_kind, 'shared'),
            case when p_owner_kind = 'member' then p_owner_user_id end)
    returning id into sid;
  end if;
  return sid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Månedens indtægter pr. kilde (faktisk, ellers forventet)
-- -----------------------------------------------------------------------------
create or replace function public.month_income(p_month date)
returns table (
  source_id uuid,
  name text,
  type_name text,
  owner_kind text,
  owner_user_id uuid,
  actual_ore bigint,
  expected_ore bigint,
  used_ore bigint,
  status text,
  entry_count integer,
  unconfirmed_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (select date_trunc('month', p_month)::date as start),
  actual as (
    select e.source_id, sum(e.amount_ore)::bigint as ore, count(*)::int as cnt,
           count(*) filter (where e.source_id is not null and not e.matched_by_user)::int as unconfirmed
    from public.income_entries e, m
    where e.household_id = public.current_household_id() and e.period_month = m.start
    group by e.source_id
  ),
  expected as (
    select s.id as source_id, f.monthly_ore as ore
    from public.fixed_items_month(p_month) f
    join public.income_sources s on s.fixed_item_id = f.item_id
    where f.kind = 'income'
  )
  select s.id, s.name, t.name, s.owner_kind, s.owner_user_id,
         coalesce(a.ore, 0), ex.ore,
         case when a.cnt > 0 then a.ore else coalesce(ex.ore, 0) end,
         case when a.cnt > 0 then 'actual' else 'expected' end,
         coalesce(a.cnt, 0), coalesce(a.unconfirmed, 0)
  from public.income_sources s
  join public.income_types t on t.id = s.type_id
  left join actual a on a.source_id = s.id
  left join expected ex on ex.source_id = s.id
  where s.household_id = public.current_household_id()
    and (a.cnt > 0 or ex.ore is not null)
  union all
  select null, 'Uden kilde', null, null, null, a.ore, null, a.ore, 'actual', a.cnt, 0
  from actual a where a.source_id is null
  order by 9, 2;
$$;

-- -----------------------------------------------------------------------------
-- Fordeling: bygger nu på månedens indtægter (faktisk, ellers forventet)
--   Til fordeling = tilbage − kategorier med fast beløb (inkl. månedens overstyring).
--   En overstyret procentkategori ændrer ikke de andre procentkategorier;
--   forskellen vises som ufordelt/overfordelt.
-- -----------------------------------------------------------------------------
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
    select
      (select coalesce(sum(used_ore), 0) from public.month_income(p_month))
      - (select coalesce(sum(monthly_ore), 0) from public.fixed_items_month(p_month) where kind = 'expense') as v
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
      greatest((select v from available) - coalesce(sum(coalesce(override_ore, default_ore)) filter (where mode = 'amount'), 0), 0)::bigint as dist,
      coalesce(sum(percent_bp) filter (where mode = 'percent'), 0)::int as bp
    from base
  ),
  pct as (
    -- Ved over 100 % (fx gamle data) skaleres procenterne ned, så der aldrig fordeles mere end der er
    select b.id, t.dist::numeric * b.percent_bp / greatest(t.bp, 10000) as raw
    from base b, totals t
    where b.mode = 'percent'
  ),
  pct_floor as (
    select id, floor(raw)::bigint as fl, raw - floor(raw) as frac,
           row_number() over (order by raw - floor(raw) desc, id) as rn
    from pct
  ),
  pct_final as (
    -- Største-rest: de resterende øre fordeles, så summen går præcis op
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

drop function if exists public.month_plan(date);
create function public.month_plan(p_month date)
returns table (
  income_ore bigint,
  actual_income_ore bigint,
  expected_income_ore bigint,
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
  with i as (
    select
      coalesce(sum(used_ore), 0)::bigint as inc,
      coalesce(sum(used_ore) filter (where status = 'actual'), 0)::bigint as act,
      coalesce(sum(used_ore) filter (where status = 'expected'), 0)::bigint as exp
    from public.month_income(p_month)
  ),
  f as (
    select coalesce(sum(monthly_ore) filter (where kind = 'expense'), 0)::bigint as exp
    from public.fixed_items_month(p_month)
  ),
  b as (
    select
      coalesce(sum(effective_ore) filter (where mode = 'amount'), 0)::bigint as fixed_alloc,
      coalesce(sum(percent_bp) filter (where mode = 'percent'), 0)::int as bp,
      coalesce(sum(effective_ore), 0)::bigint as allocated
    from private.category_budgets(p_month)
  )
  select
    i.inc, i.act, i.exp, f.exp, i.inc - f.exp, b.fixed_alloc,
    greatest(i.inc - f.exp - b.fixed_alloc, 0), b.bp, b.allocated,
    i.inc - f.exp - b.allocated
  from i, f, b;
$$;

-- -----------------------------------------------------------------------------
-- Procentfordelingen må højst være 100 % (i den måned ændringen gælder fra og senere)
-- -----------------------------------------------------------------------------
create or replace function private.check_percent_total(p_household uuid, p_from date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bad record;
begin
  select mm.month, sum(d.percent_bp) as bp into bad
  from (
    select p_from as month
    union
    select distinct bd.valid_from from public.budget_category_defaults bd
    where bd.household_id = p_household and bd.valid_from > p_from
  ) mm
  join public.budget_categories c on c.household_id = p_household and c.archived_at is null
  join lateral (
    select bd.mode, bd.percent_bp from public.budget_category_defaults bd
    where bd.category_id = c.id and bd.valid_from <= mm.month
    order by bd.valid_from desc limit 1
  ) d on d.mode = 'percent'
  group by mm.month
  having sum(d.percent_bp) > 10000
  order by mm.month
  limit 1;
  if bad.month is not null then
    raise exception 'Procentfordelingen må højst være 100 %% (er nu %)', round(bad.bp / 100.0, 2) using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.budget_defaults_percent_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'percent' then
    perform private.check_percent_total(new.household_id, new.valid_from);
  end if;
  return new;
end;
$$;
create constraint trigger budget_defaults_percent_guard after insert or update on public.budget_category_defaults
  deferrable initially immediate
  for each row execute function private.budget_defaults_percent_guard();

-- -----------------------------------------------------------------------------
-- RLS og rettigheder
-- -----------------------------------------------------------------------------
alter table public.income_types enable row level security;
alter table public.income_sources enable row level security;
revoke all on public.income_types, public.income_sources from anon;

create policy "Se indtægtstyper" on public.income_types for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret indtægtstype" on public.income_types for insert to authenticated
  with check (private.is_household_member(household_id));
create policy "Ret indtægtstype" on public.income_types for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
revoke insert, update, delete, truncate on public.income_types from authenticated;
grant insert (household_id, name, sort_order) on public.income_types to authenticated;
grant update (name, sort_order, archived_at) on public.income_types to authenticated;

create policy "Se indtægtskilder" on public.income_sources for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret indtægtskilde" on public.income_sources for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret indtægtskilde" on public.income_sources for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
revoke insert, update, delete, truncate on public.income_sources from authenticated;
grant insert (household_id, name, type_id, owner_kind, owner_user_id, sort_order) on public.income_sources to authenticated;
grant update (name, type_id, owner_kind, owner_user_id, sort_order, archived_at) on public.income_sources to authenticated;

create trigger income_types_write_access before insert or update on public.income_types
  for each row execute function private.enforce_write_access();
create trigger income_sources_write_access before insert or update on public.income_sources
  for each row execute function private.enforce_write_access();

revoke all on function private.seed_income_types(uuid) from public, anon, authenticated;
revoke all on function private.households_seed_income_types() from public, anon, authenticated;
revoke all on function private.fixed_income_source() from public, anon, authenticated;
revoke all on function private.unique_source_name(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function private.income_learn_rule(uuid) from public, anon, authenticated;
revoke all on function private.income_entries_learn() from public, anon, authenticated;
revoke all on function private.suggest_income_source(uuid, uuid, text, bigint, date) from public, anon, authenticated;
revoke all on function private.check_percent_total(uuid, date) from public, anon, authenticated;
revoke all on function private.budget_defaults_percent_guard() from public, anon, authenticated;
grant execute on function private.income_type_named(uuid, text) to authenticated;
revoke all on function public.income_source_create(text, uuid, text, uuid, bigint) from public, anon;
grant execute on function public.income_source_create(text, uuid, text, uuid, bigint) to authenticated;
revoke all on function public.month_income(date) from public, anon;
grant execute on function public.month_income(date) to authenticated;
revoke all on function public.month_plan(date) from public, anon;
grant execute on function public.month_plan(date) to authenticated;
