-- =============================================================================
-- Kvitteringsbillede på en eksisterende udgift: tilføj, udskift (fx drejet) og fjern
-- =============================================================================
-- Flow for tilføj/udskift: create_pending_receipt() → upload billede → attach_receipt().
-- En udgift har højst én kvittering (receipts.transaction_id er unik). Ved udskiftning
-- erstattes den gamle kvitteringsrække af den nye; den gamle fil returneres, så klienten
-- kan slette den (ellers fanger den daglige oprydning den som forældreløs).
-- Fjern: billedet slettes, men udgiften og kvitteringsrækken bevares (som ved udløb).
-- Kun voksne i husstanden (private.is_household_member). Børn har ingen adgang.
-- =============================================================================

create or replace function public.attach_receipt(
  p_receipt_id uuid,
  p_transaction_id uuid,
  p_retention text,
  p_custom_date date default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receipts;
  t public.transactions;
  old public.receipts;
  old_path text;
begin
  select * into r from public.receipts where id = p_receipt_id for update;
  if not found or not private.is_household_member(r.household_id) then
    raise exception 'Kvitteringen findes ikke' using errcode = 'no_data_found';
  end if;
  if r.status = 'approved' then
    -- Genforsøg/dobbelttryk: allerede tilknyttet denne udgift
    if r.transaction_id = p_transaction_id then
      return null;
    end if;
    raise exception 'Kvitteringen er allerede brugt' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = r.storage_path) then
    raise exception 'Billedet er ikke uploadet endnu' using errcode = 'check_violation';
  end if;

  select * into t from public.transactions where id = p_transaction_id and household_id = r.household_id for update;
  if not found then
    raise exception 'Udgiften findes ikke' using errcode = 'no_data_found';
  end if;
  perform private.validate_retention(p_retention, p_custom_date);

  -- Den gamle kvittering (med eller uden billede) erstattes
  select * into old from public.receipts where transaction_id = t.id for update;
  if found then
    old_path := old.storage_path;
    delete from public.receipts where id = old.id;
  end if;

  update public.receipts
     set status = 'approved',
         transaction_id = t.id,
         retention = p_retention,
         delete_at = private.receipt_delete_at(p_retention, p_custom_date, private.today_dk()),
         approved_at = now()
   where id = r.id;
  return old_path;
end;
$$;

-- Fjern billedet fra en udgift. Returnerer stien, så klienten kan slette filen.
create or replace function public.remove_receipt_image(p_receipt_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receipts;
begin
  select * into r from public.receipts where id = p_receipt_id for update;
  if not found or not private.is_household_member(r.household_id) then
    raise exception 'Kvitteringen findes ikke' using errcode = 'no_data_found';
  end if;
  if r.status <> 'approved' then
    raise exception 'Kvitteringen er ikke godkendt' using errcode = 'check_violation';
  end if;
  if r.storage_path is null then
    return null;
  end if;
  update public.receipts set storage_path = null, image_deleted_at = now() where id = r.id;
  return r.storage_path;
end;
$$;

revoke all on function public.attach_receipt(uuid, uuid, text, date) from public, anon;
revoke all on function public.remove_receipt_image(uuid) from public, anon;
grant execute on function public.attach_receipt(uuid, uuid, text, date) to authenticated;
grant execute on function public.remove_receipt_image(uuid) to authenticated;
