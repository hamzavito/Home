-- =============================================================================
-- Hjemmet: indkøb, opgaver og kalender
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Indkøb (én fælles liste nu – modellen understøtter flere lister senere)
-- -----------------------------------------------------------------------------
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create trigger shopping_lists_updated_at before update on public.shopping_lists
  for each row execute function private.set_updated_at();

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  list_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  quantity text check (quantity is null or length(quantity) <= 30),
  note text check (note is null or length(note) <= 200),
  is_checked boolean not null default false,
  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  added_by uuid not null default auth.uid() references public.profiles (id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_items_checked check (is_checked = (checked_at is not null)),
  foreign key (household_id, list_id) references public.shopping_lists (household_id, id) on delete cascade
);
create index shopping_items_list_idx on public.shopping_items (list_id, is_checked, sort_order);

-- Hvem/hvornår afkrydset sættes af databasen (kan ikke forfalskes)
create or replace function private.shopping_items_checked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.is_checked is distinct from old.is_checked then
    if new.is_checked then
      new.checked_at := now();
      new.checked_by := auth.uid();
    else
      new.checked_at := null;
      new.checked_by := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger shopping_items_checked before insert or update on public.shopping_items
  for each row execute function private.shopping_items_checked();

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
revoke all on public.shopping_lists, public.shopping_items from anon;

create policy "Se lister" on public.shopping_lists for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret liste" on public.shopping_lists for insert to authenticated
  with check (private.is_household_member(household_id));
create policy "Ret liste" on public.shopping_lists for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
revoke insert, update, delete, truncate on public.shopping_lists from authenticated;
grant insert (household_id, name, sort_order) on public.shopping_lists to authenticated;
grant update (name, sort_order, archived_at) on public.shopping_lists to authenticated;

create policy "Se varer" on public.shopping_items for select to authenticated
  using (private.is_household_member(household_id));
create policy "Tilføj vare" on public.shopping_items for insert to authenticated
  with check (private.is_household_member(household_id) and added_by = (select auth.uid()));
create policy "Ret vare" on public.shopping_items for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Slet vare" on public.shopping_items for delete to authenticated
  using (private.is_household_member(household_id));
revoke insert, update, truncate on public.shopping_items from authenticated;
grant insert (household_id, list_id, name, quantity, note, is_checked, sort_order) on public.shopping_items to authenticated;
grant update (name, quantity, note, is_checked, sort_order) on public.shopping_items to authenticated;
grant delete on public.shopping_items to authenticated;

-- Standardlisten oprettes ved første brug (idempotent)
create or replace function public.ensure_shopping_list()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  lid uuid;
begin
  if hid is null then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  -- Lås husstanden, så to telefoner ikke opretter hver sin liste samtidig
  perform pg_advisory_xact_lock(hashtext('shopping:' || hid::text));
  select id into lid from public.shopping_lists where household_id = hid and archived_at is null order by sort_order, created_at limit 1;
  if lid is null then
    insert into public.shopping_lists (household_id, name) values (hid, 'Indkøb') returning id into lid;
  end if;
  return lid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Opgaver med gentagelse
-- -----------------------------------------------------------------------------
create table public.household_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  description text check (description is null or length(description) <= 1000),
  assignee_id uuid,
  due_on date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  -- Hver N. dag/uge/måned (fx hver 2. uge)
  recurrence_interval smallint not null default 1 check (recurrence_interval between 1 and 365),
  series_id uuid not null default gen_random_uuid(),
  -- Én opgave kan højst have én efterfølger → ingen dubletter ved gentagelse
  previous_task_id uuid unique references public.household_tasks (id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_tasks_done check ((status = 'done') = (completed_at is not null)),
  constraint household_tasks_recurring_due check (recurrence = 'none' or due_on is not null),
  foreign key (household_id, assignee_id) references public.household_members (household_id, user_id) on delete set null (assignee_id)
);
create index household_tasks_open_idx on public.household_tasks (household_id, status, due_on);
create trigger household_tasks_updated_at before update on public.household_tasks
  for each row execute function private.set_updated_at();

alter table public.household_tasks enable row level security;
revoke all on public.household_tasks from anon;
create policy "Se opgaver" on public.household_tasks for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret opgave" on public.household_tasks for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()) and status <> 'done');
create policy "Ret opgave" on public.household_tasks for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Slet opgave" on public.household_tasks for delete to authenticated
  using (private.is_household_member(household_id));
revoke insert, update, truncate on public.household_tasks from authenticated;
grant insert (household_id, title, description, assignee_id, due_on, priority, recurrence, recurrence_interval) on public.household_tasks to authenticated;
-- Status ændres kun via set_task_status (så gentagelser håndteres ét sted)
grant update (title, description, assignee_id, due_on, priority, recurrence, recurrence_interval, archived_at) on public.household_tasks to authenticated;
grant delete on public.household_tasks to authenticated;

create or replace function private.next_due(p_due date, p_recurrence text, p_interval smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_recurrence
    when 'daily' then p_due + p_interval
    when 'weekly' then p_due + 7 * p_interval
    when 'monthly' then (p_due + make_interval(months => p_interval))::date
  end;
$$;

-- Skift status. 'done' på en gentagende opgave opretter næste forekomst præcis én gang.
-- Genåbnes en opgave, fjernes en efterfølger der endnu ikke er påbegyndt.
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
  if not found or not private.is_household_member(t.household_id) then
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
        series_id, previous_task_id, created_by
      ) values (
        t.household_id, t.title, t.description, t.assignee_id,
        private.next_due(t.due_on, t.recurrence, t.recurrence_interval),
        t.priority, t.recurrence, t.recurrence_interval, t.series_id, t.id, auth.uid()
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

-- -----------------------------------------------------------------------------
-- Kalender
-- -----------------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  event_date date not null,
  -- Valgfri slutdato for flerdagsbegivenheder (fx ferie)
  end_date date,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  description text check (description is null or length(description) <= 1000),
  type text not null default 'family' check (type in ('family', 'work', 'doctor', 'vacation', 'kids', 'other')),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_all_day check (all_day = (start_time is null)),
  constraint calendar_end_time check (end_time is null or start_time is not null),
  constraint calendar_end_date check (end_date is null or end_date >= event_date),
  constraint calendar_same_day_order check (end_date is not null or end_time is null or end_time > start_time)
);
create index calendar_events_date_idx on public.calendar_events (household_id, event_date);
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function private.set_updated_at();

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon;
create policy "Se aftaler" on public.calendar_events for select to authenticated
  using (private.is_household_member(household_id));
create policy "Opret aftale" on public.calendar_events for insert to authenticated
  with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
create policy "Ret aftale" on public.calendar_events for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy "Slet aftale" on public.calendar_events for delete to authenticated
  using (private.is_household_member(household_id));
revoke insert, update, truncate on public.calendar_events from authenticated;
grant insert (household_id, title, event_date, end_date, start_time, end_time, all_day, description, type) on public.calendar_events to authenticated;
grant update (title, event_date, end_date, start_time, end_time, all_day, description, type) on public.calendar_events to authenticated;
grant delete on public.calendar_events to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: indkøbslisten synkroniseres mellem telefonerne (RLS gælder også her)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end;
$$;

revoke all on function public.ensure_shopping_list() from public, anon;
revoke all on function public.set_task_status(uuid, text) from public, anon;
grant execute on function public.ensure_shopping_list() to authenticated;
grant execute on function public.set_task_status(uuid, text) to authenticated;
