-- Tests for kvitteringer: isolation, Storage-adgang, godkendelse, annullering
-- og automatisk oprydning.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'A'),
  ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Dagligvarer', '00000000-0000-0000-0000-0000000000a1'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B-mad', '00000000-0000-0000-0000-0000000000b1');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, service_role;

-- ======================================================= Husstand B uploader
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into ctx select 'b_path', storage_path from public.create_pending_receipt();
insert into storage.objects (bucket_id, name) select 'receipts', v from ctx where k = 'b_path';
insert into ctx select 'b_receipt', id::text from public.receipts;

-- ======================================================= Husstand A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$
declare ok boolean; b_path text := (select v from ctx where k = 'b_path');
begin
  -- Isolation: A ser hverken B's kvittering eller billede, selv med kendt sti
  assert (select count(*) from public.receipts) = 0, 'A ser ikke B''s kvitteringer';
  assert (select count(*) from storage.objects where name = b_path) = 0, 'A kan ikke hente B''s billede med gættet sti';
  assert (select count(*) from storage.objects where bucket_id = 'receipts') = 0, 'A ser ingen billeder fra B';

  -- A kan ikke uploade til B's mappe eller en vilkårlig sti
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', '22222222-2222-2222-2222-222222222222/x.jpg');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'A kan ikke uploade til B''s mappe';
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', '11111111-1111-1111-1111-111111111111/egen-sti.jpg');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'upload kræver en ventende kvittering';

  -- A kan ikke slette B's billede
  delete from storage.objects where name = b_path;
end $$;

-- Ventende kvittering påvirker ikke økonomien
insert into ctx select 'a_path', storage_path from public.create_pending_receipt();
insert into ctx select 'a_receipt', id::text from public.receipts where status = 'pending';
do $$ begin
  assert (select count(*) from public.transactions) = 0, 'ventende kvittering opretter ingen transaktion';
  assert (select spent_ore from public.budget_month_summary(date_trunc('month', now())::date)) = 0, 'budget urørt';
  assert (select v from ctx where k = 'a_path') like '11111111-1111-1111-1111-111111111111/%.jpg', 'sti i egen mappe';
end $$;

-- Godkendelse uden uploadet billede afvises
do $$
declare ok boolean;
begin
  begin
    perform public.approve_receipt((select v from ctx where k = 'a_receipt')::uuid, 'c0000000-0000-0000-0000-000000000001',
      63875, current_date, 'Bilka', null, 'shared', null, '30d');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kræver uploadet billede';
end $$;

-- Upload og godkend – to gange (dobbelttryk)
insert into storage.objects (bucket_id, name) select 'receipts', v from ctx where k = 'a_path';
do $$
declare t1 uuid; t2 uuid; rid uuid := (select v from ctx where k = 'a_receipt')::uuid;
begin
  t1 := public.approve_receipt(rid, 'c0000000-0000-0000-0000-000000000001', 63875, current_date, 'Bilka', null,
    'member', '00000000-0000-0000-0000-0000000000a2', '30d');
  t2 := public.approve_receipt(rid, 'c0000000-0000-0000-0000-000000000001', 63875, current_date, 'Bilka', null,
    'member', '00000000-0000-0000-0000-0000000000a2', '30d');
  assert t1 = t2, 'dobbelt godkendelse returnerer samme transaktion';
  assert (select count(*) from public.transactions) = 1, 'præcis én transaktion';
  assert (select amount_ore from public.transactions) = 63875, '638,75 kr. = 63875 øre';
  assert (select source from public.transactions) = 'receipt', 'kilde = kvittering';
  assert (select transaction_id from public.receipts where id = rid) = t1, 'kvittering linket';
  assert (select status from public.receipts where id = rid) = 'approved', 'godkendt';
  assert (select (delete_at at time zone 'Europe/Copenhagen')::date from public.receipts where id = rid)
         = (now() at time zone 'Europe/Copenhagen')::date + 30, 'slettes om 30 dage';
  assert (select spent_ore from public.budget_month_summary(date_trunc('month', now())::date)) = 63875, 'budget opdateret';
  insert into ctx values ('a_tx', t1::text);
end $$;

-- Godkendt billede kan ikke slettes af brugeren, og rækken kan ikke slettes direkte
do $$
declare a_path text := (select v from ctx where k = 'a_path');
begin
  delete from storage.objects where name = a_path;
  assert (select count(*) from storage.objects where name = a_path) = 1, 'godkendt billede kan ikke slettes af klienten';
  delete from public.receipts where id = (select v from ctx where k = 'a_receipt')::uuid;
  assert (select count(*) from public.receipts) = 1, 'godkendt kvittering kan ikke slettes direkte';
end $$;

-- Opbevaring: permanent og ændret dato
do $$
declare rid uuid := (select v from ctx where k = 'a_receipt')::uuid; d timestamptz; ok boolean;
begin
  d := public.set_receipt_retention(rid, 'permanent');
  assert d is null and (select delete_at from public.receipts where id = rid) is null, 'permanent → NULL';
  d := public.set_receipt_retention(rid, 'custom', current_date + 100);
  assert (select (delete_at at time zone 'Europe/Copenhagen')::date from public.receipts where id = rid) = current_date + 100, 'vælg dato';
  begin
    perform public.set_receipt_retention(rid, 'custom', current_date - 1);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'dato i fortiden afvises';
end $$;

-- Annulleret upload: slet billede og ventende række
insert into ctx select 'c_path', storage_path from public.create_pending_receipt();
insert into storage.objects (bucket_id, name) select 'receipts', v from ctx where k = 'c_path';
delete from storage.objects where name = (select v from ctx where k = 'c_path');
delete from public.receipts where storage_path = (select v from ctx where k = 'c_path');
do $$ begin
  assert (select count(*) from public.receipts where status = 'pending') = 0, 'annulleret kvittering fjernet';
  assert (select count(*) from storage.objects where name = (select v from ctx where k = 'c_path')) = 0, 'annulleret billede fjernet';
  assert (select count(*) from public.transactions) = 1, 'annullering påvirker ikke økonomien';
end $$;

-- Kategoriforslag fra egne tidligere udgifter
do $$ begin
  assert public.suggest_category('bilka') = 'c0000000-0000-0000-0000-000000000001', 'Bilka → Dagligvarer';
  assert public.suggest_category('Ukendt butik') is null, 'intet forslag for ukendt butik';
end $$;

-- Klienten kan ikke kalde oprydningen
do $$
declare ok boolean;
begin
  begin
    perform public.claim_expired_receipt_images();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'oprydning kræver service role';
end $$;

-- ======================================================= Oprydning (service role)
reset role;
-- Forbered scenarier som admin:
--  * a_receipt: udløbet (sæt delete_at i fortiden)
--  * en permanent kvittering
--  * en udløbet kvittering hvis fil allerede mangler
--  * en forladt ventende kvittering (> 24 t) + en frisk ventende
--  * en forældreløs fil
update public.receipts set delete_at = now() - interval '1 hour', retention = 'custom'
 where id = (select v from ctx where k = 'a_receipt')::uuid;

insert into public.transactions (id, household_id, category_id, amount_ore, occurred_on, description, created_by) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 1000, current_date, 'Permanent', '00000000-0000-0000-0000-0000000000a1'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 2000, current_date, 'Mangler fil', '00000000-0000-0000-0000-0000000000a1');
insert into public.receipts (id, household_id, status, storage_path, transaction_id, retention, delete_at, uploaded_by, approved_at) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'approved',
   '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001.jpg', 'd0000000-0000-0000-0000-000000000001', 'permanent', null,
   '00000000-0000-0000-0000-0000000000a1', now() - interval '400 days'),
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'approved',
   '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000002.jpg', 'd0000000-0000-0000-0000-000000000002', '30d', now() - interval '2 days',
   '00000000-0000-0000-0000-0000000000a1', now() - interval '32 days');
insert into public.receipts (id, household_id, status, storage_path, uploaded_by, created_at) values
  ('e0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'pending',
   '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000003.jpg', '00000000-0000-0000-0000-0000000000a1', now() - interval '2 days'),
  ('e0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'pending',
   '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000004.jpg', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour');
insert into storage.objects (bucket_id, name, created_at) values
  ('receipts', '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000001.jpg', now() - interval '400 days'),
  ('receipts', '11111111-1111-1111-1111-111111111111/e0000000-0000-0000-0000-000000000003.jpg', now() - interval '2 days'),
  ('receipts', '11111111-1111-1111-1111-111111111111/forældreløs.jpg', now() - interval '3 days'),
  ('receipts', '11111111-1111-1111-1111-111111111111/frisk-forældreløs.jpg', now() - interval '1 hour');
-- (e…02's fil findes bevidst ikke)

set local role service_role;
create temp table run1 as select * from public.claim_expired_receipt_images();
create temp table run1_abandoned as select * from public.claim_abandoned_receipts();
create temp table run1_orphans as select * from public.list_orphan_receipt_files();

do $$ begin
  assert (select count(*) from run1) = 2, 'to udløbne billeder (inkl. ét hvis fil mangler)';
  assert not exists (select 1 from run1 where receipt_id = 'e0000000-0000-0000-0000-000000000001'), 'permanent berøres ikke';
  assert (select count(*) from run1_abandoned) = 1, 'én forladt upload';
  assert (select receipt_id from run1_abandoned) = 'e0000000-0000-0000-0000-000000000003', 'kun den gamle ventende';
  -- Den gamle forældreløse fil + filen fra den forladte upload (rækken er nu væk).
  -- Den friske forældreløse fil (< 24 t) og godkendte/permanente billeder røres ikke.
  assert (select count(*) from run1_orphans) = 2, 'forældreløse filer';
  assert exists (select 1 from run1_orphans where storage_path like '%/forældreløs.jpg'), 'gammel forældreløs fil';
  assert not exists (select 1 from run1_orphans where storage_path like '%frisk%'), 'frisk fil venter';
  assert not exists (select 1 from run1_orphans where storage_path like '%e0000000-0000-0000-0000-000000000001.jpg'), 'permanent billede er ikke forældreløst';
end $$;

-- Anden kørsel finder intet (idempotent)
do $$ begin
  assert (select count(*) from public.claim_expired_receipt_images()) = 0, 'anden kørsel: ingen udløbne';
  assert (select count(*) from public.claim_abandoned_receipts()) = 0, 'anden kørsel: ingen forladte';
end $$;

reset role;
do $$
declare rid uuid := (select v from ctx where k = 'a_receipt')::uuid;
begin
  -- Transaktion og kvitteringsrække bevares, billedet markeres som slettet
  assert (select count(*) from public.transactions) = 3, 'transaktioner bevaret';
  assert (select status from public.receipts where id = rid) = 'approved', 'stadig godkendt';
  assert (select storage_path from public.receipts where id = rid) is null, 'sti fjernet';
  assert (select image_deleted_at from public.receipts where id = rid) is not null, 'image_deleted_at sat';
  assert (select transaction_id from public.receipts where id = rid) = (select v from ctx where k = 'a_tx')::uuid, 'link bevaret';
  assert (select uploaded_by from public.receipts where id = rid) = '00000000-0000-0000-0000-0000000000a1', 'uploaded_by bevaret';
  assert (select delete_at from public.receipts where id = rid) is not null, 'delete_at bevaret';
  assert (select storage_path from public.receipts where id = 'e0000000-0000-0000-0000-000000000001') is not null, 'permanent beholder billede';
  assert exists (select 1 from public.receipts where id = 'e0000000-0000-0000-0000-000000000004'), 'frisk ventende bevares';
end $$;

-- Sletning af en transaktion med kvittering
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare path text; ok boolean;
begin
  begin
    delete from public.transactions where id = 'd0000000-0000-0000-0000-000000000001';
    ok := false;
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'direkte sletning af transaktion med kvittering blokeres';

  path := public.delete_transaction('d0000000-0000-0000-0000-000000000001');
  assert path like '%e0000000-0000-0000-0000-000000000001.jpg', 'returnerer billedsti til oprydning';
  assert not exists (select 1 from public.receipts where id = 'e0000000-0000-0000-0000-000000000001'), 'kvittering slettet';
  assert not exists (select 1 from public.transactions where id = 'd0000000-0000-0000-0000-000000000001'), 'transaktion slettet';
end $$;

-- B kan ikke slette A's transaktion
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  begin
    perform public.delete_transaction((select v from ctx where k = 'a_tx')::uuid);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'B kan ikke slette A''s transaktion';
  begin
    perform public.approve_receipt('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-0000000000b1', 1, current_date, 'x', null, 'shared', null, '30d');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'B kan ikke godkende A''s kvittering';
end $$;

rollback;
