-- =============================================================================
-- Familieoplysninger: hvem bor i husstanden (uafhængigt af hvem der har login)
-- =============================================================================
-- To begreber holdes adskilt:
--   1. Familiens sammensætning (households.adults + household_children):
--      bruges til budgetforslag. Et barn behøver ikke en konto i appen.
--   2. Medlemmer med login (household_members): adgang, roller, opgaver,
--      kalender, lommepenge osv.
-- Et barn i familieoplysningerne kan kobles til et barn med login
-- (member_user_id), så barnet aldrig tælles to gange. Koblingen er frivillig.
-- Senere kan modellen udvides med fx deleordning (bor fast/delvist).
-- =============================================================================

-- Antal voksne i familien. Tomt = antal voksne med login.
alter table public.households
  add column adults smallint check (adults between 1 and 12);
grant update (adults) on public.households to authenticated;

create table public.household_children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  born_on date not null check (born_on <= current_date and born_on > current_date - interval '30 years'),
  -- Barnets login i appen, hvis det har et (frivilligt; aldrig to gange)
  member_user_id uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, member_user_id),
  foreign key (household_id, member_user_id) references public.household_members (household_id, user_id) on delete set null (member_user_id)
);
create index household_children_household_idx on public.household_children (household_id, born_on);
create trigger household_children_updated_at before update on public.household_children
  for each row execute function private.set_updated_at();
create trigger household_children_write_access before insert or update or delete on public.household_children
  for each row execute function private.enforce_write_access();

-- Koblingen skal pege på et barn (ikke en voksen) i samme husstand
create or replace function private.household_children_check_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.member_user_id is not null and not exists (
    select 1 from public.household_members m
    where m.household_id = new.household_id and m.user_id = new.member_user_id and m.role = 'child' and m.left_at is null
  ) then
    raise exception 'Barnet findes ikke i husstanden' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger household_children_check_member before insert or update of member_user_id on public.household_children
  for each row execute function private.household_children_check_member();

alter table public.household_children enable row level security;
create policy "Se familiens børn" on public.household_children for select to authenticated
  using (private.is_household_member(household_id));
create policy "Tilføj barn i familien" on public.household_children for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret barn i familien" on public.household_children for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Fjern barn fra familien" on public.household_children for delete to authenticated
  using (private.is_household_member(household_id));
revoke all on public.household_children from public, anon;
revoke insert, update, delete, truncate on public.household_children from authenticated;
grant insert (household_id, name, born_on, member_user_id) on public.household_children to authenticated;
grant update (name, born_on, member_user_id) on public.household_children to authenticated;

-- -----------------------------------------------------------------------------
-- Input til budgetmotoren: {"adults": 2, "children": [{"age": 3}, {"age": 10}]}
-- Kommer fra familieoplysningerne – ikke fra antallet af børn med login.
-- -----------------------------------------------------------------------------
create or replace function public.household_composition(p_on date default current_date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'adults', coalesce(
      (select h.adults from public.households h where h.id = public.current_household_id()),
      (select count(*) from public.household_members m
       where m.household_id = public.current_household_id() and m.role <> 'child' and m.left_at is null and m.disabled_at is null)),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'born_on', c.born_on,
        'age', extract(year from age(p_on, c.born_on))::int,
        'user_id', c.member_user_id
      ) order by c.born_on, c.name)
      from public.household_children c where c.household_id = public.current_household_id()), '[]'::jsonb),
    'source', 'family_info'
  );
$$;
revoke all on function public.household_composition(date) from public, anon;
grant execute on function public.household_composition(date) to authenticated;
revoke all on function private.household_children_check_member() from public, anon, authenticated;

-- Eksport/backup tager familieoplysningerne med
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
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Kun voksne kan eksportere' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'format', 'hjem-export',
    'version', 6,
    'exported_at', now(),
    'household', (select to_jsonb(h) from public.households h where h.id = hid),
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.profiles p
                          join public.household_members m on m.user_id = p.id where m.household_id = hid), '[]'),
    'household_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.household_members x where x.household_id = hid), '[]'),
    'household_children', coalesce((select jsonb_agg(to_jsonb(x) order by x.born_on) from public.household_children x where x.household_id = hid), '[]'),
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
    'ingredient_prices', coalesce((select jsonb_agg(to_jsonb(x) order by x.observed_on) from public.ingredient_prices x where x.household_id = hid), '[]'),
    'child_savings_goals', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.child_savings_goals x where x.household_id = hid), '[]'),
    'child_wallet_transactions', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on, x.created_at) from public.child_wallet_transactions x where x.household_id = hid), '[]'),
    'child_allowance_schedules', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.child_allowance_schedules x where x.household_id = hid), '[]'),
    'child_allowance_payouts', coalesce((select jsonb_agg(to_jsonb(x) order by x.due_on) from public.child_allowance_payouts x where x.household_id = hid), '[]'),
    'income_entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.received_on, x.created_at) from public.income_entries x where x.household_id = hid), '[]')
  ) into out;
  return out;
end;
$$;
