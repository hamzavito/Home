-- =============================================================================
-- Fase 3: Kvitteringer
-- =============================================================================
-- Datamodel
--  * status: 'pending' (under scanning/upload – påvirker IKKE økonomien)
--            'approved' (godkendt – har præcis én transaktion)
--  * Billedets tilstand er en separat dimension: image_deleted_at sættes og
--    storage_path nulstilles, når billedet slettes. En godkendt kvittering
--    forbliver 'approved' – også efter billedet er slettet.
--  * Én sandhedskilde: butik, beløb, dato, kategori og betalt af ligger på
--    transaktionen. Kvitteringen peger på den (transaction_id) og dublerer
--    ikke økonomiske felter, så de aldrig kan komme ud af sync.
--  * Billedsti er fastlagt: '{household_id}/{receipt_id}.jpg'.
--
-- Flow
--  1. create_pending_receipt()      → række + sti (ingen økonomi)
--  2. Klienten uploader billedet til den private bucket 'receipts'
--  3. approve_receipt(...)          → transaktion + godkendelse atomisk, idempotent
--     Annullering: klienten sletter billedet og den ventende række.
--  4. Oprydning (service role, dagligt): udløbne billeder, forladte uploads
--     (> 24 t) og forældreløse filer. Alle trin er idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabel
-- -----------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  storage_path text unique,
  transaction_id uuid unique,
  retention text check (retention in ('30d', '3m', '6m', '1y', 'custom', 'permanent')),
  delete_at timestamptz,
  image_deleted_at timestamptz,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id) on delete restrict,
  -- Stien er altid husstand/kvittering.jpg
  constraint receipts_path_format
    check (storage_path is null or storage_path = household_id::text || '/' || id::text || '.jpg'),
  -- Billede findes ⇔ ikke slettet
  constraint receipts_image_state
    check ((storage_path is null) = (image_deleted_at is not null)),
  -- Ventende: ingen transaktion, billede ikke slettet
  constraint receipts_pending_shape
    check (status <> 'pending' or (transaction_id is null and storage_path is not null)),
  -- Godkendt: transaktion + opbevaring. Permanent ⇔ delete_at er NULL
  constraint receipts_approved_shape
    check (status <> 'approved' or (
      transaction_id is not null and retention is not null and approved_at is not null
      and ((retention = 'permanent') = (delete_at is null))
    ))
);

create index receipts_household_idx on public.receipts (household_id, status, created_at desc);
create index receipts_delete_at_idx on public.receipts (delete_at)
  where status = 'approved' and storage_path is not null and delete_at is not null;
create index receipts_pending_idx on public.receipts (created_at) where status = 'pending';

create trigger receipts_updated_at
  before update on public.receipts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: læs egen husstand; direkte sletning kun af ventende kvitteringer
-- (annullering). Alt andet sker via funktionerne nedenfor.
-- -----------------------------------------------------------------------------
alter table public.receipts enable row level security;
revoke all on public.receipts from anon;
revoke insert, update, delete, truncate on public.receipts from authenticated;
grant delete on public.receipts to authenticated;

create policy "Se husstandens kvitteringer" on public.receipts
  for select to authenticated using (private.is_household_member(household_id));
create policy "Annullér ventende kvittering" on public.receipts
  for delete to authenticated
  using (private.is_household_member(household_id) and status = 'pending');

-- -----------------------------------------------------------------------------
-- Opbevaring: beregn sletningstidspunkt (dansk tid, midnat på sletningsdagen)
-- -----------------------------------------------------------------------------
create or replace function private.receipt_delete_at(p_retention text, p_custom_date date, p_base_date date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (
    case p_retention
      when '30d' then p_base_date + 30
      when '3m' then (p_base_date + interval '3 months')::date
      when '6m' then (p_base_date + interval '6 months')::date
      when '1y' then (p_base_date + interval '1 year')::date
      when 'custom' then p_custom_date
      else null
    end
  )::timestamp at time zone 'Europe/Copenhagen';
$$;

create or replace function private.today_dk()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Copenhagen')::date;
$$;

create or replace function private.validate_retention(p_retention text, p_custom_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_retention is null or p_retention not in ('30d', '3m', '6m', '1y', 'custom', 'permanent') then
    raise exception 'Ugyldig opbevaringstid' using errcode = 'check_violation';
  end if;
  if p_retention = 'custom' and (p_custom_date is null or p_custom_date <= private.today_dk()) then
    raise exception 'Vælg en dato efter i dag' using errcode = 'check_violation';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Opret ventende kvittering (før upload)
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
  if hid is null then
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

-- -----------------------------------------------------------------------------
-- 2. Godkend: opret transaktion + godkend kvittering atomisk.
--    Idempotent: kaldes den igen (dobbelttryk/genforsøg), returneres den
--    samme transaktion. FOR UPDATE serialiserer samtidige kald.
-- -----------------------------------------------------------------------------
create or replace function public.approve_receipt(
  p_receipt_id uuid,
  p_category_id uuid,
  p_amount_ore bigint,
  p_occurred_on date,
  p_description text,
  p_note text,
  p_paid_by_kind text,
  p_paid_by_user_id uuid,
  p_retention text,
  p_custom_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receipts;
  tid uuid;
begin
  select * into r from public.receipts where id = p_receipt_id for update;
  if not found or not private.is_household_member(r.household_id) then
    raise exception 'Kvitteringen findes ikke' using errcode = 'no_data_found';
  end if;

  if r.status = 'approved' then
    return r.transaction_id;
  end if;

  if not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = r.storage_path) then
    raise exception 'Billedet er ikke uploadet endnu' using errcode = 'check_violation';
  end if;

  perform private.validate_retention(p_retention, p_custom_date);

  -- Kategori og "betalt af" valideres af fremmednøgler (samme husstand),
  -- og arkiverede kategorier afvises af transactions-triggeren.
  insert into public.transactions (
    household_id, category_id, amount_ore, occurred_on, description, note,
    paid_by_kind, paid_by_user_id, source, created_by
  ) values (
    r.household_id, p_category_id, p_amount_ore, p_occurred_on, trim(p_description), nullif(trim(p_note), ''),
    p_paid_by_kind, case when p_paid_by_kind = 'member' then p_paid_by_user_id end, 'receipt', auth.uid()
  )
  returning id into tid;

  update public.receipts
     set status = 'approved',
         transaction_id = tid,
         retention = p_retention,
         delete_at = private.receipt_delete_at(p_retention, p_custom_date, private.today_dk()),
         approved_at = now()
   where id = r.id;

  return tid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ændr opbevaring for en godkendt kvittering (regnes fra godkendelsesdatoen)
-- -----------------------------------------------------------------------------
create or replace function public.set_receipt_retention(p_receipt_id uuid, p_retention text, p_custom_date date default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receipts;
  new_delete_at timestamptz;
begin
  select * into r from public.receipts where id = p_receipt_id for update;
  if not found or not private.is_household_member(r.household_id) then
    raise exception 'Kvitteringen findes ikke' using errcode = 'no_data_found';
  end if;
  if r.status <> 'approved' then
    raise exception 'Kvitteringen er ikke godkendt' using errcode = 'check_violation';
  end if;
  if r.image_deleted_at is not null then
    raise exception 'Billedet er allerede slettet' using errcode = 'check_violation';
  end if;
  perform private.validate_retention(p_retention, p_custom_date);

  new_delete_at := private.receipt_delete_at(p_retention, p_custom_date, (r.approved_at at time zone 'Europe/Copenhagen')::date);
  update public.receipts set retention = p_retention, delete_at = new_delete_at where id = r.id;
  return new_delete_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Slet en transaktion (og dens kvittering). Returnerer evt. billedsti, som
-- klienten derefter fjerner fra Storage. Fejler det, fanger den daglige
-- oprydning den forældreløse fil.
-- -----------------------------------------------------------------------------
create or replace function public.delete_transaction(p_transaction_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
  path text;
begin
  select household_id into hid from public.transactions where id = p_transaction_id for update;
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Udgiften findes ikke' using errcode = 'no_data_found';
  end if;
  delete from public.receipts where transaction_id = p_transaction_id returning storage_path into path;
  delete from public.transactions where id = p_transaction_id;
  return path;
end;
$$;

-- -----------------------------------------------------------------------------
-- Kategoriforslag ud fra husstandens egne tidligere udgifter hos samme butik
-- -----------------------------------------------------------------------------
create or replace function public.suggest_category(p_merchant text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select t.category_id, t.occurred_on, t.created_at
    from public.transactions t
    join public.budget_categories c on c.id = t.category_id and c.archived_at is null
    where t.household_id = public.current_household_id()
      and lower(trim(t.description)) = lower(trim(p_merchant))
    order by t.occurred_on desc, t.created_at desc
    limit 50
  )
  select category_id
  from recent
  group by category_id
  order by count(*) desc, max(occurred_on) desc, max(created_at) desc
  limit 1;
$$;

revoke all on function public.create_pending_receipt() from public, anon;
revoke all on function public.approve_receipt(uuid, uuid, bigint, date, text, text, text, uuid, text, date) from public, anon;
revoke all on function public.set_receipt_retention(uuid, text, date) from public, anon;
revoke all on function public.delete_transaction(uuid) from public, anon;
revoke all on function public.suggest_category(text) from public, anon;
grant execute on function public.create_pending_receipt() to authenticated;
grant execute on function public.approve_receipt(uuid, uuid, bigint, date, text, text, text, uuid, text, date) to authenticated;
grant execute on function public.set_receipt_retention(uuid, text, date) to authenticated;
grant execute on function public.delete_transaction(uuid) to authenticated;
grant execute on function public.suggest_category(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Oprydning (kun service role – kaldes af Edge Function cleanup-receipts)
-- Mønster: "claim" rækker atomisk i databasen FØRST, slet derefter filerne.
-- Fejler filsletningen, er filen ikke længere refereret og fanges af
-- forældreløs-oprydningen næste gang. Ingen trin fejler ved manglende filer.
-- -----------------------------------------------------------------------------

-- Udløbne billeder: nulstil sti og sæt image_deleted_at. Transaktion og
-- kvitteringsrække bevares. Permanente (delete_at NULL) berøres aldrig.
create or replace function public.claim_expired_receipt_images(p_limit integer default 200)
returns table (receipt_id uuid, storage_path text)
language sql
security definer
set search_path = ''
as $$
  with c as (
    select r.id, r.storage_path
    from public.receipts r
    where r.status = 'approved'
      and r.storage_path is not null
      and r.delete_at is not null
      and r.delete_at <= now()
    order by r.delete_at
    limit p_limit
    for update skip locked
  )
  update public.receipts r
     set storage_path = null, image_deleted_at = now()
    from c
   where r.id = c.id
  returning r.id, c.storage_path;
$$;

-- Forladte uploads: ventende kvitteringer ældre end 24 timer slettes helt
-- (de har aldrig påvirket økonomien).
create or replace function public.claim_abandoned_receipts(p_limit integer default 200)
returns table (receipt_id uuid, storage_path text)
language sql
security definer
set search_path = ''
as $$
  with c as (
    select r.id
    from public.receipts r
    where r.status = 'pending' and r.created_at < now() - interval '24 hours'
    order by r.created_at
    limit p_limit
    for update skip locked
  )
  delete from public.receipts r
   using c
   where r.id = c.id
  returning r.id, r.storage_path;
$$;

-- Forældreløse filer: objekter i bucket 'receipts' (ældre end 24 t), som ingen
-- kvittering refererer til.
create or replace function public.list_orphan_receipt_files(p_limit integer default 500)
returns table (storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'receipts'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.receipts r where r.storage_path = o.name)
  order by o.created_at
  limit p_limit;
$$;

revoke all on function public.claim_expired_receipt_images(integer) from public, anon, authenticated;
revoke all on function public.claim_abandoned_receipts(integer) from public, anon, authenticated;
revoke all on function public.list_orphan_receipt_files(integer) from public, anon, authenticated;
grant execute on function public.claim_expired_receipt_images(integer) to service_role;
grant execute on function public.claim_abandoned_receipts(integer) to service_role;
grant execute on function public.list_orphan_receipt_files(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Storage: privat bucket + policies der matcher database-RLS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 8388608, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Første mappe i stien er husstandens id. Ugyldige stier giver NULL (= ingen adgang).
create or replace function private.receipt_object_household(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;
grant execute on function private.receipt_object_household(text) to authenticated;

-- Læs: kun billeder i egen husstands mappe (gættede stier til andre husstande giver intet).
create policy "Kvitteringsbilleder: læs egen husstand" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and private.is_household_member(private.receipt_object_household(storage.objects.name)));

-- Upload: kun til en ventende kvittering, som brugeren selv har oprettet.
create policy "Kvitteringsbilleder: upload til ventende kvittering" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.receipts r
      where r.storage_path = storage.objects.name
        and r.status = 'pending'
        and r.uploaded_by = (select auth.uid())
        and private.is_household_member(r.household_id)
    )
  );

-- Slet: egen husstand, men aldrig billedet til en godkendt kvittering
-- (det slettes kun af den automatiske oprydning).
create policy "Kvitteringsbilleder: slet ventende eller forældreløse" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and private.is_household_member(private.receipt_object_household(storage.objects.name))
    and not exists (
      select 1 from public.receipts r
      where r.storage_path = storage.objects.name and r.status = 'approved'
    )
  );
-- Ingen UPDATE-policy: billeder kan ikke overskrives.
