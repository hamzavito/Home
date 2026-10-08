-- =============================================================================
-- Bank: faste udgifter fra posteringer + indtægter automatisk
-- =============================================================================
-- * En udgift fra banken kan markeres som fast udgift: der oprettes en fast post
--   (eller den kobles til en eksisterende). Posteringen tæller så ikke med som
--   variabel udgift (den faste post står allerede i planen). Fremtidige
--   posteringer fra samme modtager genkendes automatisk som samme faste udgift.
-- * Indtægter (alt der kommer ind, undtagen overførsler mellem egne konti)
--   godkendes automatisk som indtægt – også dem, der allerede venter.
-- =============================================================================

alter table public.bank_transactions drop constraint bank_transactions_state_check;
alter table public.bank_transactions add constraint bank_transactions_state_check
  check (state in ('new', 'imported', 'ignored', 'transfer', 'fixed'));
alter table public.bank_transactions add column fixed_item_id uuid references public.fixed_items (id) on delete set null;

alter table private.bank_merchant_rules add column kind text not null default 'category' check (kind in ('category', 'fixed'));
alter table private.bank_merchant_rules add column fixed_item_id uuid references public.fixed_items (id) on delete cascade;
alter table private.bank_merchant_rules alter column category_id drop not null;
alter table private.bank_merchant_rules add constraint bank_merchant_rules_kind_target
  check ((kind = 'category' and category_id is not null) or (kind = 'fixed' and fixed_item_id is not null));

-- -----------------------------------------------------------------------------
-- Hjælpere
-- -----------------------------------------------------------------------------
create or replace function private.bank_import_income(b public.bank_transactions)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source, created_by)
  values (b.household_id, b.amount_ore, b.booked_on,
          left(coalesce(nullif(trim(b.counterparty), ''), b.description), 80), 'member', b.user_id, 'bank', b.user_id)
  returning id into new_id;
  update public.bank_transactions set state = 'imported', income_id = new_id where id = b.id;
  return new_id;
end;
$$;

-- Er den faste post gyldig for husstanden (udgift, ikke arkiveret)?
create or replace function private.valid_fixed_expense(p_household uuid, p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fixed_items i
    where i.id = p_item and i.household_id = p_household and i.kind = 'expense' and i.archived_at is null
  );
$$;

-- Huskede butikker: kategori (godkend som udgift) eller fast udgift (frasortér)
create or replace function private.bank_apply_rule(p_household uuid, p_user uuid, p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule private.bank_merchant_rules;
  b public.bank_transactions;
  n integer := 0;
begin
  select * into rule from private.bank_merchant_rules
  where household_id = p_household and user_id = p_user and merchant_key = p_key and active;
  if not found or not private.has_write_access(p_household) then
    return 0;
  end if;
  if rule.kind = 'category' and not exists (
    select 1 from public.budget_categories c where c.id = rule.category_id and c.household_id = p_household and c.archived_at is null
  ) then
    return 0;
  end if;
  if rule.kind = 'fixed' and not private.valid_fixed_expense(p_household, rule.fixed_item_id) then
    return 0;
  end if;
  for b in
    select * from public.bank_transactions x
    where x.household_id = p_household and x.user_id = p_user and x.state = 'new' and x.amount_ore < 0
      and x.possible_duplicate_id is null
      and private.merchant_key(x.counterparty, x.description) = p_key
    for update
  loop
    if rule.kind = 'fixed' then
      update public.bank_transactions set state = 'fixed', fixed_item_id = rule.fixed_item_id where id = b.id;
    else
      perform private.bank_import_expense(b, rule.category_id, null);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Til appen
-- -----------------------------------------------------------------------------
create or replace function public.bank_import(p_id uuid, p_category_id uuid default null, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bank_transactions;
  new_id uuid;
  descr text;
  k text;
begin
  select * into b from public.bank_transactions where id = p_id for update;
  if not found or b.user_id <> auth.uid() or not private.is_household_member(b.household_id) then
    raise exception 'Posteringen findes ikke' using errcode = 'no_data_found';
  end if;
  if b.state = 'imported' then
    return coalesce(b.transaction_id, b.income_id); -- dobbelttryk
  end if;
  if not private.has_write_access(b.household_id) then
    raise exception 'Abonnementet er udløbet. I kan se og eksportere jeres data, men ikke ændre noget, før abonnementet er fornyet.' using errcode = 'PT402';
  end if;
  if b.amount_ore > 0 then
    if nullif(trim(p_description), '') is not null then
      b.counterparty := left(trim(p_description), 140);
    end if;
    return private.bank_import_income(b);
  end if;
  descr := left(coalesce(nullif(trim(p_description), ''), nullif(trim(b.counterparty), ''), b.description), 80);
  if p_category_id is null or not exists (
    select 1 from public.budget_categories c where c.id = p_category_id and c.household_id = b.household_id and c.archived_at is null
  ) then
    raise exception 'Vælg en kategori' using errcode = 'check_violation';
  end if;
  new_id := private.bank_import_expense(b, p_category_id, descr);
  k := private.merchant_key(b.counterparty, b.description);
  if k is not null then
    insert into private.bank_merchant_rules (household_id, user_id, merchant_key, label, kind, category_id, fixed_item_id)
    values (b.household_id, b.user_id, k, left(coalesce(nullif(trim(b.counterparty), ''), descr), 140), 'category', p_category_id, null)
    on conflict (household_id, user_id, merchant_key)
    do update set kind = 'category', category_id = excluded.category_id, fixed_item_id = null, label = excluded.label, active = true, updated_at = now();
    perform private.bank_apply_rule(b.household_id, b.user_id, k);
  end if;
  return new_id;
end;
$$;

-- Markér en udgift som fast udgift: ny fast post (p_item_id null) eller en eksisterende.
-- Returnerer den faste posts id.
create or replace function public.bank_mark_fixed(
  p_id uuid,
  p_item_id uuid default null,
  p_name text default null,
  p_group_id uuid default null,
  p_frequency text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bank_transactions;
  item uuid := p_item_id;
  k text;
  nm text;
begin
  select * into b from public.bank_transactions where id = p_id for update;
  if not found or b.user_id <> auth.uid() or not private.is_household_member(b.household_id) then
    raise exception 'Posteringen findes ikke' using errcode = 'no_data_found';
  end if;
  if b.amount_ore >= 0 then
    raise exception 'Kun udgifter kan være faste udgifter' using errcode = 'check_violation';
  end if;
  if b.state = 'fixed' and (p_item_id is null or b.fixed_item_id = p_item_id) then
    return b.fixed_item_id; -- dobbelttryk
  end if;
  if b.state not in ('new', 'ignored', 'fixed') then
    raise exception 'Posteringen er allerede behandlet' using errcode = 'check_violation';
  end if;
  if not private.has_write_access(b.household_id) then
    raise exception 'Abonnementet er udløbet. I kan se og eksportere jeres data, men ikke ændre noget, før abonnementet er fornyet.' using errcode = 'PT402';
  end if;

  if item is null then
    if p_group_id is null or not exists (
      select 1 from public.fixed_groups g where g.id = p_group_id and g.household_id = b.household_id and g.archived_at is null
    ) then
      raise exception 'Vælg en gruppe' using errcode = 'check_violation';
    end if;
    if coalesce(p_frequency, 'monthly') not in ('monthly', 'quarterly', 'yearly') then
      raise exception 'Ugyldig hyppighed' using errcode = 'check_violation';
    end if;
    nm := left(coalesce(nullif(trim(p_name), ''), nullif(trim(b.counterparty), ''), b.description), 60);
    item := public.create_fixed_item(
      'expense', nm, -b.amount_ore, coalesce(p_frequency, 'monthly'),
      case when coalesce(p_frequency, 'monthly') = 'monthly' then null else extract(month from b.booked_on)::smallint end,
      p_group_id, null, null, extract(day from b.booked_on)::smallint, null, null);
  elsif not private.valid_fixed_expense(b.household_id, item) then
    raise exception 'Den faste udgift findes ikke' using errcode = 'no_data_found';
  end if;

  update public.bank_transactions set state = 'fixed', fixed_item_id = item where id = b.id;
  k := private.merchant_key(b.counterparty, b.description);
  if k is not null then
    insert into private.bank_merchant_rules (household_id, user_id, merchant_key, label, kind, category_id, fixed_item_id)
    values (b.household_id, b.user_id, k, left(coalesce(nullif(trim(b.counterparty), ''), b.description), 140), 'fixed', null, item)
    on conflict (household_id, user_id, merchant_key)
    do update set kind = 'fixed', fixed_item_id = excluded.fixed_item_id, category_id = null, active = true, updated_at = now();
    perform private.bank_apply_rule(b.household_id, b.user_id, k);
  end if;
  return item;
end;
$$;

-- "Tag med alligevel" virker også på faste udgifter
create or replace function public.bank_set_ignored(p_id uuid, p_ignored boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bank_transactions b
     set state = case when p_ignored then 'ignored' else 'new' end,
         fixed_item_id = null
   where b.id = p_id and b.user_id = auth.uid() and private.is_household_member(b.household_id)
     and b.state in ('new', 'ignored', 'transfer', 'fixed');
  if not found then
    raise exception 'Posteringen findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Huskede butikker med type (kategori eller fast udgift)
create or replace function public.bank_rules()
returns table (id uuid, label text, kind text, category_id uuid, fixed_item_id uuid, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.label, r.kind, r.category_id, r.fixed_item_id, r.updated_at
  from private.bank_merchant_rules r
  where r.user_id = auth.uid() and r.household_id = public.current_household_id() and r.active
    and private.is_household_member(r.household_id)
  order by lower(r.label);
$$;

-- -----------------------------------------------------------------------------
-- Indlæsning: huskede butikker kan nu også være faste udgifter
-- -----------------------------------------------------------------------------
create or replace function public.bank_ingest(p_account_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc private.bank_accounts;
  r jsonb;
  amt bigint;
  d date;
  txt text;
  cp text;
  st text;
  inserted int := 0;
  new_id uuid;
  partner uuid;
  keys text[] := '{}';
  k text;
begin
  select * into acc from private.bank_accounts where id = p_account_id;
  if not found then
    raise exception 'Kontoen findes ikke' using errcode = 'no_data_found';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    -- Reservationer (ikke bogført) springes over – de kommer, når de er endelige
    continue when coalesce((r ->> 'pending')::boolean, false);
    amt := (r ->> 'amount_ore')::bigint;
    continue when amt is null or amt = 0;
    d := (r ->> 'booked_on')::date;
    txt := left(coalesce(nullif(trim(r ->> 'description'), ''), nullif(trim(r ->> 'counterparty'), ''), 'Postering'), 140);
    cp := left(nullif(trim(r ->> 'counterparty'), ''), 140);
    -- Overførsel til/fra en af husstandens egne forbundne konti
    st := case when exists (
      select 1 from private.bank_accounts o
      where o.household_id = acc.household_id and o.id <> acc.id
        and o.iban_hash is not null and o.iban_hash = private.iban_hash(r ->> 'counterparty_iban')
    ) then 'transfer' else 'new' end;

    insert into public.bank_transactions (household_id, user_id, account_id, external_id, booked_on, amount_ore, description, counterparty, state,
      suggested_category_id, possible_duplicate_id)
    values (acc.household_id, acc.user_id, acc.id, r ->> 'external_id', d, amt, txt, cp, st,
      case when amt < 0 then coalesce(
        (select m.category_id from private.bank_merchant_rules m
         where m.household_id = acc.household_id and m.user_id = acc.user_id and m.active and m.kind = 'category'
           and m.merchant_key = private.merchant_key(cp, txt)),
        private.suggest_category_for(acc.household_id, coalesce(cp, txt)),
        private.suggest_category_for(acc.household_id, txt)) end,
      case when amt < 0 then (
        select t.id from public.transactions t
        where t.household_id = acc.household_id and t.amount_ore = -amt and t.source <> 'bank'
          and t.occurred_on between d - 3 and d + 3
          and not exists (select 1 from public.bank_transactions x where x.transaction_id = t.id)
        order by abs(t.occurred_on - d), t.created_at
        limit 1) end)
    on conflict (household_id, external_id) do nothing
    returning id into new_id;
    continue when new_id is null;
    inserted := inserted + 1;

    if st = 'new' then
      -- Samme beløb ind og ud samme dag mellem to af husstandens forbundne konti = overførsel
      select x.id into partner from public.bank_transactions x
      where x.household_id = acc.household_id and x.account_id <> acc.id and x.state = 'new'
        and x.booked_on = d and x.amount_ore = -amt
      order by x.created_at limit 1;
      if partner is not null then
        update public.bank_transactions set state = 'transfer' where id in (new_id, partner);
      elsif amt < 0 then
        k := private.merchant_key(cp, txt);
        if k is not null and not k = any (keys) then
          keys := keys || k;
        end if;
      end if;
    end if;
  end loop;
  -- Huskede butikker (kategori eller fast udgift)
  foreach k in array keys loop
    perform private.bank_apply_rule(acc.household_id, acc.user_id, k);
  end loop;
  return inserted;
end;
$$;

-- Indtægter godkendes automatisk: alt der kommer ind og ikke er en overførsel mellem
-- egne konti. Kaldes af Edge Functionen EFTER at alle konti er hentet (så overførsler
-- mellem egne konti er parret først). p_user null = alle (det daglige job).
create or replace function public.bank_auto_income(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bank_transactions;
  n integer := 0;
begin
  for b in
    select x.* from public.bank_transactions x
    where x.state = 'new' and x.amount_ore > 0 and (p_user is null or x.user_id = p_user)
    order by x.booked_on
    for update of x
  loop
    continue when not private.has_write_access(b.household_id);
    perform private.bank_import_income(b);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Indtægter, der allerede venter, godkendes nu
select public.bank_auto_income(null);

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.bank_import_income(public.bank_transactions) from public, anon, authenticated;
revoke all on function private.valid_fixed_expense(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bank_mark_fixed(uuid, uuid, text, uuid, text) from public, anon;
revoke all on function public.bank_rules() from public, anon;
grant execute on function public.bank_mark_fixed(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.bank_rules() to authenticated;
revoke all on function public.bank_auto_income(uuid) from public, anon, authenticated;
grant execute on function public.bank_auto_income(uuid) to service_role;
