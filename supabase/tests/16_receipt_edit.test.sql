-- Kvitteringsbillede på en eksisterende udgift: tilføj, udskift og fjern
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-a@internal.home'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'child'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mad', '00000000-0000-0000-0000-0000000000a1'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B-mad', '00000000-0000-0000-0000-0000000000b1');
-- Udgifter uden kvittering
insert into public.transactions (id, household_id, category_id, amount_ore, occurred_on, description, created_by) values
  ('7e000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 1400, '2026-10-07', 'Føtex', '00000000-0000-0000-0000-0000000000a1'),
  ('7e000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-0000000000b1', 5000, '2026-10-07', 'Netto', '00000000-0000-0000-0000-0000000000b1');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- ---------------------------------------------------------------- tilføj billede
insert into ctx select 'r1', receipt_id::text from public.create_pending_receipt();
insert into ctx select 'p1', storage_path from public.receipts where id = (select v from ctx where k = 'r1')::uuid;
do $$
declare ok boolean;
begin
  -- Billedet skal være uploadet først
  begin
    perform public.attach_receipt((select v from ctx where k = 'r1')::uuid, '7e000000-0000-0000-0000-0000000000a1', '30d');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kræver uploadet billede';
end $$;
insert into storage.objects (bucket_id, name) select 'receipts', v from ctx where k = 'p1';
do $$
declare old text;
begin
  old := public.attach_receipt((select v from ctx where k = 'r1')::uuid, '7e000000-0000-0000-0000-0000000000a1', '30d');
  assert old is null, 'ingen gammel fil første gang';
  assert (select status = 'approved' and transaction_id = '7e000000-0000-0000-0000-0000000000a1' and delete_at is not null
          from public.receipts where id = (select v from ctx where k = 'r1')::uuid), 'tilknyttet udgiften';
  -- Genforsøg/dobbelttryk er ufarligt
  assert public.attach_receipt((select v from ctx where k = 'r1')::uuid, '7e000000-0000-0000-0000-0000000000a1', '30d') is null, 'idempotent';
  assert (select amount_ore from public.transactions where id = '7e000000-0000-0000-0000-0000000000a1') = 1400, 'udgiften er uændret';
end $$;

-- ---------------------------------------------------------------- udskift (fx drejet billede)
insert into ctx select 'r2', receipt_id::text from public.create_pending_receipt();
insert into ctx select 'p2', storage_path from public.receipts where id = (select v from ctx where k = 'r2')::uuid;
insert into storage.objects (bucket_id, name) select 'receipts', v from ctx where k = 'p2';
do $$
declare old text; ok boolean;
begin
  old := public.attach_receipt((select v from ctx where k = 'r2')::uuid, '7e000000-0000-0000-0000-0000000000a1', 'permanent');
  assert old = (select v from ctx where k = 'p1'), 'den gamle fil returneres til sletning';
  assert (select count(*) from public.receipts where transaction_id = '7e000000-0000-0000-0000-0000000000a1') = 1, 'stadig kun én kvittering pr. udgift';
  assert (select id from public.receipts where transaction_id = '7e000000-0000-0000-0000-0000000000a1') = (select v from ctx where k = 'r2')::uuid, 'den nye kvittering gælder';
  -- Den gamle fil kan nu slettes af klienten (den er ikke længere knyttet til en godkendt kvittering)
  delete from storage.objects where name = (select v from ctx where k = 'p1');
  get diagnostics ok = row_count;
  assert ok, 'gammel fil kan slettes';
  -- Den nye fil kan ikke slettes direkte, så længe den hører til en godkendt kvittering
  delete from storage.objects where name = (select v from ctx where k = 'p2');
  assert exists (select 1 from storage.objects where name = (select v from ctx where k = 'p2')), 'godkendt billede er beskyttet';
end $$;

-- ---------------------------------------------------------------- fjern billede
do $$
declare p text;
begin
  p := public.remove_receipt_image((select v from ctx where k = 'r2')::uuid);
  assert p = (select v from ctx where k = 'p2'), 'stien returneres';
  assert (select storage_path is null and image_deleted_at is not null from public.receipts where id = (select v from ctx where k = 'r2')::uuid), 'billedet er fjernet';
  assert exists (select 1 from public.transactions where id = '7e000000-0000-0000-0000-0000000000a1'), 'udgiften bevares';
  assert public.remove_receipt_image((select v from ctx where k = 'r2')::uuid) is null, 'fjern igen er ufarligt';
  delete from storage.objects where name = p;
  assert not exists (select 1 from storage.objects where name = p), 'filen kan nu slettes';
end $$;

-- Et nyt billede kan tilføjes igen efter fjernelse
insert into ctx select 'r3', receipt_id::text from public.create_pending_receipt();
insert into storage.objects (bucket_id, name) select 'receipts', storage_path from public.receipts where id = (select v from ctx where k = 'r3')::uuid;
do $$ begin
  assert public.attach_receipt((select v from ctx where k = 'r3')::uuid, '7e000000-0000-0000-0000-0000000000a1', '1y') is null, 'den gamle (billedløse) række erstattes';
  assert (select count(*) from public.receipts where transaction_id = '7e000000-0000-0000-0000-0000000000a1') = 1, 'én kvittering';
end $$;

-- ---------------------------------------------------------------- adgang
insert into ctx select 'r4', receipt_id::text from public.create_pending_receipt();
insert into storage.objects (bucket_id, name) select 'receipts', storage_path from public.receipts where id = (select v from ctx where k = 'r4')::uuid;
do $$
declare ok boolean;
begin
  begin
    perform public.attach_receipt((select v from ctx where k = 'r4')::uuid, '7e000000-0000-0000-0000-0000000000b1', '30d');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'kan ikke tilknytte til en anden husstands udgift';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  begin
    perform public.remove_receipt_image((select v from ctx where k = 'r3')::uuid);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'anden husstand kan ikke fjerne billedet';
  begin
    perform public.attach_receipt((select v from ctx where k = 'r4')::uuid, '7e000000-0000-0000-0000-0000000000b1', '30d');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'anden husstand kan ikke bruge A''s kvittering';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  begin
    perform public.remove_receipt_image((select v from ctx where k = 'r3')::uuid);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barnet kan ikke fjerne kvitteringsbilleder';
end $$;
reset role;
rollback;
