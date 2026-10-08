-- =============================================================================
-- Abonnement pr. husstand (Stripe)
-- =============================================================================
-- * Ét abonnement pr. husstand. Én voksen betaler; alle i husstanden er med.
-- * Nye husstande får 30 dages gratis prøveperiode (uden kort).
-- * Uden gyldigt abonnement bliver husstanden skrivebeskyttet: alt kan ses og
--   eksporteres, intet kan oprettes eller ændres (sletning er altid tilladt).
--   Håndhæves i databasen med en trigger på alle husstandens tabeller.
-- * Betaling slås først til, når private.app_settings.billing_enabled = true
--   (når Stripe er sat op). Indtil da har alle fuld adgang.
-- * Husstande oprettet før denne migration har ingen abonnementsrække og er
--   gratis for altid (som 'comped'). Ingen eksisterende data ændres.
-- * Stripe opdaterer status via Edge Function "stripe-webhook" (service role).
-- =============================================================================

create table private.app_settings (
  id boolean primary key default true check (id),
  billing_enabled boolean not null default false,
  trial_days int not null default 30 check (trial_days between 0 and 365),
  grace_days int not null default 7 check (grace_days between 0 and 60)
);
insert into private.app_settings (id) values (true);
revoke all on private.app_settings from public, anon, authenticated;

create table public.household_subscriptions (
  household_id uuid primary key references public.households (id) on delete cascade,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'comped')),
  plan text check (plan in ('monthly', 'yearly')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  payer_user_id uuid,
  stripe_customer_id text unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger household_subscriptions_updated_at
  before update on public.household_subscriptions
  for each row execute function private.set_updated_at();
alter table public.household_subscriptions enable row level security;
-- Ingen direkte adgang fra appen – kun via subscription_info() og Edge Functions
revoke all on public.household_subscriptions from anon, authenticated;

-- Ny husstand → prøveperiode
create or replace function private.household_subscription_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_subscriptions (household_id, status, trial_ends_at)
  select new.id, 'trialing', now() + make_interval(days => s.trial_days)
  from private.app_settings s;
  return new;
end;
$$;
create trigger households_subscription after insert on public.households
  for each row execute function private.household_subscription_trigger();

-- -----------------------------------------------------------------------------
-- Adgang
-- -----------------------------------------------------------------------------
create or replace function private.has_write_access(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce: en manglende dato (null) må aldrig give adgang ved en fejl
  select coalesce(
    not s.billing_enabled
    or sub.household_id is null
    or sub.status in ('comped', 'active')
    -- Prøveperioden gælder fuldt ud, også hvis et betalt abonnement opsiges undervejs
    or coalesce(sub.trial_ends_at > now(), false)
    or (sub.status = 'past_due' and coalesce(sub.current_period_end, now()) + make_interval(days => s.grace_days) > now()),
    false)
  from private.app_settings s
  left join public.household_subscriptions sub on sub.household_id = hid;
$$;

-- Skrivebeskyttelse: opret/ændr kræver gyldigt abonnement. Sletning er altid
-- tilladt. Systemjob (cron, Edge Functions med service role) er undtaget.
create or replace function private.enforce_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not private.has_write_access(new.household_id) then
    raise exception 'Abonnementet er udløbet. I kan se og eksportere jeres data, men ikke ændre noget, før abonnementet er fornyet.'
      using errcode = 'PT402';
  end if;
  return new;
end;
$$;

-- Alle husstandens tabeller (med household_id), undtagen selve husstanden,
-- medlemskab og abonnementet. Sikkerhedsrevisionen (08) tjekker, at nye
-- tabeller også får triggeren.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('households', 'household_members', 'household_subscriptions')
  loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.enforce_write_access()',
      t || '_write_access', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Til appen
-- -----------------------------------------------------------------------------
create or replace function public.subscription_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := public.current_household_id();
  sub public.household_subscriptions;
  s private.app_settings;
begin
  if hid is null or not private.is_household_any(hid) then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  select * into s from private.app_settings;
  select * into sub from public.household_subscriptions where household_id = hid;
  return jsonb_build_object(
    'billing_enabled', s.billing_enabled,
    'status', coalesce(sub.status, 'comped'),
    'plan', sub.plan,
    'trial_ends_at', sub.trial_ends_at,
    'current_period_end', sub.current_period_end,
    'grace_ends_at', case when sub.status = 'past_due' then coalesce(sub.current_period_end, now()) + make_interval(days => s.grace_days) end,
    'cancel_at_period_end', coalesce(sub.cancel_at_period_end, false),
    'payer_user_id', sub.payer_user_id,
    'has_customer', sub.stripe_customer_id is not null,
    'write_access', private.has_write_access(hid)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Til Edge Functions (kun service_role)
-- -----------------------------------------------------------------------------
-- Hvem er kalderen, og hvad er husstandens abonnement?
create or replace function public.billing_context(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'household_id', m.household_id,
    'household_name', h.name,
    'role', m.role,
    'status', coalesce(sub.status, 'comped'),
    'payer_user_id', sub.payer_user_id,
    'stripe_customer_id', sub.stripe_customer_id,
    'billing_enabled', (select billing_enabled from private.app_settings)
  )
  from public.household_members m
  join public.households h on h.id = m.household_id
  left join public.household_subscriptions sub on sub.household_id = m.household_id
  where m.user_id = p_user and m.left_at is null and m.disabled_at is null;
$$;

create or replace function public.billing_set_customer(p_household uuid, p_customer text)
returns void
language sql
security definer
set search_path = ''
as $$
  -- Uden række (gammel, gratis husstand) forbliver husstanden gratis
  insert into public.household_subscriptions (household_id, status, stripe_customer_id)
  values (p_household, 'comped', p_customer)
  on conflict (household_id) do update set stripe_customer_id = excluded.stripe_customer_id;
$$;

-- Stripe-status → husstandens abonnement. Ældre hændelser end den seneste ignoreres
-- (Stripe garanterer ikke rækkefølgen).
create or replace function public.billing_apply(
  p_household uuid,
  p_customer text,
  p_subscription text,
  p_status text,
  p_plan text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_payer uuid,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.household_subscriptions;
begin
  if not exists (select 1 from public.households where id = p_household) then
    return false; -- husstanden er slettet
  end if;
  select * into sub from public.household_subscriptions where household_id = p_household for update;
  if found and sub.last_event_at is not null and p_event_at < sub.last_event_at then
    return false;
  end if;
  -- Et nyt abonnement erstatter kun et gammelt, hvis det gamle ikke længere er aktivt
  if found and sub.stripe_subscription_id is not null and sub.stripe_subscription_id <> p_subscription
     and sub.status in ('active', 'past_due') and p_status = 'canceled' then
    return false;
  end if;
  insert into public.household_subscriptions as s (household_id, status, plan, current_period_end, cancel_at_period_end,
    payer_user_id, stripe_customer_id, stripe_subscription_id, last_event_at)
  values (p_household, p_status, p_plan, p_period_end, coalesce(p_cancel_at_period_end, false), p_payer, p_customer, p_subscription, p_event_at)
  on conflict (household_id) do update set
    status = excluded.status,
    plan = coalesce(excluded.plan, s.plan),
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    payer_user_id = coalesce(excluded.payer_user_id, s.payer_user_id),
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    last_event_at = excluded.last_event_at;
  return true;
end;
$$;

revoke all on function private.has_write_access(uuid) from public, anon, authenticated;
revoke all on function private.enforce_write_access() from public, anon, authenticated;
revoke all on function private.household_subscription_trigger() from public, anon, authenticated;
revoke all on function public.subscription_info() from public, anon;
grant execute on function public.subscription_info() to authenticated;
revoke all on function public.billing_context(uuid) from public, anon, authenticated;
revoke all on function public.billing_set_customer(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_apply(uuid, text, text, text, text, timestamptz, boolean, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_context(uuid) to service_role;
grant execute on function public.billing_set_customer(uuid, text) to service_role;
grant execute on function public.billing_apply(uuid, text, text, text, text, timestamptz, boolean, uuid, timestamptz) to service_role;
