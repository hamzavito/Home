-- =============================================================================
-- Kommende udgifter og opsparing
-- =============================================================================
-- Kommende udgifter er en PLAN. Først når de markeres som betalt OG brugeren
-- vælger at registrere dem, oprettes en transaktion – atomisk og idempotent.
-- Opsparing: målets nuværende beløb beregnes altid af bevægelserne (ingen
-- gemt saldo der kan komme ud af sync). Faste poster under "Opsparing" er
-- plan og opretter aldrig bevægelser automatisk.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kommende udgifter
-- -----------------------------------------------------------------------------
create table public.upcoming_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  amount_ore bigint not null check (amount_ore between 1 and 100000000000),
  due_on date not null,
  category_id uuid not null,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'upcoming' check (status in ('upcoming', 'paid', 'cancelled')),
  paid_at timestamptz,
  transaction_id uuid unique,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upcoming_paid_shape check ((status = 'paid') = (paid_at is not null)),
  constraint upcoming_tx_only_when_paid check (transaction_id is null or status = 'paid'),
  foreign key (household_id, category_id) references public.budget_categories (household_id, id) on delete restrict,
  -- Slettes den registrerede udgift, bevares den kommende udgift (som betalt uden link)
  foreign key (household_id, transaction_id) references public.transactions (household_id, id) on delete set null (transaction_id)
);
create index upcoming_expenses_due_idx on public.upcoming_expenses (household_id, status, due_on);
create trigger upcoming_expenses_updated_at before update on public.upcoming_expenses
  for each row execute function private.set_updated_at();

alter table public.upcoming_expenses enable row level security;
revoke all on public.upcoming_expenses from anon;
create policy "Se kommende udgifter" on public.upcoming_expenses for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret kommende udgift" on public.upcoming_expenses for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()) and status = 'upcoming');
create policy "Ret kommende udgift" on public.upcoming_expenses for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Slet kommende udgift" on public.upcoming_expenses for delete to authenticated
  using (private.is_household_member(household_id));
revoke insert, update, truncate on public.upcoming_expenses from authenticated;
grant insert (household_id, title, amount_ore, due_on, category_id, note) on public.upcoming_expenses to authenticated;
-- Status og transaktionslink ændres kun via funktionerne nedenfor
grant update (title, amount_ore, due_on, category_id, note) on public.upcoming_expenses to authenticated;
grant delete on public.upcoming_expenses to authenticated;

-- Markér status. Ved 'paid' + p_register oprettes transaktionen i samme databasetransaktion.
-- Idempotent: er den allerede betalt, returneres den eksisterende transaktion.
create or replace function public.set_upcoming_status(
  p_id uuid,
  p_status text,
  p_register boolean default false,
  p_amount_ore bigint default null,
  p_paid_on date default null,
  p_paid_by_kind text default 'shared',
  p_paid_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.upcoming_expenses;
  tid uuid;
begin
  select * into u from public.upcoming_expenses where id = p_id for update;
  if not found or not private.is_household_member(u.household_id) then
    raise exception 'Udgiften findes ikke' using errcode = 'no_data_found';
  end if;
  if p_status not in ('upcoming', 'paid', 'cancelled') then
    raise exception 'Ugyldig status' using errcode = 'check_violation';
  end if;

  if p_status = 'paid' then
    if u.status = 'paid' then
      return u.transaction_id;
    end if;
    if p_register then
      insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, note, paid_by_kind, paid_by_user_id, source, created_by)
      values (u.household_id, u.category_id, coalesce(p_amount_ore, u.amount_ore), coalesce(p_paid_on, private.today_dk()), u.title, u.note,
              p_paid_by_kind, case when p_paid_by_kind = 'member' then p_paid_by_user_id end, 'upcoming', auth.uid())
      returning id into tid;
    end if;
    update public.upcoming_expenses set status = 'paid', paid_at = now(), transaction_id = tid where id = u.id;
    return tid;
  end if;

  -- Tilbage til kommende/annulleret: kun hvis der ikke er en registreret udgift (brug undo_upcoming_payment)
  if u.transaction_id is not null then
    raise exception 'Udgiften er registreret. Fortryd betalingen først.' using errcode = 'check_violation';
  end if;
  update public.upcoming_expenses set status = p_status, paid_at = null where id = u.id;
  return null;
end;
$$;

-- Fortryd betaling: slet den registrerede transaktion og sæt tilbage til "kommende" – atomisk
create or replace function public.undo_upcoming_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.upcoming_expenses;
begin
  select * into u from public.upcoming_expenses where id = p_id for update;
  if not found or not private.is_household_member(u.household_id) then
    raise exception 'Udgiften findes ikke' using errcode = 'no_data_found';
  end if;
  if u.status <> 'paid' then
    return;
  end if;
  update public.upcoming_expenses set status = 'upcoming', paid_at = null, transaction_id = null where id = u.id;
  if u.transaction_id is not null then
    delete from public.transactions where id = u.transaction_id and source = 'upcoming';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Opsparing
-- -----------------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  target_ore bigint not null check (target_ore between 1 and 100000000000),
  target_date date,
  note text check (note is null or length(note) <= 1000),
  color text not null default '#0c9467' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function private.set_updated_at();

create table public.savings_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  goal_id uuid not null,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount_ore bigint not null check (amount_ore between 1 and 100000000000),
  occurred_on date not null default current_date,
  note text check (note is null or length(note) <= 500),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Mål arkiveres, slettes ikke – bevægelserne bevares
  foreign key (household_id, goal_id) references public.savings_goals (household_id, id) on delete restrict
);
create index savings_movements_goal_idx on public.savings_movements (goal_id, occurred_on);

-- Saldoen må aldrig blive negativ (man kan ikke hæve mere end der er sparet op)
create or replace function private.savings_balance_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g uuid := coalesce(new.goal_id, old.goal_id);
begin
  if (select coalesce(sum(case when kind = 'deposit' then amount_ore else -amount_ore end), 0)
      from public.savings_movements where goal_id = g) < 0 then
    raise exception 'Saldoen kan ikke blive negativ' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger savings_balance_guard
  after insert or update or delete on public.savings_movements
  deferrable initially immediate
  for each row execute function private.savings_balance_guard();

alter table public.savings_goals enable row level security;
alter table public.savings_movements enable row level security;
revoke all on public.savings_goals, public.savings_movements from anon;

create policy "Se opsparingsmål" on public.savings_goals for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret opsparingsmål" on public.savings_goals for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret opsparingsmål" on public.savings_goals for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
revoke insert, update, delete, truncate on public.savings_goals from authenticated;
grant insert (household_id, name, target_ore, target_date, note, color) on public.savings_goals to authenticated;
grant update (name, target_ore, target_date, note, color, archived_at) on public.savings_goals to authenticated;

create policy "Se bevægelser" on public.savings_movements for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret bevægelse" on public.savings_movements for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret bevægelse" on public.savings_movements for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Slet bevægelse" on public.savings_movements for delete to authenticated
  using (private.is_household_member(household_id));
revoke insert, update, truncate on public.savings_movements from authenticated;
grant insert (household_id, goal_id, kind, amount_ore, occurred_on, note) on public.savings_movements to authenticated;
grant update (kind, amount_ore, occurred_on, note) on public.savings_movements to authenticated;
grant delete on public.savings_movements to authenticated;

create or replace function public.savings_goal_progress()
returns table (goal_id uuid, current_ore bigint, movement_count integer, last_movement_on date)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id,
         coalesce(sum(case when m.kind = 'deposit' then m.amount_ore else -m.amount_ore end), 0)::bigint,
         count(m.id)::integer,
         max(m.occurred_on)
  from public.savings_goals g
  left join public.savings_movements m on m.goal_id = g.id
  where g.household_id = public.current_household_id()
  group by g.id;
$$;

-- delete_transaction: kendt fra fase 3. Udvidet så en kommende udgift, der var
-- linket til transaktionen, beholder status "betalt" men mister linket (FK SET NULL).
-- Ingen ændring nødvendig – fremmednøglen håndterer det.

revoke all on function public.set_upcoming_status(uuid, text, boolean, bigint, date, text, uuid) from public, anon;
revoke all on function public.undo_upcoming_payment(uuid) from public, anon;
revoke all on function public.savings_goal_progress() from public, anon;
grant execute on function public.set_upcoming_status(uuid, text, boolean, bigint, date, text, uuid) to authenticated;
grant execute on function public.undo_upcoming_payment(uuid) to authenticated;
grant execute on function public.savings_goal_progress() to authenticated;
