-- =============================================================================
-- Notifikationer (Web Push): påmindelser om aftaler og nye varer på indkøbslisten
-- =============================================================================
-- Flow:
--   1. Telefonen tilmelder sig (save_push_subscription) – kun installeret PWA på iPhone.
--   2. Supabase Cron kalder private.push_tick() hvert minut. Den kalder KUN Edge
--      Functionen 'send-push', når der faktisk er noget at sende.
--   3. Edge Functionen henter beskederne via claim_push_messages (service role),
--      krypterer og sender dem. Hver besked kan kun hentes én gang.
-- VAPID-nøglerne og den delte hemmelighed ligger i Supabase Vault.
-- Opsætning af Vault + Cron: supabase/setup/schedule_push.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Indstillinger pr. person (gælder alle personens telefoner)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column notify_calendar boolean not null default true,
  add column notify_shopping boolean not null default true;
grant update (notify_calendar, notify_shopping) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Påmindelse pr. aftale: minutter før start (NULL = ingen påmindelse).
-- Heldagsaftaler regnes fra midnat: 360 = dagen før kl. 18, -480 = samme dag kl. 8.
-- -----------------------------------------------------------------------------
alter table public.calendar_events
  add column reminder_minutes integer
  check (reminder_minutes is null or reminder_minutes between -720 and 10080);
grant insert (reminder_minutes) on public.calendar_events to authenticated;
grant update (reminder_minutes) on public.calendar_events to authenticated;

-- Kommende aftaler med klokkeslæt får en påmindelse 1 time før.
-- updated_at røres ikke (det er ikke en ændring, nogen har lavet).
alter table public.calendar_events disable trigger calendar_events_updated_at;
update public.calendar_events set reminder_minutes = 60
where not all_day and event_date >= current_date and reminder_minutes is null;
alter table public.calendar_events enable trigger calendar_events_updated_at;

-- Tidspunktet for påmindelsen (dansk tid, også omkring sommertid)
create or replace function private.event_reminder_at(p_date date, p_start time, p_minutes integer)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when p_minutes is null then null
    else ((p_date + coalesce(p_start, time '00:00')) at time zone 'Europe/Copenhagen') - make_interval(mins => p_minutes)
  end;
$$;

-- -----------------------------------------------------------------------------
-- Tilmeldte telefoner. Ingen direkte adgang fra appen – kun via funktionerne nedenfor.
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://[^\s]+$' and length(endpoint) <= 1024),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}=*$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}=*$'),
  -- Afmeldt (log ud, slået fra eller afvist af Apple/Google). Rækken genbruges ved ny tilmelding.
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Kø: nye varer på indkøbslisten (samles, så 5 varer giver én besked)
create table private.push_queue_shopping (
  item_id uuid primary key references public.shopping_items (id) on delete cascade,
  household_id uuid not null,
  added_by uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_queue_shopping_pending_idx on private.push_queue_shopping (household_id, added_by) where sent_at is null;

-- Sendte påmindelser (én pr. aftale og tidspunkt – flyttes aftalen, kan den sendes igen)
create table private.calendar_reminders_sent (
  event_id uuid not null references public.calendar_events (id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, remind_at)
);

-- Testbeskeder fra Indstillinger
create table private.push_queue_test (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create or replace function private.queue_shopping_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.push_queue_shopping (item_id, household_id, added_by)
  values (new.id, new.household_id, new.added_by)
  on conflict (item_id) do nothing;
  return null;
end;
$$;
create trigger shopping_items_push after insert on public.shopping_items
  for each row execute function private.queue_shopping_push();

-- -----------------------------------------------------------------------------
-- Hjælpere
-- -----------------------------------------------------------------------------
-- "mælk", "mælk og æg", "mælk, æg og brød", "mælk, æg, brød og 2 mere"
create or replace function private.danish_list(p_items text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when n = 0 then ''
    when n = 1 then p_items[1]
    when n <= 3 then array_to_string(p_items[1:n - 1], ', ') || ' og ' || p_items[n]
    else array_to_string(p_items[1:3], ', ') || ' og ' || (n - 3) || ' mere'
  end
  from (select coalesce(cardinality(p_items), 0) as n) s;
$$;

-- "I dag kl. 14.00–15.30", "I morgen hele dagen", "Fredag 17. oktober kl. 9.00"
create or replace function private.event_when_text(p_date date, p_start time, p_end time)
returns text
language sql
stable
set search_path = ''
as $$
  with t as (select (now() at time zone 'Europe/Copenhagen')::date as today)
  select
    case
      when p_date = t.today then 'I dag'
      when p_date = t.today + 1 then 'I morgen'
      else initcap((array['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'])[extract(dow from p_date)::int + 1])
        || ' ' || extract(day from p_date)::int || '. '
        || (array['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'])[extract(month from p_date)::int]
    end
    || case
      when p_start is null then ' hele dagen'
      else ' kl. ' || extract(hour from p_start)::int || '.' || lpad(extract(minute from p_start)::int::text, 2, '0')
        || coalesce('–' || extract(hour from p_end)::int || '.' || lpad(extract(minute from p_end)::int::text, 2, '0'), '')
    end
  from t;
$$;

-- Påmindelser der skal sendes nu. Kun hvis tidspunktet lå i fremtiden, da aftalen
-- sidst blev gemt (ingen påmindelse "bagud"), og højst 15 min. forsinket.
create or replace function private.due_reminders()
returns table (event_id uuid, remind_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, r.at
  from public.calendar_events e
  cross join lateral (select private.event_reminder_at(e.event_date, e.start_time, e.reminder_minutes) as at) r
  where e.reminder_minutes is not null
    and e.event_date between current_date - 2 and current_date + 9
    and r.at <= now()
    and r.at > now() - interval '15 minutes'
    and r.at > e.updated_at
    and not exists (select 1 from private.calendar_reminders_sent s where s.event_id = e.id and s.remind_at = r.at);
$$;

-- Er der noget at sende (og nogen at sende til)? Bruges af cron hvert minut.
create or replace function private.push_work_pending()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.push_subscriptions where disabled_at is null)
    and (
      exists (select 1 from private.push_queue_test where sent_at is null)
      or exists (select 1 from private.due_reminders())
      or exists (
        select 1 from private.push_queue_shopping
        where sent_at is null
        group by household_id, added_by
        having max(created_at) < now() - interval '30 seconds' and max(created_at) > now() - interval '15 minutes'
      )
    );
$$;

-- Kalder Edge Functionen (asynkront via pg_net), hvis der er noget at sende
create or replace function private.push_tick(p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url' limit 1);
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret' limit 1);
begin
  if fn_url is null or secret is null then
    return null; -- ikke sat op endnu
  end if;
  if not p_force and not private.push_work_pending() then
    return null;
  end if;
  return net.http_post(
    url := fn_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    timeout_milliseconds := 30000
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Funktioner til appen (logget ind)
-- -----------------------------------------------------------------------------
create or replace function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_public' limit 1;
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Ikke logget ind' using errcode = 'insufficient_privilege';
  end if;
  -- Samme telefon = samme endpoint. Logger en anden ind på telefonen, overtager de den.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        disabled_at = null, updated_at = now();
  -- Højst 10 aktive telefoner pr. person (de ældste afmeldes)
  update public.push_subscriptions s set disabled_at = now()
  where s.user_id = uid and s.disabled_at is null
    and s.id not in (
      select id from public.push_subscriptions
      where user_id = uid and disabled_at is null
      order by updated_at desc limit 10
    );
end;
$$;

create or replace function public.disable_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set disabled_at = now(), updated_at = now()
  where endpoint = p_endpoint and user_id = auth.uid() and disabled_at is null;
$$;

-- Testbesked til alle egne telefoner. Returnerer false hvis ingen telefon er tilmeldt.
create or replace function public.send_test_notification()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Ikke logget ind' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id = uid and disabled_at is null) then
    return false;
  end if;
  if (select count(*) from private.push_queue_test where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'For mange testbeskeder. Prøv igen senere.' using errcode = 'P0001';
  end if;
  insert into private.push_queue_test (user_id) values (uid);
  perform private.push_tick(true);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funktioner til Edge Functionen (kun service role)
-- -----------------------------------------------------------------------------
create or replace function public.verify_push_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32, false)
     and coalesce((
       select s.decrypted_secret = p_secret
       from vault.decrypted_secrets s
       where s.name = 'push_secret'
       limit 1
     ), false);
$$;

create or replace function public.push_vapid_keys()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public_key', pub.decrypted_secret,
    'private_jwk', priv.decrypted_secret,
    'subject', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_subject' limit 1), 'mailto:hjem@example.com')
  )
  from vault.decrypted_secrets pub, vault.decrypted_secrets priv
  where pub.name = 'push_vapid_public' and priv.name = 'push_vapid_private'
  limit 1;
$$;

-- Første kørsel: Edge Functionen genererer nøglerne og gemmer dem her (de skal aldrig skifte,
-- ellers skal alle telefoner tilmelde sig igen). Findes de allerede, beholdes de.
create or replace function public.init_push_vapid_keys(p_public text, p_private_jwk text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('push_vapid_keys'));
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_vapid_public') then
    perform vault.create_secret(p_private_jwk, 'push_vapid_private', 'Web Push: privat VAPID-nøgle (JWK)');
    perform vault.create_secret(p_public, 'push_vapid_public', 'Web Push: offentlig VAPID-nøgle');
  end if;
  return public.push_vapid_keys();
end;
$$;

-- Henter (og markerer som sendt) alle beskeder der skal ud nu – én række pr. telefon.
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
  -- 1. Testbeskeder
  for r in
    update private.push_queue_test q set sent_at = now()
    where q.sent_at is null
    returning q.user_id
  loop
    msgs := msgs || jsonb_build_object('user_id', r.user_id, 'kind', 'test', 'payload', jsonb_build_object(
      'title', 'Hjem', 'body', 'Notifikationer virker på denne telefon.', 'url', '/indstillinger', 'tag', 'test', 'ttl', 300));
  end loop;

  -- 2. Påmindelser om aftaler (til den aftalen gælder for – eller alle ved fælles)
  for r in
    select e.id, e.household_id, e.title, e.event_date, e.start_time, e.end_time, e.for_user_id, d.remind_at
    from private.due_reminders() d
    join public.calendar_events e on e.id = d.event_id
  loop
    insert into private.calendar_reminders_sent (event_id, remind_at) values (r.id, r.remind_at)
    on conflict do nothing;
    continue when not found; -- en anden kørsel nåede den først
    select msgs || coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'kind', 'calendar', 'payload', jsonb_build_object(
      'title', r.title,
      'body', private.event_when_text(r.event_date, r.start_time, r.end_time),
      'url', '/hjemmet/kalender/' || r.id,
      'tag', 'event-' || r.id,
      'ttl', 3600))), '[]'::jsonb)
    into msgs
    from public.household_members m
    where m.household_id = r.household_id and (r.for_user_id is null or m.user_id = r.for_user_id);
  end loop;

  -- 3. Nye varer: samlet pr. person, når der har været stille i 30 sek.
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
    continue when r.names is null; -- allerede købt/slettet eller for gammelt
    select msgs || coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'kind', 'shopping', 'payload', jsonb_build_object(
      'title', 'Indkøbslisten',
      'body', coalesce((select p.display_name from public.profiles p where p.id = r.added_by), 'Nogen') || ' tilføjede ' || private.danish_list(r.names),
      'url', '/indkob',
      'tag', 'shopping',
      'ttl', 21600))), '[]'::jsonb)
    into msgs
    from public.household_members m
    where m.household_id = r.household_id and m.user_id <> r.added_by;
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

-- Resultat fra afsendelsen: afviste telefoner (404/410) afmeldes
create or replace function public.record_push_results(p_ok uuid[], p_gone uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_success_at = now() where id = any (coalesce(p_ok, '{}'));
  update public.push_subscriptions set disabled_at = now(), updated_at = now() where id = any (coalesce(p_gone, '{}')) and disabled_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Rettigheder
-- -----------------------------------------------------------------------------
revoke all on function private.event_reminder_at(date, time, integer) from public, anon, authenticated;
revoke all on function private.queue_shopping_push() from public, anon, authenticated;
revoke all on function private.danish_list(text[]) from public, anon, authenticated;
revoke all on function private.event_when_text(date, time, time) from public, anon, authenticated;
revoke all on function private.due_reminders() from public, anon, authenticated;
revoke all on function private.push_work_pending() from public, anon, authenticated;
revoke all on function private.push_tick(boolean) from public, anon, authenticated;

revoke all on function public.push_public_key() from public, anon;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.disable_push_subscription(text) from public, anon;
revoke all on function public.send_test_notification() from public, anon;
grant execute on function public.push_public_key() to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.disable_push_subscription(text) to authenticated;
grant execute on function public.send_test_notification() to authenticated;

revoke all on function public.verify_push_secret(text) from public, anon, authenticated;
revoke all on function public.push_vapid_keys() from public, anon, authenticated;
revoke all on function public.init_push_vapid_keys(text, text) from public, anon, authenticated;
revoke all on function public.claim_push_messages() from public, anon, authenticated;
revoke all on function public.record_push_results(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.verify_push_secret(text) to service_role;
grant execute on function public.push_vapid_keys() to service_role;
grant execute on function public.init_push_vapid_keys(text, text) to service_role;
grant execute on function public.claim_push_messages() to service_role;
grant execute on function public.record_push_results(uuid[], uuid[]) to service_role;
