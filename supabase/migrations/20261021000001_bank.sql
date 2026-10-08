-- =============================================================================
-- Bankforbindelse (Enable Banking, PSD2) og indtægter
-- =============================================================================
-- * Hver voksen forbinder sine EGNE konti (MitID hos banken). Adgangen er kun
--   til at læse og gælder højst 180 dage.
-- * Vi gemmer kun det nødvendige: dato, beløb, tekst og modpartens navn.
--   Ingen saldo, ingen kontonumre (egne kontonumre kun som hash, så overførsler
--   mellem egne konti kan genkendes).
-- * Posteringer lander i en indbakke, som KUN den, der har forbundet kontoen,
--   kan se. Først når de godkendes, bliver de til husstandens udgifter/indtægter.
-- * Frasorteres automatisk: reservationer (ikke bogført), overførsler mellem
--   husstandens egne konti. Mulige dubletter (fx fra en scannet kvittering)
--   markeres, så de kan kobles i stedet for at blive oprettet to gange.
-- * Edge Function "bank" taler med Enable Banking (service role); appen bruger
--   kun RPC'erne nedenfor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Indtægter
-- -----------------------------------------------------------------------------
create table public.income_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  amount_ore bigint not null check (amount_ore between 1 and 100000000000),
  received_on date not null,
  description text not null check (length(trim(description)) between 1 and 80),
  note text check (note is null or length(note) <= 1000),
  received_by_kind text not null default 'member' check (received_by_kind in ('member', 'shared')),
  received_by_user_id uuid,
  source text not null default 'manual' check (source in ('manual', 'bank')),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_received_by_consistent check ((received_by_kind = 'member') = (received_by_user_id is not null)),
  foreign key (household_id, received_by_user_id) references public.household_members (household_id, user_id) on delete restrict,
  unique (household_id, id)
);
create index income_entries_household_date_idx on public.income_entries (household_id, received_on desc);
create trigger income_entries_updated_at before update on public.income_entries
  for each row execute function private.set_updated_at();
create trigger income_entries_write_access before insert or update on public.income_entries
  for each row execute function private.enforce_write_access();
alter table public.income_entries enable row level security;
revoke all on public.income_entries from anon;
create policy "Se husstandens indtægter" on public.income_entries
  for select to authenticated using (private.is_household_member(household_id));
create policy "Opret indtægt" on public.income_entries
  for insert to authenticated with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Redigér indtægt" on public.income_entries
  for update to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Slet indtægt" on public.income_entries
  for delete to authenticated using (private.is_household_member(household_id));
revoke insert, update, truncate on public.income_entries from authenticated;
grant insert (household_id, amount_ore, received_on, description, note, received_by_kind, received_by_user_id) on public.income_entries to authenticated;
grant update (amount_ore, received_on, description, note, received_by_kind, received_by_user_id) on public.income_entries to authenticated;

-- Udgifter kan nu også komme fra banken
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'receipt', 'upcoming', 'bank'));

-- -----------------------------------------------------------------------------
-- Forbindelser og konti (private – kun via funktioner)
-- -----------------------------------------------------------------------------
create table private.bank_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  aspsp_name text not null check (length(aspsp_name) between 1 and 120),
  aspsp_country text not null default 'DK' check (aspsp_country ~ '^[A-Z]{2}$'),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  session_id text,
  valid_until timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  last_synced_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 300)
);
create index bank_connections_user_idx on private.bank_connections (user_id, status);

create table private.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references private.bank_connections (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  account_uid text not null unique check (length(account_uid) between 1 and 200),
  name text not null check (length(name) between 1 and 120),
  iban_hash text check (iban_hash ~ '^[0-9a-f]{64}$'),
  currency text not null default 'DKK',
  created_at timestamptz not null default now()
);
create index bank_accounts_household_idx on private.bank_accounts (household_id);
revoke all on private.bank_connections, private.bank_accounts from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Indbakke (kun ejeren af forbindelsen kan se sine posteringer)
-- -----------------------------------------------------------------------------
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null,
  account_id uuid not null references private.bank_accounts (id) on delete cascade,
  external_id text not null check (external_id ~ '^[0-9a-f]{64}$'),
  booked_on date not null,
  -- Negativ = udgift, positiv = indtægt
  amount_ore bigint not null check (amount_ore <> 0 and abs(amount_ore) <= 100000000000),
  description text not null check (length(description) between 1 and 140),
  counterparty text check (counterparty is null or length(counterparty) <= 140),
  state text not null default 'new' check (state in ('new', 'imported', 'ignored', 'transfer')),
  suggested_category_id uuid,
  possible_duplicate_id uuid references public.transactions (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  income_id uuid references public.income_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, external_id)
);
create index bank_transactions_inbox_idx on public.bank_transactions (user_id, state, booked_on desc);
create trigger bank_transactions_updated_at before update on public.bank_transactions
  for each row execute function private.set_updated_at();
create trigger bank_transactions_write_access before insert or update on public.bank_transactions
  for each row execute function private.enforce_write_access();
alter table public.bank_transactions enable row level security;
revoke all on public.bank_transactions from anon, authenticated;
grant select on public.bank_transactions to authenticated;
create policy "Egne bankposteringer" on public.bank_transactions
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- Hjælpere
-- -----------------------------------------------------------------------------
create or replace function private.iban_hash(p_iban text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_iban, '') = '' then null
    else encode(extensions.digest(upper(regexp_replace(p_iban, '\s', '', 'g')), 'sha256'), 'hex') end
$$;

create or replace function private.suggest_category_for(p_household uuid, p_text text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select t.category_id, t.occurred_on, t.created_at
    from public.transactions t
    join public.budget_categories c on c.id = t.category_id and c.archived_at is null
    where t.household_id = p_household
      and lower(trim(t.description)) = lower(trim(p_text))
    order by t.occurred_on desc, t.created_at desc
    limit 50
  )
  select category_id from recent group by category_id
  order by count(*) desc, max(occurred_on) desc, max(created_at) desc
  limit 1;
$$;

-- Når et medlem forlader husstanden: deres bankforbindelser stoppes, og
-- ubehandlede posteringer fjernes (de godkendte er husstandens og bliver).
create or replace function private.member_depart(p_household uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  delete from public.push_subscriptions where user_id = p_user;
  update private.bank_connections set status = 'revoked', session_id = null
   where household_id = p_household and user_id = p_user and status in ('pending', 'active');
  delete from public.bank_transactions where household_id = p_household and user_id = p_user and state <> 'imported';
end;
$$;

-- -----------------------------------------------------------------------------
-- Til appen
-- -----------------------------------------------------------------------------
create or replace function public.bank_connection_list()
returns table (id uuid, aspsp_name text, status text, valid_until timestamptz, last_synced_at timestamptz, last_error text, accounts text[])
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.aspsp_name,
    case when c.status = 'active' and c.valid_until <= now() then 'expired' else c.status end,
    c.valid_until, c.last_synced_at, c.last_error,
    coalesce((select array_agg(a.name order by a.name) from private.bank_accounts a where a.connection_id = c.id), '{}')
  from private.bank_connections c
  where c.user_id = auth.uid()
    and c.household_id = public.current_household_id()
    and private.is_household_member(c.household_id)
    and c.status in ('active', 'expired')
  order by c.created_at;
$$;

-- Godkend en postering: udgift (kræver kategori) eller indtægt. Returnerer id'et.
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
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id, source, created_by)
    values (b.household_id, p_category_id, -b.amount_ore, b.booked_on, descr, 'member', b.user_id, 'bank', b.user_id)
    returning id into new_id;
    update public.bank_transactions set state = 'imported', transaction_id = new_id where id = b.id;
  else
    insert into public.income_entries (household_id, amount_ore, received_on, description, received_by_kind, received_by_user_id, source, created_by)
    values (b.household_id, b.amount_ore, b.booked_on, descr, 'member', b.user_id, 'bank', b.user_id)
    returning id into new_id;
    update public.bank_transactions set state = 'imported', income_id = new_id where id = b.id;
  end if;
  return new_id;
end;
$$;

-- Allerede registreret (fx scannet kvittering): kobl i stedet for at oprette igen
create or replace function public.bank_link_existing(p_id uuid, p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bank_transactions;
begin
  select * into b from public.bank_transactions where id = p_id for update;
  if not found or b.user_id <> auth.uid() or not private.is_household_member(b.household_id) then
    raise exception 'Posteringen findes ikke' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.transactions t where t.id = p_transaction_id and t.household_id = b.household_id) then
    raise exception 'Udgiften findes ikke' using errcode = 'no_data_found';
  end if;
  update public.bank_transactions set state = 'imported', transaction_id = p_transaction_id, possible_duplicate_id = null where id = b.id;
end;
$$;

create or replace function public.bank_set_ignored(p_id uuid, p_ignored boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bank_transactions b
     set state = case when p_ignored then 'ignored' else 'new' end
   where b.id = p_id and b.user_id = auth.uid() and private.is_household_member(b.household_id)
     and b.state in ('new', 'ignored', 'transfer');
  if not found then
    raise exception 'Posteringen findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Til Edge Function "bank" (kun service_role)
-- -----------------------------------------------------------------------------
create or replace function public.bank_connection_start(p_user uuid, p_aspsp text, p_country text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.household_members;
  cid uuid;
begin
  select * into m from public.household_members where user_id = p_user and left_at is null and disabled_at is null and role <> 'child';
  if not found then
    raise exception 'Kun voksne i en husstand kan forbinde en bank' using errcode = 'insufficient_privilege';
  end if;
  if not private.has_write_access(m.household_id) then
    raise exception 'Abonnementet er udløbet' using errcode = 'PT402';
  end if;
  if (select count(*) from private.bank_connections where user_id = p_user and status in ('pending', 'active') and created_at > now() - interval '1 day') >= 10 then
    raise exception 'For mange forsøg i dag' using errcode = 'check_violation';
  end if;
  -- Forladte forsøg ryddes op
  delete from private.bank_connections where user_id = p_user and status = 'pending' and created_at < now() - interval '1 hour';
  insert into private.bank_connections (household_id, user_id, aspsp_name, aspsp_country, state_hash)
  values (m.household_id, p_user, p_aspsp, upper(p_country), encode(extensions.digest(p_state, 'sha256'), 'hex'))
  returning id into cid;
  return cid;
end;
$$;

-- p_accounts: [{ "uid": "...", "name": "Lønkonto", "iban": "DK...", "currency": "DKK" }]
create or replace function public.bank_connection_activate(p_user uuid, p_state text, p_session text, p_valid_until timestamptz, p_accounts jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c private.bank_connections;
  a jsonb;
begin
  select * into c from private.bank_connections
  where state_hash = encode(extensions.digest(p_state, 'sha256'), 'hex') and user_id = p_user and status = 'pending'
    and created_at > now() - interval '1 hour'
  for update;
  if not found then
    raise exception 'Forbindelsen findes ikke eller er udløbet' using errcode = 'no_data_found';
  end if;
  update private.bank_connections
     set status = 'active', session_id = p_session, valid_until = p_valid_until, activated_at = now()
   where id = c.id;
  for a in select * from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) loop
    insert into private.bank_accounts (connection_id, household_id, user_id, account_uid, name, iban_hash, currency)
    values (c.id, c.household_id, p_user, a ->> 'uid',
            left(coalesce(nullif(trim(a ->> 'name'), ''), 'Konto'), 120),
            private.iban_hash(a ->> 'iban'), coalesce(nullif(a ->> 'currency', ''), 'DKK'))
    on conflict (account_uid) do update set connection_id = excluded.connection_id, name = excluded.name, iban_hash = excluded.iban_hash;
  end loop;
  return c.id;
end;
$$;

-- Hvad skal hentes? (p_user null = alle, til det daglige job)
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
      greatest(coalesce(c.last_synced_at::date - 5, current_date - 90), current_date - 90)
    from private.bank_connections c
    join private.bank_accounts a on a.connection_id = c.id
    where c.status = 'active' and (p_user is null or c.user_id = p_user)
    order by c.id;
end;
$$;

-- p_rows: [{ external_id, booked_on, amount_ore, description, counterparty, counterparty_iban, pending }]
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
      case when amt < 0 then coalesce(private.suggest_category_for(acc.household_id, coalesce(cp, txt)), private.suggest_category_for(acc.household_id, txt)) end,
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
      end if;
    end if;
  end loop;
  return inserted;
end;
$$;

create or replace function public.bank_mark_synced(p_connection uuid, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.bank_connections
     set last_synced_at = case when p_error is null then now() else last_synced_at end,
         last_error = left(p_error, 300)
   where id = p_connection;
$$;

-- Fjern forbindelse. Returnerer bankens session-id, så Edge Functionen kan lukke den.
create or replace function public.bank_connection_revoke(p_user uuid, p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c private.bank_connections;
begin
  select * into c from private.bank_connections where id = p_id and user_id = p_user for update;
  if not found then
    raise exception 'Forbindelsen findes ikke' using errcode = 'no_data_found';
  end if;
  update private.bank_connections set status = 'revoked', session_id = null where id = c.id;
  -- Ubehandlede posteringer fra forbindelsen fjernes; godkendte bliver
  delete from public.bank_transactions b
   using private.bank_accounts a
   where a.connection_id = c.id and b.account_id = a.id and b.state <> 'imported';
  return c.session_id;
end;
$$;

create or replace function public.verify_bank_sync_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32, false)
     and coalesce((select s.decrypted_secret = p_secret from vault.decrypted_secrets s where s.name = 'bank_sync_secret' limit 1), false);
$$;

-- Eksport med indtægter (version 5)
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
    'version', 5,
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

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.iban_hash(text) from public, anon, authenticated;
revoke all on function private.suggest_category_for(uuid, text) from public, anon, authenticated;
revoke all on function private.member_depart(uuid, uuid) from public, anon, authenticated;

revoke all on function public.bank_connection_list() from public, anon;
revoke all on function public.bank_import(uuid, uuid, text) from public, anon;
revoke all on function public.bank_link_existing(uuid, uuid) from public, anon;
revoke all on function public.bank_set_ignored(uuid, boolean) from public, anon;
grant execute on function public.bank_connection_list() to authenticated;
grant execute on function public.bank_import(uuid, uuid, text) to authenticated;
grant execute on function public.bank_link_existing(uuid, uuid) to authenticated;
grant execute on function public.bank_set_ignored(uuid, boolean) to authenticated;

revoke all on function public.bank_connection_start(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bank_connection_activate(uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.bank_sync_targets(uuid) from public, anon, authenticated;
revoke all on function public.bank_ingest(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.bank_mark_synced(uuid, text) from public, anon, authenticated;
revoke all on function public.bank_connection_revoke(uuid, uuid) from public, anon, authenticated;
revoke all on function public.verify_bank_sync_secret(text) from public, anon, authenticated;
grant execute on function public.bank_connection_start(uuid, text, text, text) to service_role;
grant execute on function public.bank_connection_activate(uuid, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.bank_sync_targets(uuid) to service_role;
grant execute on function public.bank_ingest(uuid, jsonb) to service_role;
grant execute on function public.bank_mark_synced(uuid, text) to service_role;
grant execute on function public.bank_connection_revoke(uuid, uuid) to service_role;
grant execute on function public.verify_bank_sync_secret(text) to service_role;
