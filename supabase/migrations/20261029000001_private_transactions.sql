-- =============================================================================
-- Private og fælles udgifter
-- =============================================================================
-- * En udgift er enten fælles (hele husstandens voksne ser den) eller privat
--   (kun den, der oprettede/godkendte den, ser den).
-- * Nye udgifter er private, indtil man vælger "fælles" – også fra banken og
--   scannede kvitteringer. Betalte kommende udgifter er fælles (husstandens plan).
-- * Private udgifter tæller ikke i husstandens budgetter, plan og oversigter.
-- * Eksisterende udgifter forbliver fælles (som hidtil).
-- * Banken husker valget pr. butik ("huskede butikker"), så næste køb samme sted
--   får samme synlighed.
-- =============================================================================
-- Eksisterende udgifter bliver fælles via kolonnens standardværdi (ingen rækkeopdatering)
alter table public.transactions
  add column visibility text not null default 'shared' check (visibility in ('shared', 'private'));
alter table public.transactions alter column visibility set default null;

-- Standard: privat – undtagen betalte kommende udgifter (husstandens fælles plan)
create or replace function private.transactions_visibility_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility is null then
    new.visibility := case when new.source = 'upcoming' then 'shared' else 'private' end;
  end if;
  return new;
end;
$$;
create trigger transactions_visibility_default before insert on public.transactions
  for each row execute function private.transactions_visibility_default();
create index transactions_visibility_idx on public.transactions (household_id, visibility, created_by);

grant insert (visibility) on public.transactions to authenticated;
grant update (visibility) on public.transactions to authenticated;

-- Private udgifter ses, rettes og slettes kun af ejeren
alter policy "Se husstandens transaktioner" on public.transactions
  using (private.is_household_member(household_id) and (visibility = 'shared' or created_by = (select auth.uid())));
alter policy "Opret transaktion" on public.transactions
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
alter policy "Redigér transaktion" on public.transactions
  using (private.is_household_member(household_id) and (visibility = 'shared' or created_by = (select auth.uid())))
  with check (private.is_household_member(household_id) and (visibility = 'shared' or created_by = (select auth.uid())));
alter policy "Slet transaktion" on public.transactions
  using (private.is_household_member(household_id) and (visibility = 'shared' or created_by = (select auth.uid())));

-- Kvitteringer følger udgiftens synlighed (ventende kvitteringer: som hidtil)
alter policy "Se husstandens kvitteringer" on public.receipts
  using (private.is_household_member(household_id)
         and (transaction_id is null or uploaded_by = (select auth.uid())
              or exists (select 1 from public.transactions t where t.id = receipts.transaction_id)));

-- -----------------------------------------------------------------------------
-- Bank: huskede butikker husker også, om købene er fælles
-- -----------------------------------------------------------------------------
alter table private.bank_merchant_rules add column shared boolean not null default false;

create or replace function private.bank_import_expense(b public.bank_transactions, p_category uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  v_shared boolean;
begin
  select r.shared into v_shared from private.bank_merchant_rules r
  where r.household_id = b.household_id and r.user_id = b.user_id and r.active
    and r.merchant_key = private.merchant_key(b.counterparty, b.description);
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, paid_by_kind, paid_by_user_id, source, created_by, visibility)
  values (b.household_id, p_category, -b.amount_ore, b.booked_on,
          left(coalesce(nullif(trim(p_description), ''), nullif(trim(b.counterparty), ''), b.description), 80),
          'member', b.user_id, 'bank', b.user_id, case when coalesce(v_shared, false) then 'shared' else 'private' end)
  returning id into new_id;
  update public.bank_transactions set state = 'imported', transaction_id = new_id where id = b.id;
  return new_id;
end;
$$;

-- Når ejeren gør en bankudgift fælles/privat, huskes det for butikken
create or replace function private.transactions_learn_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bank_transactions;
begin
  if new.source <> 'bank' or new.visibility is not distinct from old.visibility then
    return new;
  end if;
  select * into b from public.bank_transactions where transaction_id = new.id limit 1;
  if b.id is not null then
    update private.bank_merchant_rules set shared = (new.visibility = 'shared'), updated_at = now()
    where household_id = b.household_id and user_id = b.user_id and merchant_key = private.merchant_key(b.counterparty, b.description);
  end if;
  return new;
end;
$$;
create trigger transactions_learn_visibility after update of visibility on public.transactions
  for each row execute function private.transactions_learn_visibility();

-- -----------------------------------------------------------------------------
-- Budgetter: kun fælles udgifter tæller
-- -----------------------------------------------------------------------------
create or replace function public.budget_month_summary(p_month date)
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
      and tr.visibility = 'shared'
  ) t on true
  where c.household_id = public.current_household_id()
    and (c.archived_at is null or c.archived_at >= m.start or coalesce(t.cnt, 0) > 0)
    and (c.created_at < m.next or cb.budget_source <> 'none' or coalesce(t.cnt, 0) > 0)
  order by (c.archived_at is not null), c.kind desc, c.sort_order, c.name;
$$;

revoke all on function private.transactions_visibility_default() from public, anon, authenticated;
revoke all on function private.transactions_learn_visibility() from public, anon, authenticated;
