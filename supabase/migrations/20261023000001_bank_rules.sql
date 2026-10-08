-- =============================================================================
-- Bank: husk butikken, godkend alle med forslag, kortere første hentning
-- =============================================================================
-- * Når en udgift fra banken godkendes med en kategori, huskes butikken (pr. bruger).
--   Andre ventende og fremtidige posteringer fra samme butik godkendes automatisk
--   i samme kategori. Reglen kan slås fra under Indstillinger → Bank.
-- * Mulige dubletter (fx en scannet kvittering) godkendes aldrig automatisk.
-- * "Godkend alle med forslag": alle nye udgifter med kategoriforslag på én gang.
-- * Første hentning: 30 dage (før: 90). Senere hentninger overlapper med 5 dage.
-- =============================================================================

create table private.bank_merchant_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  merchant_key text not null check (length(merchant_key) between 1 and 140),
  label text not null check (length(label) between 1 and 140),
  category_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id, merchant_key)
);
revoke all on private.bank_merchant_rules from public, anon, authenticated;

-- Samme butik genkendes på modpartens navn, ellers på teksten uden tal (fx "NETTO 1234 AARHUS" → "netto aarhus")
create or replace function private.merchant_key(p_counterparty text, p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(trim(regexp_replace(regexp_replace(lower(coalesce(nullif(trim(p_counterparty), ''), p_description, '')),
    '[0-9#*/.,:-]+', ' ', 'g'), '\s+', ' ', 'g')), 140), '')
$$;

-- Godkend én udgift i en kategori (fælles for manuel, regel og "godkend alle").
-- Forudsætter at kalderen har låst rækken og tjekket adgang.
create or replace function private.bank_import_expense(b public.bank_transactions, p_category uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id, source, created_by)
  values (b.household_id, p_category, -b.amount_ore, b.booked_on,
          left(coalesce(nullif(trim(p_description), ''), nullif(trim(b.counterparty), ''), b.description), 80),
          'member', b.user_id, 'bank', b.user_id)
  returning id into new_id;
  update public.bank_transactions set state = 'imported', transaction_id = new_id where id = b.id;
  return new_id;
end;
$$;

-- Anvend brugerens regel for en butik på ventende posteringer (ikke mulige dubletter)
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
  if not found or not exists (
    select 1 from public.budget_categories c where c.id = rule.category_id and c.household_id = p_household and c.archived_at is null
  ) or not private.has_write_access(p_household) then
    return 0;
  end if;
  for b in
    select * from public.bank_transactions x
    where x.household_id = p_household and x.user_id = p_user and x.state = 'new' and x.amount_ore < 0
      and x.possible_duplicate_id is null
      and private.merchant_key(x.counterparty, x.description) = p_key
    for update
  loop
    perform private.bank_import_expense(b, rule.category_id, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Godkend: som før, men en udgift husker nu butikken og tager de ventende fra samme butik med
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
  descr := left(coalesce(nullif(trim(p_description), ''), nullif(trim(b.counterparty), ''), b.description), 80);
  if b.amount_ore < 0 then
    if p_category_id is null or not exists (
      select 1 from public.budget_categories c where c.id = p_category_id and c.household_id = b.household_id and c.archived_at is null
    ) then
      raise exception 'Vælg en kategori' using errcode = 'check_violation';
    end if;
    new_id := private.bank_import_expense(b, p_category_id, descr);
    k := private.merchant_key(b.counterparty, b.description);
    if k is not null then
      insert into private.bank_merchant_rules (household_id, user_id, merchant_key, label, category_id)
      values (b.household_id, b.user_id, k, left(coalesce(nullif(trim(b.counterparty), ''), descr), 140), p_category_id)
      on conflict (household_id, user_id, merchant_key)
      do update set category_id = excluded.category_id, label = excluded.label, active = true, updated_at = now();
      perform private.bank_apply_rule(b.household_id, b.user_id, k);
    end if;
  else
    insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source, created_by)
    values (b.household_id, b.amount_ore, b.booked_on, descr, 'member', b.user_id, 'bank', b.user_id)
    returning id into new_id;
    update public.bank_transactions set state = 'imported', income_id = new_id where id = b.id;
  end if;
  return new_id;
end;
$$;

-- Godkend alle nye udgifter med kategoriforslag (ikke mulige dubletter). Returnerer antallet.
create or replace function public.bank_import_suggested()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  b public.bank_transactions;
  n integer := 0;
begin
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  if not private.has_write_access(hid) then
    raise exception 'Abonnementet er udløbet. I kan se og eksportere jeres data, men ikke ændre noget, før abonnementet er fornyet.' using errcode = 'PT402';
  end if;
  for b in
    select x.* from public.bank_transactions x
    join public.budget_categories c on c.id = x.suggested_category_id and c.household_id = hid and c.archived_at is null
    where x.household_id = hid and x.user_id = auth.uid() and x.state = 'new' and x.amount_ore < 0
      and x.possible_duplicate_id is null
    order by x.booked_on
    for update of x
  loop
    perform private.bank_import_expense(b, b.suggested_category_id, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Huskede butikker (til Indstillinger → Bank)
create or replace function public.bank_rules_list()
returns table (id uuid, label text, category_id uuid, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.label, r.category_id, r.updated_at
  from private.bank_merchant_rules r
  where r.user_id = auth.uid() and r.household_id = public.current_household_id() and r.active
    and private.is_household_member(r.household_id)
  order by lower(r.label);
$$;

create or replace function public.bank_rule_disable(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.bank_merchant_rules set active = false, updated_at = now()
  where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'Reglen findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Hentning: første gang 30 dage, derefter fra sidste hentning minus 5 dage (højst 90)
create or replace function public.bank_sync_targets(p_user uuid default null)
returns table (connection_id uuid, user_id uuid, session_id text, account_id uuid, account_uid text, since date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.bank_connections set status = 'expired', session_id = null
  where status = 'active' and valid_until <= now();
  return query
    select c.id, c.user_id, c.session_id, a.id, a.account_uid,
      greatest(coalesce(c.last_synced_at::date - 5, current_date - 30), current_date - 90)
    from private.bank_connections c
    join private.bank_accounts a on a.connection_id = c.id
    where c.status = 'active' and (p_user is null or c.user_id = p_user)
    order by c.id;
end;
$$;

-- Indlæsning: som før + huskede butikker godkendes automatisk
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
         where m.household_id = acc.household_id and m.user_id = acc.user_id and m.active and m.merchant_key = private.merchant_key(cp, txt)),
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

    -- Samme beløb ind og ud samme dag mellem to af husstandens forbundne konti = overførsel
    if st = 'new' then
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
  -- Huskede butikker godkendes automatisk
  foreach k in array keys loop
    perform private.bank_apply_rule(acc.household_id, acc.user_id, k);
  end loop;
  return inserted;
end;
$$;

revoke all on function private.merchant_key(text, text) from public, anon, authenticated;
revoke all on function private.bank_import_expense(public.bank_transactions, uuid, text) from public, anon, authenticated;
revoke all on function private.bank_apply_rule(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bank_import_suggested() from public, anon;
revoke all on function public.bank_rules_list() from public, anon;
revoke all on function public.bank_rule_disable(uuid) from public, anon;
grant execute on function public.bank_import_suggested() to authenticated;
grant execute on function public.bank_rules_list() to authenticated;
grant execute on function public.bank_rule_disable(uuid) to authenticated;
