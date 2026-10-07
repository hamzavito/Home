-- =============================================================================
-- Børn: synlig PIN for forældre, opgavebelønninger med godkendelse,
-- faste lommepenge (ugentligt/månedligt) med automatisk udbetaling
-- =============================================================================
-- * PIN: forældre (voksne i husstanden) skal kunne se barnets PIN. Login tjekkes
--   stadig mod bcrypt-hashen. Til visning gemmes PIN'en krypteret (pgcrypto/PGP)
--   med en nøgle i Supabase Vault – aldrig i klar tekst i tabellerne eller backups.
--   Lette PIN'er (fx 123456) er tilladt; låsen efter 5 forkerte forsøg bevares.
-- * Belønning: når et barn markerer en opgave med belønning som færdig, venter den
--   på en forælders godkendelse. Først "Godkend og udbetal" opretter en bevægelse.
--   Højst én udbetaling pr. opgave: rækkelås på opgaven + unikt indeks på
--   child_wallet_transactions(task_id). Statussen kan kun ændres af databasen.
-- * Faste lommepenge: child_allowance_schedules + child_allowance_payouts med
--   primærnøgle (schedule_id, period_key), så samme uge/måned aldrig udbetales to gange
--   – heller ikke hvis jobbet kører flere gange eller samtidig.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PIN: krypteret kopi til visning for forældre
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'child_pin_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'child_pin_key', 'Nøgle til krypteret visning af børns PIN for forældre');
  end if;
end $$;

alter table private.child_credentials add column pin_encrypted bytea;

create or replace function private.pin_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'child_pin_key' $$;

-- 4 eller 6 cifre (lette PIN'er er tilladt – forældrene bestemmer)
create or replace function private.valid_pin(p_pin text, p_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_len in (4, 6) and coalesce(p_pin, '') ~ ('^[0-9]{' || p_len || '}$');
$$;

create or replace function public.child_account_create(p_owner uuid, p_child uuid, p_name text, p_username text, p_pin text, p_pin_length int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
  v_user text := private.normalize_username(p_username);
  v_name text := trim(coalesce(p_name, ''));
begin
  if hid is null then
    raise exception 'Kun ejere kan oprette børn' using errcode = 'insufficient_privilege';
  end if;
  if length(v_name) not between 1 and 40 then
    raise exception 'Ugyldigt navn' using errcode = 'check_violation';
  end if;
  if not private.valid_pin(p_pin, p_pin_length) then
    raise exception 'Ugyldig PIN' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from auth.users where id = p_child) then
    raise exception 'Brugeren findes ikke' using errcode = 'no_data_found';
  end if;
  insert into public.profiles (id, display_name) values (p_child, v_name)
  on conflict (id) do update set display_name = excluded.display_name;
  insert into public.household_members (household_id, user_id, role, child_username)
  values (hid, p_child, 'child', v_user);
  insert into private.child_credentials (user_id, household_id, pin_hash, pin_length, pin_encrypted)
  values (p_child, hid, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), p_pin_length,
          extensions.pgp_sym_encrypt(p_pin, private.pin_key()));
  return hid;
end;
$$;

create or replace function public.child_set_pin(p_child uuid, p_pin text, p_pin_length int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  v_user text;
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan ændre PIN' using errcode = 'insufficient_privilege';
  end if;
  if not private.valid_pin(p_pin, p_pin_length) then
    raise exception 'Ugyldig PIN' using errcode = 'check_violation';
  end if;
  update private.child_credentials
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), pin_length = p_pin_length,
      pin_encrypted = extensions.pgp_sym_encrypt(p_pin, private.pin_key()), pin_changed_at = now()
  where user_id = p_child and household_id = hid;
  if not found then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  select child_username into v_user from public.household_members where household_id = hid and user_id = p_child;
  update private.login_throttle set failures = 0, lock_level = 0, locked_until = null, updated_at = now()
  where scope = 'combo' and key = (select code from private.household_login_codes where household_id = hid) || ':' || v_user;
end;
$$;

-- Barnets PIN til forældrene (voksne i samme husstand). NULL hvis den er sat før denne funktion fandtes.
create or replace function public.child_pin(p_child uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c private.child_credentials;
begin
  select * into c from private.child_credentials where user_id = p_child;
  if not found or not private.is_household_member(c.household_id) then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  if c.pin_encrypted is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(c.pin_encrypted, private.pin_key());
end;
$$;

-- -----------------------------------------------------------------------------
-- Opgavebelønning: status styres af databasen
-- -----------------------------------------------------------------------------
-- none: ingen belønning · awaiting_completion: venter på at barnet bliver færdigt ·
-- awaiting_approval: færdig, venter på forælder · paid: udbetalt · rejected: afvist
alter table public.household_tasks
  add column reward_status text not null default 'none'
    check (reward_status in ('none', 'awaiting_completion', 'awaiting_approval', 'paid', 'rejected')),
  add column reward_decided_at timestamptz,
  add column reward_decided_by uuid references public.profiles (id);

-- Højst én udbetaling pr. opgave (også ved dobbelttryk eller to forældre samtidig)
create unique index child_wallet_one_payout_per_task on public.child_wallet_transactions (task_id) where task_id is not null;

create or replace function private.task_reward_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.reward_status := case
      when new.reward_ore is null then 'none'
      when new.status = 'done' then 'awaiting_approval'
      else 'awaiting_completion' end;
    new.reward_decided_at := null;
    new.reward_decided_by := null;
    return new;
  end if;
  -- En udbetalt belønning forbliver udbetalt (genåbning trækker ikke penge tilbage)
  if old.reward_status = 'paid' then
    new.reward_status := 'paid';
    return new;
  end if;
  if new.reward_ore is null then
    new.reward_status := 'none';
  elsif old.reward_status = 'none' or (new.status = 'done') <> (old.status = 'done') then
    -- Belønning tilføjet, færdiggjort eller genåbnet: godkendelsen starter forfra
    new.reward_status := case when new.status = 'done' then 'awaiting_approval' else 'awaiting_completion' end;
    new.reward_decided_at := null;
    new.reward_decided_by := null;
  end if;
  return new;
end;
$$;
create trigger household_tasks_reward_status before insert or update on public.household_tasks
  for each row execute function private.task_reward_status();

-- Eksisterende opgaver med belønning
update public.household_tasks set reward_status = case when status = 'done' then 'awaiting_approval' else 'awaiting_completion' end
where reward_ore is not null and reward_status = 'none';

-- Godkend og udbetal (p_approve = true) eller afvis. Kun voksne. Idempotent.
create or replace function public.child_reward_decide(p_task uuid, p_approve boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.household_tasks;
  tid uuid;
begin
  -- Rækkelåsen serialiserer samtidige godkendelser af samme opgave
  select * into t from public.household_tasks where id = p_task for update;
  if not found or not private.is_household_member(t.household_id) then
    raise exception 'Opgaven findes ikke' using errcode = 'no_data_found';
  end if;
  if t.reward_status = 'paid' then
    if p_approve then
      -- Allerede udbetalt: returnér den eksisterende udbetaling (ingen ny)
      return (select id from public.child_wallet_transactions where task_id = t.id);
    end if;
    raise exception 'Belønningen er allerede udbetalt' using errcode = 'check_violation';
  end if;
  if t.reward_status <> 'awaiting_approval' or t.reward_ore is null then
    raise exception 'Opgaven venter ikke på godkendelse' using errcode = 'check_violation';
  end if;
  if t.assignee_id is null or not private.is_child_of(t.household_id, t.assignee_id) then
    raise exception 'Kun børn kan få belønning' using errcode = 'check_violation';
  end if;

  if not p_approve then
    update public.household_tasks set reward_status = 'rejected', reward_decided_at = now(), reward_decided_by = auth.uid()
    where id = t.id;
    return null;
  end if;

  insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore, note, task_id, created_by)
  values (t.household_id, t.assignee_id, 'deposit', t.reward_ore, left('Opgave: ' || t.title, 100), t.id, auth.uid())
  on conflict (task_id) where task_id is not null do nothing
  returning id into tid;
  if tid is null then
    tid := (select id from public.child_wallet_transactions where task_id = t.id);
  end if;
  update public.household_tasks set reward_status = 'paid', reward_decided_at = now(), reward_decided_by = auth.uid()
  where id = t.id;
  return tid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Faste lommepenge
-- -----------------------------------------------------------------------------
create table public.child_allowance_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  child_id uuid not null,
  amount_ore bigint not null check (amount_ore between 100 and 10000000),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  -- Ugentligt: ISO-ugedag 1 = mandag … 7 = søndag
  weekday smallint check (weekday between 1 and 7),
  -- Månedligt: 1–31 (findes datoen ikke, bruges sidste dag), 0 = sidste dag i måneden
  month_day smallint check (month_day between 0 and 31),
  start_on date not null,
  end_on date,
  -- Første dato der må udbetales for (sættes ved oprettelse og genoptagelse)
  pay_from date not null,
  paused_at timestamptz,
  stopped_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  constraint child_allowance_when check (
    (frequency = 'weekly' and weekday is not null and month_day is null)
    or (frequency = 'monthly' and month_day is not null and weekday is null)),
  constraint child_allowance_period check (end_on is null or end_on >= start_on),
  foreign key (household_id, child_id) references public.household_members (household_id, user_id) on delete cascade
);
create index child_allowance_child_idx on public.child_allowance_schedules (child_id);
create trigger child_allowance_schedules_updated_at before update on public.child_allowance_schedules
  for each row execute function private.set_updated_at();

create table public.child_allowance_payouts (
  schedule_id uuid not null,
  household_id uuid not null,
  period_key text not null check (period_key ~ '^[0-9]{4}-(W[0-9]{2}|[0-9]{2})$'),
  due_on date not null,
  amount_ore bigint not null,
  -- Sættes i samme transaktion som reservationen af perioden
  tx_id uuid unique references public.child_wallet_transactions (id),
  created_at timestamptz not null default now(),
  primary key (schedule_id, period_key),
  foreign key (household_id, schedule_id) references public.child_allowance_schedules (household_id, id) on delete cascade
);

alter table public.child_allowance_schedules enable row level security;
alter table public.child_allowance_payouts enable row level security;
revoke all on public.child_allowance_schedules, public.child_allowance_payouts from anon, authenticated;
grant select on public.child_allowance_schedules, public.child_allowance_payouts to authenticated;
-- Kun voksne ser og styrer faste lommepenge (barnet ser udbetalingerne som bevægelser)
create policy "Voksne ser faste lommepenge" on public.child_allowance_schedules for select to authenticated
  using (private.is_household_member(household_id));
create policy "Voksne ser udbetalinger" on public.child_allowance_payouts for select to authenticated
  using (private.is_household_member(household_id));

-- Forfaldsdatoer for en ordning i [p_from, p_to]
create or replace function private.allowance_due_dates(s public.child_allowance_schedules, p_from date, p_to date)
returns setof date
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select greatest(p_from, s.pay_from, s.start_on) as a, least(p_to, coalesce(s.end_on, p_to)) as b
  )
  select d::date from bounds, generate_series(bounds.a, bounds.b, interval '1 day') d
  where bounds.a <= bounds.b
    and case s.frequency
      when 'weekly' then extract(isodow from d) = s.weekday
      else d::date = (
        date_trunc('month', d)::date
        + (least(case when s.month_day = 0 then 31 else s.month_day end,
                 extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int) - 1))
    end;
$$;

create or replace function private.allowance_period_key(p_frequency text, p_due date)
returns text
language sql
immutable
set search_path = ''
as $$ select case when p_frequency = 'weekly' then to_char(p_due, 'IYYY-"W"IW') else to_char(p_due, 'YYYY-MM') end $$;

-- Udbetal alt der er forfaldent for én ordning (højst 62 dage tilbage). Idempotent.
create or replace function private.pay_allowance(p_schedule uuid, p_today date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.child_allowance_schedules;
  d date;
  k text;
  tid uuid;
  n int := 0;
begin
  select * into s from public.child_allowance_schedules where id = p_schedule;
  if not found or s.paused_at is not null or s.stopped_at is not null then
    return 0;
  end if;
  -- Barnet skal stadig være barn i husstanden
  if not private.is_child_of(s.household_id, s.child_id) then
    return 0;
  end if;
  for d in select * from private.allowance_due_dates(s, p_today - 62, p_today) loop
    k := private.allowance_period_key(s.frequency, d);
    -- Perioden reserveres først; findes den allerede, sker intet (også ved samtidige kørsler)
    insert into public.child_allowance_payouts (schedule_id, household_id, period_key, due_on, amount_ore, tx_id)
    values (s.id, s.household_id, k, d, s.amount_ore, null)
    on conflict (schedule_id, period_key) do nothing;
    if found then
      insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore, note, occurred_on, created_by)
      values (s.household_id, s.child_id, 'allowance', s.amount_ore, 'Fast lommepenge', d, s.created_by)
      returning id into tid;
      update public.child_allowance_payouts set tx_id = tid where schedule_id = s.id and period_key = k;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Dagligt job (pg_cron). Kan køres så ofte man vil uden dubletter.
create or replace function private.run_allowances(p_today date default ((now() at time zone 'Europe/Copenhagen')::date))
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.child_allowance_schedules where paused_at is null and stopped_at is null loop
    n := n + private.pay_allowance(r.id, p_today);
  end loop;
  return n;
end;
$$;

create or replace function public.child_allowance_create(
  p_child uuid, p_amount_ore bigint, p_frequency text, p_weekday int, p_month_day int, p_start_on date, p_end_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  sid uuid;
begin
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Kun voksne kan oprette faste lommepenge' using errcode = 'insufficient_privilege';
  end if;
  if not private.is_child_of(hid, p_child) then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  if (select count(*) from public.child_allowance_schedules where child_id = p_child and stopped_at is null) >= 5 then
    raise exception 'Højst 5 aktive ordninger pr. barn' using errcode = 'check_violation';
  end if;
  insert into public.child_allowance_schedules (household_id, child_id, amount_ore, frequency, weekday, month_day, start_on, end_on, pay_from)
  values (hid, p_child, p_amount_ore, p_frequency,
          case when p_frequency = 'weekly' then p_weekday end,
          case when p_frequency = 'monthly' then p_month_day end,
          coalesce(p_start_on, today), p_end_on,
          -- En startdato i fortiden giver ikke efterbetaling
          greatest(coalesce(p_start_on, today), today))
  returning id into sid;
  -- Forfalder den i dag, udbetales den med det samme
  perform private.pay_allowance(sid, today);
  return sid;
end;
$$;

-- Ændr beløb og/eller slutdato. Gælder kun fremtidige udbetalinger.
create or replace function public.child_allowance_update(p_schedule uuid, p_amount_ore bigint, p_end_on date default null, p_clear_end boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.child_allowance_schedules;
begin
  select * into s from public.child_allowance_schedules where id = p_schedule for update;
  if not found or not private.is_household_member(s.household_id) then
    raise exception 'Ordningen findes ikke' using errcode = 'no_data_found';
  end if;
  if s.stopped_at is not null then
    raise exception 'Ordningen er stoppet' using errcode = 'check_violation';
  end if;
  update public.child_allowance_schedules
  set amount_ore = coalesce(p_amount_ore, amount_ore),
      end_on = case when p_clear_end then null else coalesce(p_end_on, end_on) end
  where id = p_schedule;
end;
$$;

-- pause | resume | stop. Genoptagelse fortsætter fra i dag (pauseperioder udbetales ikke).
create or replace function public.child_allowance_set_state(p_schedule uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.child_allowance_schedules;
  today date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  select * into s from public.child_allowance_schedules where id = p_schedule for update;
  if not found or not private.is_household_member(s.household_id) then
    raise exception 'Ordningen findes ikke' using errcode = 'no_data_found';
  end if;
  if s.stopped_at is not null then
    raise exception 'Ordningen er stoppet' using errcode = 'check_violation';
  end if;
  if p_action = 'pause' then
    update public.child_allowance_schedules set paused_at = coalesce(paused_at, now()) where id = p_schedule;
  elsif p_action = 'resume' then
    if s.paused_at is not null then
      update public.child_allowance_schedules set paused_at = null, pay_from = greatest(today, start_on) where id = p_schedule;
      perform private.pay_allowance(p_schedule, today);
    end if;
  elsif p_action = 'stop' then
    update public.child_allowance_schedules set stopped_at = now() where id = p_schedule;
  else
    raise exception 'Ugyldig handling' using errcode = 'check_violation';
  end if;
end;
$$;

-- Næste udbetaling (til visning)
create or replace function public.child_allowance_next(p_schedule uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.child_allowance_schedules;
  today date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  select * into s from public.child_allowance_schedules where id = p_schedule;
  if not found or not private.is_household_member(s.household_id) then
    raise exception 'Ordningen findes ikke' using errcode = 'no_data_found';
  end if;
  if s.paused_at is not null or s.stopped_at is not null then
    return null;
  end if;
  return (
    select d from private.allowance_due_dates(s, today, today + 62) d
    where not exists (select 1 from public.child_allowance_payouts p where p.schedule_id = s.id and p.period_key = private.allowance_period_key(s.frequency, d))
    order by d limit 1);
end;
$$;

-- Eksport omfatter de nye tabeller
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
    'version', 4,
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
    'child_allowance_payouts', coalesce((select jsonb_agg(to_jsonb(x) order by x.due_on) from public.child_allowance_payouts x where x.household_id = hid), '[]')
  ) into out;
  return out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.pin_key() from public, anon, authenticated;
revoke all on function private.task_reward_status() from public, anon, authenticated;
revoke all on function private.allowance_due_dates(public.child_allowance_schedules, date, date) from public, anon, authenticated;
revoke all on function private.pay_allowance(uuid, date) from public, anon, authenticated;
revoke all on function private.run_allowances(date) from public, anon, authenticated;

revoke all on function public.child_pin(uuid) from public, anon;
revoke all on function public.child_reward_decide(uuid, boolean) from public, anon;
revoke all on function public.child_allowance_create(uuid, bigint, text, int, int, date, date) from public, anon;
revoke all on function public.child_allowance_update(uuid, bigint, date, boolean) from public, anon;
revoke all on function public.child_allowance_set_state(uuid, text) from public, anon;
revoke all on function public.child_allowance_next(uuid) from public, anon;
revoke all on function public.child_account_create(uuid, uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.child_set_pin(uuid, text, int) from public, anon;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.child_pin(uuid) to authenticated;
grant execute on function public.child_reward_decide(uuid, boolean) to authenticated;
grant execute on function public.child_allowance_create(uuid, bigint, text, int, int, date, date) to authenticated;
grant execute on function public.child_allowance_update(uuid, bigint, date, boolean) to authenticated;
grant execute on function public.child_allowance_set_state(uuid, text) to authenticated;
grant execute on function public.child_allowance_next(uuid) to authenticated;
grant execute on function public.child_account_create(uuid, uuid, text, text, text, int) to service_role;
grant execute on function public.child_set_pin(uuid, text, int) to authenticated;
grant execute on function public.export_household_data() to authenticated;
