-- =============================================================================
-- Madplan og opskrifter
-- =============================================================================
-- * recipes / recipe_ingredients: husstandens egne opskrifter. Kategori er fri tekst
--   (forslag i appen), tags er en tekst-liste – begge kan udvides uden nye tabeller.
--   Opskrifter arkiveres i stedet for at slettes, så gamle ugeplaner bevarer linket.
-- * meal_plan_entries: én ret pr. række (dato + måltid). Ugen udledes af datoen.
--   Rettens navn gemmes altid (title), så historikken bevares, selv hvis opskriften ændres.
--   meal er forberedt til morgenmad/frokost; appen viser kun aftensmad nu.
-- * Indkøb: varer fra madplanen får source = 'meal_plan' og en source_key
--   ("meal:<uge>:<ingrediens>"). Unikt indeks på (liste, source_key) gør, at
--   gentagne tryk opdaterer de samme linjer i stedet for at lave dubletter.
-- * households.grocery_category_id: hvilken budgetkategori der er madbudgettet.
-- * ingredient_prices: forberedt til prisestimater (bruges ikke i appen endnu).
-- Mængder gemmes som heltal i tusindedele (amount_milli: 0,5 → 500, 700 → 700000),
-- så databasen ikke har kommatal.
-- =============================================================================

-- Enheder som appen kender og kan lægge sammen sikkert (g/kg, ml/dl/l, stk …)
create or replace function private.valid_unit(p_unit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_unit is null or p_unit in ('g', 'kg', 'ml', 'dl', 'l', 'stk', 'spsk', 'tsk', 'fed', 'dåse', 'pakke', 'pose', 'bundt', 'skive', 'knsp');
$$;

create or replace function private.valid_tags(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_tags), 0) <= 20
     and coalesce((select bool_and(length(trim(t)) between 1 and 30 and t = trim(t)) from unnest(p_tags) t), true);
$$;

-- -----------------------------------------------------------------------------
-- Madbudget: hvilken budgetkategori er dagligvarer
-- -----------------------------------------------------------------------------
alter table public.households add column grocery_category_id uuid;
alter table public.households
  add constraint households_grocery_category_fk
  foreign key (id, grocery_category_id) references public.budget_categories (household_id, id)
  on delete set null (grocery_category_id);
grant update (grocery_category_id) on public.households to authenticated;

-- Eksisterende husstande: brug dagligvarekategorien, hvis der er præcis én (kurv-ikonet
-- fra kategoriforslagene eller et oplagt navn). Ellers vælges den i appen.
update public.households h
set grocery_category_id = c.id
from (
  select household_id, (array_agg(id))[1] as id, count(*) as n
  from public.budget_categories
  where archived_at is null and kind = 'spending'
    and (icon = 'cart' or lower(trim(name)) in ('dagligvarer', 'mad', 'madvarer', 'mad og dagligvarer'))
  group by household_id
) c
where c.household_id = h.id and c.n = 1 and h.grocery_category_id is null;

-- -----------------------------------------------------------------------------
-- Opskrifter
-- -----------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text check (description is null or length(description) <= 1000),
  servings smallint not null default 4 check (servings between 1 and 50),
  prep_minutes smallint check (prep_minutes is null or prep_minutes between 0 and 1440),
  steps text check (steps is null or length(steps) <= 10000),
  category text check (category is null or length(trim(category)) between 1 and 40),
  tags text[] not null default '{}' check (private.valid_tags(tags)),
  is_favorite boolean not null default false,
  note text check (note is null or length(note) <= 2000),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index recipes_household_idx on public.recipes (household_id, archived_at, name);
create index recipes_tags_idx on public.recipes using gin (tags);
create trigger recipes_updated_at before update on public.recipes
  for each row execute function private.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  recipe_id uuid not null,
  sort_order smallint not null default 0,
  name text not null check (length(trim(name)) between 1 and 80),
  amount_milli integer check (amount_milli is null or amount_milli between 1 and 100000000),
  unit text check (private.valid_unit(unit)),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  foreign key (household_id, recipe_id) references public.recipes (household_id, id) on delete cascade
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, sort_order);

-- -----------------------------------------------------------------------------
-- Ugeplan
-- -----------------------------------------------------------------------------
create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_date date not null,
  meal text not null default 'dinner' check (meal in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid,
  title text not null check (length(trim(title)) between 1 and 100),
  servings smallint check (servings is null or servings between 1 and 50),
  note text check (note is null or length(note) <= 300),
  sort_order smallint not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, recipe_id) references public.recipes (household_id, id) on delete set null (recipe_id)
);
create index meal_plan_entries_date_idx on public.meal_plan_entries (household_id, plan_date);
create index meal_plan_entries_recipe_idx on public.meal_plan_entries (recipe_id) where recipe_id is not null;
create trigger meal_plan_entries_updated_at before update on public.meal_plan_entries
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Priser (forberedt – fx fra kvitteringer senere: "Skyr, senest 31 kr.")
-- -----------------------------------------------------------------------------
create table public.ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  price_ore bigint not null check (price_ore >= 0),
  -- Prisen gælder for denne mængde (fx 1000 g); NULL = pr. stk./pakke
  amount_milli integer check (amount_milli is null or amount_milli > 0),
  unit text check (private.valid_unit(unit)),
  store text check (store is null or length(store) <= 60),
  observed_on date not null default current_date,
  receipt_id uuid references public.receipts (id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index ingredient_prices_name_idx on public.ingredient_prices (household_id, lower(name), observed_on desc);

-- -----------------------------------------------------------------------------
-- Indkøb: varer fra madplanen
-- -----------------------------------------------------------------------------
alter table public.shopping_items
  add column source text not null default 'manual' check (source in ('manual', 'meal_plan')),
  add column source_key text check (source_key is null or length(source_key) between 1 and 200),
  add column meal_week date check (meal_week is null or extract(isodow from meal_week) = 1);
create unique index shopping_items_source_key_uq on public.shopping_items (list_id, source_key) where source_key is not null;
grant insert (source, source_key, meal_week) on public.shopping_items to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: kun egen husstand
-- -----------------------------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.ingredient_prices enable row level security;
revoke all on public.recipes, public.recipe_ingredients, public.meal_plan_entries, public.ingredient_prices from anon;
-- Kun læsning som udgangspunkt; skrivning gives nedenfor kolonne for kolonne
revoke all on public.recipes, public.recipe_ingredients, public.meal_plan_entries, public.ingredient_prices from authenticated;
grant select on public.recipes, public.recipe_ingredients, public.meal_plan_entries, public.ingredient_prices to authenticated;

create policy "Se opskrifter" on public.recipes for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret opskrift" on public.recipes for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret opskrift" on public.recipes for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
-- Ingen sletning fra appen: arkivér (archived_at), så ugeplaner bevarer linket
grant insert (household_id, name, description, servings, prep_minutes, steps, category, tags, is_favorite, note) on public.recipes to authenticated;
grant update (name, description, servings, prep_minutes, steps, category, tags, is_favorite, note, archived_at) on public.recipes to authenticated;

create policy "Se ingredienser" on public.recipe_ingredients for select to authenticated
  using (private.is_household_member(household_id));
create policy "Tilføj ingrediens" on public.recipe_ingredients for insert to authenticated
  with check (private.is_household_member(household_id));
create policy "Slet ingrediens" on public.recipe_ingredients for delete to authenticated
  using (private.is_household_member(household_id));
grant insert (household_id, recipe_id, sort_order, name, amount_milli, unit, note) on public.recipe_ingredients to authenticated;
grant delete on public.recipe_ingredients to authenticated;

create policy "Se madplan" on public.meal_plan_entries for select to authenticated
  using (private.is_household_member(household_id));
create policy "Planlæg ret" on public.meal_plan_entries for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret madplan" on public.meal_plan_entries for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Fjern ret" on public.meal_plan_entries for delete to authenticated
  using (private.is_household_member(household_id));
grant insert (household_id, plan_date, meal, recipe_id, title, servings, note, sort_order) on public.meal_plan_entries to authenticated;
grant update (plan_date, meal, recipe_id, title, servings, note, sort_order) on public.meal_plan_entries to authenticated;
grant delete on public.meal_plan_entries to authenticated;

create policy "Se priser" on public.ingredient_prices for select to authenticated
  using (private.is_household_member(household_id));
create policy "Tilføj pris" on public.ingredient_prices for insert to authenticated
  with check (
    private.is_household_member(household_id) and created_by = (select auth.uid())
    and (receipt_id is null or exists (select 1 from public.receipts r where r.id = receipt_id and r.household_id = ingredient_prices.household_id))
  );
create policy "Slet pris" on public.ingredient_prices for delete to authenticated
  using (private.is_household_member(household_id));
grant insert (household_id, name, price_ore, amount_milli, unit, store, observed_on, receipt_id) on public.ingredient_prices to authenticated;
grant delete on public.ingredient_prices to authenticated;

-- -----------------------------------------------------------------------------
-- Gem opskrift med ingredienser i én transaktion (ny eller eksisterende)
-- -----------------------------------------------------------------------------
create or replace function public.save_recipe(p_id uuid, p_recipe jsonb, p_ingredients jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  rid uuid := p_id;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) > 100 then
    raise exception 'Højst 100 ingredienser' using errcode = 'check_violation';
  end if;

  if rid is null then
    insert into public.recipes (household_id, name, description, servings, prep_minutes, steps, category, tags, is_favorite, note)
    values (
      hid, trim(p_recipe ->> 'name'), nullif(trim(p_recipe ->> 'description'), ''), coalesce((p_recipe ->> 'servings')::smallint, 4),
      (p_recipe ->> 'prep_minutes')::smallint, nullif(trim(p_recipe ->> 'steps'), ''), nullif(trim(p_recipe ->> 'category'), ''),
      coalesce(array(select jsonb_array_elements_text(p_recipe -> 'tags')), '{}'), coalesce((p_recipe ->> 'is_favorite')::boolean, false),
      nullif(trim(p_recipe ->> 'note'), '')
    )
    returning id into rid;
  else
    update public.recipes set
      name = trim(p_recipe ->> 'name'),
      description = nullif(trim(p_recipe ->> 'description'), ''),
      servings = coalesce((p_recipe ->> 'servings')::smallint, servings),
      prep_minutes = (p_recipe ->> 'prep_minutes')::smallint,
      steps = nullif(trim(p_recipe ->> 'steps'), ''),
      category = nullif(trim(p_recipe ->> 'category'), ''),
      tags = coalesce(array(select jsonb_array_elements_text(p_recipe -> 'tags')), '{}'),
      is_favorite = coalesce((p_recipe ->> 'is_favorite')::boolean, is_favorite),
      note = nullif(trim(p_recipe ->> 'note'), '')
    where id = rid and household_id = hid;
    if not found then
      raise exception 'Opskriften findes ikke' using errcode = 'no_data_found';
    end if;
    delete from public.recipe_ingredients where recipe_id = rid;
  end if;

  insert into public.recipe_ingredients (household_id, recipe_id, sort_order, name, amount_milli, unit, note)
  select hid, rid, (i.ord - 1)::smallint, trim(i.x ->> 'name'), (i.x ->> 'amount_milli')::integer,
         nullif(i.x ->> 'unit', ''), nullif(trim(i.x ->> 'note'), '')
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) with ordinality as i(x, ord)
  where trim(coalesce(i.x ->> 'name', '')) <> '';

  return rid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Kopiér en uge (fx sidste uge) – kun til dage/måltider der er tomme i måluge
-- -----------------------------------------------------------------------------
create or replace function public.copy_meal_week(p_from date, p_to date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  n integer;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  if extract(isodow from p_from) <> 1 or extract(isodow from p_to) <> 1 or p_from = p_to then
    raise exception 'Ugerne skal starte mandag og være forskellige' using errcode = 'check_violation';
  end if;
  -- To tryk samtidig må ikke give dobbelte retter
  perform pg_advisory_xact_lock(hashtext('meal_week:' || hid::text || ':' || p_to::text));
  insert into public.meal_plan_entries (household_id, plan_date, meal, recipe_id, title, servings, note, sort_order)
  select e.household_id, e.plan_date + (p_to - p_from), e.meal, e.recipe_id, e.title, e.servings, e.note, e.sort_order
  from public.meal_plan_entries e
  where e.household_id = hid and e.plan_date >= p_from and e.plan_date < p_from + 7
    and not exists (
      select 1 from public.meal_plan_entries t
      where t.household_id = hid and t.plan_date = e.plan_date + (p_to - p_from) and t.meal = e.meal
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ugens ingredienser → fælles indkøbsliste (uden dubletter)
-- p_items: [{key, name, quantity}] – sammenlagt i appen. key identificerer ingrediensen
-- (navn + enhedstype), så samme ingrediens i samme uge altid rammer samme linje.
-- Ikke-købte linjer opdateres; allerede købte (afkrydsede) røres ikke.
-- -----------------------------------------------------------------------------
create or replace function public.add_meal_ingredients_to_shopping(p_week date, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  lid uuid;
  max_order integer;
  n integer;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  if extract(isodow from p_week) <> 1 then
    raise exception 'Ugen skal starte mandag' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'Højst 200 varer ad gangen' using errcode = 'check_violation';
  end if;
  lid := public.ensure_shopping_list();
  perform pg_advisory_xact_lock(hashtext('shopping:' || hid::text));
  select coalesce(max(sort_order), 0) into max_order from public.shopping_items where list_id = lid;

  with src as (
    select trim(x.key) as key, trim(x.name) as name, nullif(trim(x.quantity), '') as quantity, row_number() over () as rn
    from jsonb_to_recordset(p_items) as x(key text, name text, quantity text)
    where trim(coalesce(x.key, '')) <> '' and trim(coalesce(x.name, '')) <> ''
  ), up as (
    insert into public.shopping_items as si (household_id, list_id, name, quantity, sort_order, source, source_key, meal_week)
    select hid, lid, left(src.name, 80), left(src.quantity, 30), max_order + src.rn, 'meal_plan',
           left('meal:' || p_week::text || ':' || lower(src.key), 200), p_week
    from src
    on conflict (list_id, source_key) where source_key is not null
    do update set quantity = excluded.quantity, name = excluded.name
    where si.is_checked = false
    returning 1
  )
  select count(*) into n from up;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Eksport: madplan og opskrifter med
-- -----------------------------------------------------------------------------
create or replace function public.export_household_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  out jsonb;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'format', 'hjem-export',
    'version', 2,
    'exported_at', now(),
    'household', (select to_jsonb(h) from public.households h where h.id = hid),
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.profiles p
                          join public.household_members m on m.user_id = p.id where m.household_id = hid), '[]'),
    'household_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.household_members x where x.household_id = hid), '[]'),
    'budget_categories', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.budget_categories x where x.household_id = hid), '[]'),
    'budget_category_defaults', coalesce((select jsonb_agg(to_jsonb(x)) from public.budget_category_defaults x where x.household_id = hid), '[]'),
    'monthly_budgets', coalesce((select jsonb_agg(to_jsonb(x)) from public.monthly_budgets x where x.household_id = hid), '[]'),
    'transactions', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on, x.created_at) from public.transactions x where x.household_id = hid), '[]'),
    'receipts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.receipts x where x.household_id = hid), '[]'),
    'fixed_groups', coalesce((select jsonb_agg(to_jsonb(x)) from public.fixed_groups x where x.household_id = hid), '[]'),
    'fixed_items', coalesce((select jsonb_agg(to_jsonb(x)) from public.fixed_items x where x.household_id = hid), '[]'),
    'fixed_item_versions', coalesce((select jsonb_agg(to_jsonb(x)) from public.fixed_item_versions x where x.household_id = hid), '[]'),
    'upcoming_expenses', coalesce((select jsonb_agg(to_jsonb(x)) from public.upcoming_expenses x where x.household_id = hid), '[]'),
    'savings_goals', coalesce((select jsonb_agg(to_jsonb(x)) from public.savings_goals x where x.household_id = hid), '[]'),
    'savings_movements', coalesce((select jsonb_agg(to_jsonb(x)) from public.savings_movements x where x.household_id = hid), '[]'),
    'shopping_lists', coalesce((select jsonb_agg(to_jsonb(x)) from public.shopping_lists x where x.household_id = hid), '[]'),
    'shopping_items', coalesce((select jsonb_agg(to_jsonb(x)) from public.shopping_items x where x.household_id = hid), '[]'),
    'household_tasks', coalesce((select jsonb_agg(to_jsonb(x)) from public.household_tasks x where x.household_id = hid), '[]'),
    'calendar_events', coalesce((select jsonb_agg(to_jsonb(x)) from public.calendar_events x where x.household_id = hid), '[]'),
    'recipes', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.recipes x where x.household_id = hid), '[]'),
    'recipe_ingredients', coalesce((select jsonb_agg(to_jsonb(x) order by x.recipe_id, x.sort_order) from public.recipe_ingredients x where x.household_id = hid), '[]'),
    'meal_plan_entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.plan_date, x.sort_order) from public.meal_plan_entries x where x.household_id = hid), '[]'),
    'ingredient_prices', coalesce((select jsonb_agg(to_jsonb(x) order by x.observed_on) from public.ingredient_prices x where x.household_id = hid), '[]')
  ) into out;
  return out;
end;
$$;

revoke all on function private.valid_unit(text) from public, anon;
revoke all on function private.valid_tags(text[]) from public, anon;
grant execute on function private.valid_unit(text) to authenticated;
grant execute on function private.valid_tags(text[]) to authenticated;
revoke all on function public.save_recipe(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.copy_meal_week(date, date) from public, anon;
revoke all on function public.add_meal_ingredients_to_shopping(date, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.copy_meal_week(date, date) to authenticated;
grant execute on function public.add_meal_ingredients_to_shopping(date, jsonb) to authenticated;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
