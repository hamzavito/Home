-- =============================================================================
-- Børnerolle: owner / adult / child
-- =============================================================================
-- Princip: "afvis som udgangspunkt". private.is_household_member() betyder nu
-- VOKSEN medlem (owner/adult – og den gamle værdi 'member'). Derfor er alle
-- eksisterende politikker og RPC'er (budgetter, transaktioner, kvitteringer,
-- indkøb, faste poster, opsparing, kommende udgifter, eksport …) automatisk
-- lukket for børn. Børn får KUN adgang via de nye, smalle politikker nedenfor:
--   * egen husstand og medlemmer (navne) – kun læsning
--   * opgaver tildelt barnet – status ændres kun via set_task_status
--   * kalenderaftaler for hele familien eller hvor barnet er deltager – kun læsning
--   * madplan og opskrifter – kun læsning
--   * egne lommepenge og opsparingsmål – kun via RPC'erne nedenfor
-- Barnets lommepenge er helt adskilt fra husstandens økonomi.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rolle-hjælpere
-- -----------------------------------------------------------------------------
-- Voksen (owner/adult; 'member' = ældre betegnelse for voksen)
create or replace function private.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.role <> 'child'
  );
$$;

-- Ethvert medlem, også børn (kun til de få ting børn må se)
create or replace function private.is_household_any(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Er brugeren et barn i husstanden?
create or replace function private.is_child_of(hid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = uid and m.role = 'child'
  );
$$;

-- -----------------------------------------------------------------------------
-- Læseadgang for børn: husstand, medlemmer, madplan, opskrifter
-- -----------------------------------------------------------------------------
create policy "Børn kan se egen husstand" on public.households for select to authenticated
  using (private.is_household_any(id));
create policy "Børn kan se husstandens medlemmer" on public.household_members for select to authenticated
  using (private.is_household_any(household_id));
create policy "Børn kan se madplanen" on public.meal_plan_entries for select to authenticated
  using (private.is_household_any(household_id));
create policy "Børn kan se opskrifter" on public.recipes for select to authenticated
  using (private.is_household_any(household_id));
create policy "Børn kan se ingredienser" on public.recipe_ingredients for select to authenticated
  using (private.is_household_any(household_id));

-- -----------------------------------------------------------------------------
-- Opgaver: barnet ser kun egne; status ændres kun via set_task_status.
-- reward_ore er forberedt til frivillig belønning pr. opgave (fx +10 kr.).
-- -----------------------------------------------------------------------------
alter table public.household_tasks
  add column reward_ore bigint check (reward_ore is null or reward_ore between 100 and 100000);
grant insert (reward_ore) on public.household_tasks to authenticated;
grant update (reward_ore) on public.household_tasks to authenticated;

create policy "Børn kan se egne opgaver" on public.household_tasks for select to authenticated
  using (assignee_id = (select auth.uid()) and private.is_household_any(household_id));

-- -----------------------------------------------------------------------------
-- Kalender: flere deltagere pr. aftale. Tom liste = hele familien.
-- for_user_id bevares og holdes i sync (ældre app-versioner bruger den).
-- -----------------------------------------------------------------------------
alter table public.calendar_events add column participant_ids uuid[] not null default '{}';
grant insert (participant_ids) on public.calendar_events to authenticated;
grant update (participant_ids) on public.calendar_events to authenticated;

-- Eksisterende aftaler: "gælder for X" → deltager X. Fælles (NULL) → hele familien.
alter table public.calendar_events disable trigger calendar_events_updated_at;
update public.calendar_events set participant_ids = array[for_user_id] where for_user_id is not null;
alter table public.calendar_events enable trigger calendar_events_updated_at;

create index calendar_events_participants_idx on public.calendar_events using gin (participant_ids);

create or replace function private.calendar_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ældre app-versioner sætter kun for_user_id
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.participant_ids), 0) = 0 and new.for_user_id is not null then
      new.participant_ids := array[new.for_user_id];
    end if;
  elsif new.for_user_id is distinct from old.for_user_id and new.participant_ids is not distinct from old.participant_ids then
    new.participant_ids := case when new.for_user_id is null then '{}'::uuid[] else array[new.for_user_id] end;
  end if;
  -- Unikke, sorterede, uden NULL
  new.participant_ids := coalesce((select array_agg(distinct p order by p) from unnest(new.participant_ids) p where p is not null), '{}'::uuid[]);
  if cardinality(new.participant_ids) > 30 then
    raise exception 'For mange deltagere' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(new.participant_ids) p
    where not exists (select 1 from public.household_members m where m.household_id = new.household_id and m.user_id = p)
  ) then
    raise exception 'Deltageren er ikke medlem af husstanden' using errcode = 'foreign_key_violation';
  end if;
  new.for_user_id := case when cardinality(new.participant_ids) = 1 then new.participant_ids[1] else null end;
  return new;
end;
$$;
create trigger calendar_events_participants before insert or update on public.calendar_events
  for each row execute function private.calendar_participants();

-- Barnet ser fælles aftaler og aftaler, hvor barnet er deltager – ikke forældrenes egne
create policy "Børn kan se egne og fælles aftaler" on public.calendar_events for select to authenticated
  using (
    private.is_household_any(household_id)
    and (cardinality(participant_ids) = 0 or (select auth.uid()) = any (participant_ids))
  );

-- -----------------------------------------------------------------------------
-- Lommepenge og opsparingsmål for børn (adskilt fra husstandens økonomi)
-- Saldo = sum af bevægelser (ingen gemt saldo). Bevægelser slettes aldrig –
-- en forkert bevægelse fortrydes (voided_at) og tæller derefter ikke med.
-- -----------------------------------------------------------------------------
create table public.child_savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  child_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 60),
  target_ore bigint not null check (target_ore between 100 and 100000000),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, child_id) references public.household_members (household_id, user_id) on delete cascade
);
create index child_savings_goals_child_idx on public.child_savings_goals (child_id, archived_at);
create trigger child_savings_goals_updated_at before update on public.child_savings_goals
  for each row execute function private.set_updated_at();

create table public.child_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  child_id uuid not null,
  -- Ind: allowance (lommepenge), deposit (ekstra), from_goal (hævet fra mål)
  -- Ud:  deduction (fradrag), purchase (køb), to_goal (sat ind på mål)
  kind text not null check (kind in ('allowance', 'deposit', 'deduction', 'purchase', 'to_goal', 'from_goal')),
  amount_ore bigint not null check (amount_ore between 1 and 100000000),
  note text check (note is null or length(note) <= 100),
  goal_id uuid,
  -- Forberedt: belønning for en opgave (frivillig pr. opgave)
  task_id uuid references public.household_tasks (id) on delete set null,
  occurred_on date not null default ((now() at time zone 'Europe/Copenhagen')::date),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint child_wallet_goal check ((kind in ('to_goal', 'from_goal')) = (goal_id is not null)),
  foreign key (household_id, child_id) references public.household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, goal_id) references public.child_savings_goals (household_id, id)
);
create index child_wallet_child_idx on public.child_wallet_transactions (child_id, occurred_on desc);
create index child_wallet_goal_idx on public.child_wallet_transactions (goal_id) where goal_id is not null;

alter table public.child_savings_goals enable row level security;
alter table public.child_wallet_transactions enable row level security;
-- Kun læsning direkte; alle ændringer går gennem funktionerne nedenfor (med kontrol)
revoke all on public.child_savings_goals, public.child_wallet_transactions from anon, authenticated;
grant select on public.child_savings_goals, public.child_wallet_transactions to authenticated;

create policy "Voksne ser børnenes mål, barnet sine egne" on public.child_savings_goals for select to authenticated
  using (private.is_household_member(household_id) or (child_id = (select auth.uid()) and private.is_household_any(household_id)));
create policy "Voksne ser børnenes lommepenge, barnet sine egne" on public.child_wallet_transactions for select to authenticated
  using (private.is_household_member(household_id) or (child_id = (select auth.uid()) and private.is_household_any(household_id)));

-- Saldo på lommepengekontoen (uden beløb sat ind på mål)
create or replace function private.child_balance(p_child uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when kind in ('allowance', 'deposit', 'from_goal') then amount_ore else -amount_ore end), 0)::bigint
  from public.child_wallet_transactions
  where child_id = p_child and voided_at is null;
$$;

-- Opsparet på et mål
create or replace function private.child_goal_saved(p_goal uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when kind = 'to_goal' then amount_ore else -amount_ore end), 0)::bigint
  from public.child_wallet_transactions
  where goal_id = p_goal and voided_at is null;
$$;

-- Ny bevægelse. Voksne: alt for husstandens børn. Barnet: kun køb og flyt til/fra egne mål,
-- og aldrig mere end der er (saldoen kan ikke gå i minus ved barnets egne handlinger).
create or replace function public.child_wallet_add(
  p_child uuid,
  p_kind text,
  p_amount_ore bigint,
  p_note text default null,
  p_goal uuid default null,
  p_occurred_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  me uuid := auth.uid();
  adult boolean;
  g public.child_savings_goals;
  tid uuid;
begin
  if hid is null or me is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  adult := private.is_household_member(hid);
  if not private.is_child_of(hid, p_child) then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  if not adult and (me <> p_child or p_kind not in ('purchase', 'to_goal', 'from_goal')) then
    raise exception 'Ikke tilladt' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_ore is null or p_amount_ore <= 0 then
    raise exception 'Beløbet skal være større end 0' using errcode = 'check_violation';
  end if;
  if p_occurred_on is not null and (p_occurred_on > (now() at time zone 'Europe/Copenhagen')::date + 1 or p_occurred_on < (now() at time zone 'Europe/Copenhagen')::date - 366) then
    raise exception 'Ugyldig dato' using errcode = 'check_violation';
  end if;
  -- Én ændring ad gangen pr. barn (saldokontrol uden kapløb)
  perform pg_advisory_xact_lock(hashtext('child_wallet:' || p_child::text));

  if p_kind in ('to_goal', 'from_goal') then
    select * into g from public.child_savings_goals where id = p_goal and child_id = p_child and household_id = hid;
    if not found then
      raise exception 'Målet findes ikke' using errcode = 'no_data_found';
    end if;
    if p_kind = 'to_goal' and g.archived_at is not null then
      raise exception 'Målet er afsluttet' using errcode = 'check_violation';
    end if;
    if p_kind = 'from_goal' and p_amount_ore > private.child_goal_saved(p_goal) then
      raise exception 'Der er ikke så mange penge på målet' using errcode = 'check_violation';
    end if;
  elsif p_goal is not null then
    raise exception 'Kun flytning til/fra mål har et mål' using errcode = 'check_violation';
  end if;
  if p_kind = 'to_goal' and p_amount_ore > private.child_balance(p_child) then
    raise exception 'Der er ikke penge nok på saldoen' using errcode = 'check_violation';
  end if;
  if p_kind = 'purchase' and not adult and p_amount_ore > private.child_balance(p_child) then
    raise exception 'Der er ikke penge nok på saldoen' using errcode = 'check_violation';
  end if;

  insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore, note, goal_id, occurred_on, created_by)
  values (hid, p_child, p_kind, p_amount_ore, nullif(trim(p_note), ''), p_goal,
          coalesce(p_occurred_on, (now() at time zone 'Europe/Copenhagen')::date), me)
  returning id into tid;
  return tid;
end;
$$;

-- Fortryd en bevægelse (kun voksne). Bevægelsen bevares i historikken.
create or replace function public.child_wallet_void(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.child_wallet_transactions;
begin
  select * into t from public.child_wallet_transactions where id = p_tx for update;
  if not found or not private.is_household_member(t.household_id) then
    raise exception 'Bevægelsen findes ikke' using errcode = 'no_data_found';
  end if;
  perform pg_advisory_xact_lock(hashtext('child_wallet:' || t.child_id::text));
  -- Et mål må aldrig ende i minus
  if t.kind = 'to_goal' and private.child_goal_saved(t.goal_id) - t.amount_ore < 0 then
    raise exception 'Pengene er allerede taget fra målet' using errcode = 'check_violation';
  end if;
  update public.child_wallet_transactions set voided_at = now(), voided_by = auth.uid()
  where id = p_tx and voided_at is null;
end;
$$;

-- Opret mål (barnet for sig selv, voksne for husstandens børn)
create or replace function public.child_goal_create(p_child uuid, p_name text, p_target_ore bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  gid uuid;
begin
  if hid is null or not private.is_child_of(hid, p_child) then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;
  if not (private.is_household_member(hid) or auth.uid() = p_child) then
    raise exception 'Ikke tilladt' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.child_savings_goals where child_id = p_child and archived_at is null) >= 20 then
    raise exception 'Højst 20 aktive mål' using errcode = 'check_violation';
  end if;
  insert into public.child_savings_goals (household_id, child_id, name, target_ore)
  values (hid, p_child, trim(p_name), p_target_ore)
  returning id into gid;
  return gid;
end;
$$;

-- Ret navn/målbeløb eller afslut et mål. Ved afslutning flyttes pengene tilbage til saldoen.
create or replace function public.child_goal_update(p_goal uuid, p_name text, p_target_ore bigint, p_archive boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.child_savings_goals;
  saved bigint;
begin
  select * into g from public.child_savings_goals where id = p_goal for update;
  if not found or not private.is_household_any(g.household_id)
     or not (private.is_household_member(g.household_id) or g.child_id = auth.uid()) then
    raise exception 'Målet findes ikke' using errcode = 'no_data_found';
  end if;
  perform pg_advisory_xact_lock(hashtext('child_wallet:' || g.child_id::text));
  update public.child_savings_goals
  set name = coalesce(nullif(trim(p_name), ''), name),
      target_ore = coalesce(p_target_ore, target_ore),
      archived_at = case when p_archive then coalesce(archived_at, now()) else archived_at end
  where id = p_goal;
  if p_archive and g.archived_at is null then
    saved := private.child_goal_saved(p_goal);
    if saved > 0 then
      insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore, note, goal_id, created_by)
      values (g.household_id, g.child_id, 'from_goal', saved, 'Mål afsluttet: ' || g.name, p_goal, auth.uid());
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roller: kun owners kan ændre andres rolle. Ingen kan ændre sin egen.
-- -----------------------------------------------------------------------------
create or replace function public.set_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
begin
  if hid is null or not private.is_household_owner(hid) then
    raise exception 'Kun ejere kan ændre roller' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then
    raise exception 'Du kan ikke ændre din egen rolle' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('owner', 'adult', 'child') then
    raise exception 'Ugyldig rolle' using errcode = 'check_violation';
  end if;
  update public.household_members set role = p_role where household_id = hid and user_id = p_user;
  if not found then
    raise exception 'Medlemmet findes ikke' using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lukkede huller: kvittering og eksport kræver voksen
-- -----------------------------------------------------------------------------
create or replace function public.create_pending_receipt()
returns table (receipt_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  rid uuid := gen_random_uuid();
  path text;
begin
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  -- Værn mod løbske klienter: højst 30 ventende uploads pr. døgn
  if (select count(*) from public.receipts r
      where r.household_id = hid and r.status = 'pending' and r.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'For mange ventende kvitteringer. Prøv igen senere.' using errcode = 'program_limit_exceeded';
  end if;

  path := hid::text || '/' || rid::text || '.jpg';
  insert into public.receipts (id, household_id, status, storage_path, uploaded_by)
  values (rid, hid, 'pending', path, auth.uid());

  return query select rid, path;
end;
$$;

-- Eksport kun for voksne (et barn ville ellers få en delvis eksport)
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
    'version', 3,
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
    'child_wallet_transactions', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on, x.created_at) from public.child_wallet_transactions x where x.household_id = hid), '[]')
  ) into out;
  return out;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifikationer: påmindelser til deltagerne (eller hele familien);
-- nye varer på indkøbslisten kun til voksne
-- -----------------------------------------------------------------------------
create or replace function public.claim_push_messages()
returns table (subscription_id uuid, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
  msgs jsonb := '[]'::jsonb;
begin
  for r in
    update private.push_queue_test q set sent_at = now()
    where q.sent_at is null
    returning q.user_id
  loop
    msgs := msgs || jsonb_build_object('user_id', r.user_id, 'kind', 'test', 'payload', jsonb_build_object(
      'title', 'Hjem', 'body', 'Notifikationer virker på denne telefon.', 'url', '/indstillinger', 'tag', 'test', 'ttl', 300));
  end loop;

  for r in
    select e.id, e.household_id, e.title, e.event_date, e.start_time, e.end_time, e.participant_ids, d.remind_at
    from private.due_reminders() d
    join public.calendar_events e on e.id = d.event_id
  loop
    insert into private.calendar_reminders_sent (event_id, remind_at) values (r.id, r.remind_at)
    on conflict do nothing;
    continue when not found;
    select msgs || coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'kind', 'calendar', 'payload', jsonb_build_object(
      'title', r.title,
      'body', private.event_when_text(r.event_date, r.start_time, r.end_time),
      'url', '/hjemmet/kalender/' || r.id,
      'tag', 'event-' || r.id,
      'ttl', 3600))), '[]'::jsonb)
    into msgs
    from public.household_members m
    where m.household_id = r.household_id
      and (cardinality(r.participant_ids) = 0 or m.user_id = any (r.participant_ids));
  end loop;

  for r in
    with ready as (
      select q.household_id, q.added_by
      from private.push_queue_shopping q
      where q.sent_at is null
      group by q.household_id, q.added_by
      having max(q.created_at) < now() - interval '30 seconds'
    ), claimed as (
      update private.push_queue_shopping q set sent_at = now()
      from ready
      where q.household_id = ready.household_id and q.added_by = ready.added_by and q.sent_at is null
      returning q.household_id, q.added_by, q.item_id, q.created_at
    )
    select c.household_id, c.added_by,
      array_agg(i.name order by i.created_at) filter (where i.id is not null and not i.is_checked and c.created_at > now() - interval '15 minutes') as names
    from claimed c
    left join public.shopping_items i on i.id = c.item_id
    group by c.household_id, c.added_by
  loop
    continue when r.names is null;
    select msgs || coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'kind', 'shopping', 'payload', jsonb_build_object(
      'title', 'Indkøbslisten',
      'body', coalesce((select p.display_name from public.profiles p where p.id = r.added_by), 'Nogen') || ' tilføjede ' || private.danish_list(r.names),
      'url', '/indkob',
      'tag', 'shopping',
      'ttl', 21600))), '[]'::jsonb)
    into msgs
    from public.household_members m
    where m.household_id = r.household_id and m.user_id <> r.added_by and m.role <> 'child';
  end loop;

  return query
    select s.id, s.endpoint, s.p256dh, s.auth, m.value -> 'payload'
    from jsonb_array_elements(msgs) m
    join public.push_subscriptions s on s.user_id = (m.value ->> 'user_id')::uuid and s.disabled_at is null
    join public.profiles p on p.id = s.user_id
    where case m.value ->> 'kind'
      when 'calendar' then p.notify_calendar
      when 'shopping' then p.notify_shopping
      else true
    end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.is_household_any(uuid) from public, anon;
revoke all on function private.is_household_owner(uuid) from public, anon;
revoke all on function private.is_child_of(uuid, uuid) from public, anon;
revoke all on function private.calendar_participants() from public, anon, authenticated;
revoke all on function private.child_balance(uuid) from public, anon, authenticated;
revoke all on function private.child_goal_saved(uuid) from public, anon, authenticated;
grant execute on function private.is_household_any(uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;
grant execute on function private.is_child_of(uuid, uuid) to authenticated;

revoke all on function public.child_wallet_add(uuid, text, bigint, text, uuid, date) from public, anon;
revoke all on function public.child_wallet_void(uuid) from public, anon;
revoke all on function public.child_goal_create(uuid, text, bigint) from public, anon;
revoke all on function public.child_goal_update(uuid, text, bigint, boolean) from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.child_wallet_add(uuid, text, bigint, text, uuid, date) to authenticated;
grant execute on function public.child_wallet_void(uuid) to authenticated;
grant execute on function public.child_goal_create(uuid, text, bigint) to authenticated;
grant execute on function public.child_goal_update(uuid, text, bigint, boolean) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
revoke all on function public.claim_push_messages() from public, anon, authenticated;
grant execute on function public.claim_push_messages() to service_role;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.export_household_data() to authenticated;
revoke all on function public.create_pending_receipt() from public, anon;
grant execute on function public.create_pending_receipt() to authenticated;

-- =============================================================================
-- DEL 2 (køres i SQL Editor – indeholder DROP/DELETE, som kræver godkendelse)
-- =============================================================================
-- Nye roller: owner / adult / child ('member' bliver til 'adult')
alter table public.household_members drop constraint household_members_role_check;
update public.household_members set role = 'adult' where role = 'member';
alter table public.household_members add constraint household_members_role_check check (role in ('owner', 'adult', 'child'));
alter table public.household_members alter column role set default 'adult';

-- Opgaver: barnet må ændre status på egne opgaver (og intet andet)
create or replace function public.set_task_status(p_task_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.household_tasks;
  next_id uuid;
begin
  select * into t from public.household_tasks where id = p_task_id for update;
  if not found
     or not (private.is_household_member(t.household_id)
             or (t.assignee_id = auth.uid() and private.is_household_any(t.household_id))) then
    raise exception 'Opgaven findes ikke' using errcode = 'no_data_found';
  end if;
  if p_status not in ('open', 'in_progress', 'done') then
    raise exception 'Ugyldig status' using errcode = 'check_violation';
  end if;

  if p_status = 'done' then
    if t.status <> 'done' then
      update public.household_tasks set status = 'done', completed_at = now(), completed_by = auth.uid() where id = t.id;
    end if;
    if t.recurrence <> 'none' then
      insert into public.household_tasks (
        household_id, title, description, assignee_id, due_on, priority, recurrence, recurrence_interval,
        series_id, previous_task_id, created_by, reward_ore
      ) values (
        t.household_id, t.title, t.description, t.assignee_id,
        private.next_due(t.due_on, t.recurrence, t.recurrence_interval),
        t.priority, t.recurrence, t.recurrence_interval, t.series_id, t.id, auth.uid(), t.reward_ore
      )
      on conflict (previous_task_id) do nothing;
      select id into next_id from public.household_tasks where previous_task_id = t.id;
    end if;
    return next_id;
  end if;

  if t.status = 'done' then
    delete from public.household_tasks where previous_task_id = t.id and status = 'open';
  end if;
  update public.household_tasks set status = p_status, completed_at = null, completed_by = null where id = t.id;
  return null;
end;
$$;
