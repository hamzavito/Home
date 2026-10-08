-- Abonnement: prøveperiode, skrivebeskyttelse, Stripe-status
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child@internal.home'),
  ('00000000-0000-0000-0000-0000000000f1', 'gammel@test.dk');
-- Gammel husstand (før abonnementer): ingen række → gratis
insert into public.households (id, name) values ('99999999-9999-9999-9999-999999999999', 'Gammel');
delete from public.household_subscriptions where household_id = '99999999-9999-9999-9999-999999999999';
insert into public.household_members (household_id, user_id, role) values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-0000000000f1', 'owner');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-0000000000f1', '99999999-9999-9999-9999-999999999999', 'Mad', '00000000-0000-0000-0000-0000000000f1');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into ctx values ('hid', public.household_create('Ny kunde')::text);
reset role;
insert into public.household_members (household_id, user_id, role) values ((select v from ctx where k = 'hid')::uuid, '00000000-0000-0000-0000-0000000000c1', 'child');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-0000000000a1', (select v from ctx where k = 'hid')::uuid, 'Mad', '00000000-0000-0000-0000-0000000000a1');

do $$ begin
  assert (select status = 'trialing' and trial_ends_at between now() + interval '29 days' and now() + interval '31 days'
          from public.household_subscriptions where household_id = (select v from ctx where k = 'hid')::uuid), '30 dages prøveperiode';
  assert not has_table_privilege('authenticated', 'public.household_subscriptions', 'select'), 'abonnementet kan ikke læses direkte';
  assert not has_function_privilege('authenticated', 'public.billing_apply(uuid, text, text, text, text, timestamptz, boolean, uuid, timestamptz)', 'execute'), 'kun Stripe-webhook kan ændre status';
end $$;

-- Betaling ikke slået til: alt virker, også efter prøveperioden
update public.household_subscriptions set trial_ends_at = now() - interval '1 day' where household_id = (select v from ctx where k = 'hid')::uuid;
set local role authenticated;
do $$ begin
  assert (public.subscription_info() ->> 'write_access')::boolean, 'fuld adgang før betaling er slået til';
  assert (public.subscription_info() ->> 'billing_enabled')::boolean = false, 'betaling er slået fra';
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
  values ((select v from ctx where k = 'hid')::uuid, 'c0000000-0000-0000-0000-0000000000a1', 100, '2026-10-01', 'Før');
end $$;

-- Betaling slås til
reset role;
update private.app_settings set billing_enabled = true;
update public.household_subscriptions set trial_ends_at = now() + interval '2 days' where household_id = (select v from ctx where k = 'hid')::uuid;
set local role authenticated;
do $$ begin
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
  values ((select v from ctx where k = 'hid')::uuid, 'c0000000-0000-0000-0000-0000000000a1', 200, '2026-10-01', 'I prøveperioden');
end $$;

-- Prøveperioden udløber → skrivebeskyttet
reset role;
update public.household_subscriptions set trial_ends_at = now() - interval '1 minute' where household_id = (select v from ctx where k = 'hid')::uuid;
set local role authenticated;
do $$
declare ok boolean; n int;
begin
  assert not (public.subscription_info() ->> 'write_access')::boolean, 'skrivebeskyttet';
  begin
    insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
    values ((select v from ctx where k = 'hid')::uuid, 'c0000000-0000-0000-0000-0000000000a1', 300, '2026-10-01', 'Efter');
    ok := false;
  exception when sqlstate 'PT402' then ok := true;
  end;
  assert ok, 'kan ikke oprette';
  begin
    update public.transactions set amount_ore = 1 where description = 'Før';
    ok := false;
  exception when sqlstate 'PT402' then ok := true;
  end;
  assert ok, 'kan ikke ændre';
  begin
    perform public.create_pending_receipt();
    ok := false;
  exception when sqlstate 'PT402' then ok := true;
  end;
  assert ok, 'kan ikke scanne kvitteringer';
  assert (select count(*) from public.transactions) = 2, 'kan stadig se alt';
  perform public.export_household_data();
  delete from public.transactions where description = 'Før';
  get diagnostics n = row_count;
  assert n = 1, 'sletning er altid tilladt';
  -- Invitationer og medlemskab virker stadig (så en anden voksen kan betale)
  perform public.invite_create();
end $$;

-- Barnet ser også, at abonnementet er udløbet
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert not (public.subscription_info() ->> 'write_access')::boolean, 'barnet ser status';
end $$;

-- Gammel husstand uden abonnementsrække: gratis
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert public.subscription_info() ->> 'status' = 'comped', 'gammel husstand er gratis';
  insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description)
  values ('99999999-9999-9999-9999-999999999999', 'c0000000-0000-0000-0000-0000000000f1', 100, '2026-10-01', 'Gratis');
end $$;

-- Systemjob (uden bruger) er ikke ramt
reset role;
reset request.jwt.claim.sub;
insert into public.transactions (household_id, category_id, amount_ore, occurred_on, description, created_by)
values ((select v from ctx where k = 'hid')::uuid, 'c0000000-0000-0000-0000-0000000000a1', 400, '2026-10-01', 'System', '00000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------- Stripe
do $$
declare hid uuid := (select v from ctx where k = 'hid')::uuid;
begin
  perform public.billing_set_customer(hid, 'cus_TEST1');
  assert public.billing_apply(hid, 'cus_TEST1', 'sub_TEST1', 'active', 'monthly', now() + interval '30 days', false, '00000000-0000-0000-0000-0000000000a1', now()), 'aktiv';
  assert private.has_write_access(hid), 'betalt → fuld adgang';
  -- En ældre hændelse, der kommer for sent, ignoreres
  assert not public.billing_apply(hid, 'cus_TEST1', 'sub_TEST1', 'past_due', 'monthly', now(), false, null, now() - interval '1 hour'), 'ældre hændelse ignoreres';
  assert (select status from public.household_subscriptions where household_id = hid) = 'active', 'stadig aktiv';
  -- Betaling fejler: 7 dages frist
  perform public.billing_apply(hid, 'cus_TEST1', 'sub_TEST1', 'past_due', 'monthly', now() - interval '2 days', false, null, now() + interval '1 second');
  assert private.has_write_access(hid), 'inden for fristen';
  perform public.billing_apply(hid, 'cus_TEST1', 'sub_TEST1', 'past_due', 'monthly', now() - interval '8 days', false, null, now() + interval '2 seconds');
  assert not private.has_write_access(hid), 'efter fristen';
  assert (select payer_user_id from public.household_subscriptions where household_id = hid) = '00000000-0000-0000-0000-0000000000a1', 'betaleren huskes';
  -- Opsagt
  perform public.billing_apply(hid, 'cus_TEST1', 'sub_TEST1', 'canceled', 'monthly', now() - interval '1 day', false, null, now() + interval '3 seconds');
  assert not private.has_write_access(hid), 'opsagt → skrivebeskyttet';
  -- Ny betaling (fx en anden voksen) → aktiv igen
  perform public.billing_apply(hid, 'cus_TEST1', 'sub_TEST2', 'active', 'yearly', now() + interval '365 days', false, '00000000-0000-0000-0000-0000000000a1', now() + interval '4 seconds');
  assert private.has_write_access(hid), 'aktiv igen';
  assert (select plan from public.household_subscriptions where household_id = hid) = 'yearly', 'årlig';
  -- Det gamle abonnements sene "opsagt" overskriver ikke det nye
  assert not public.billing_apply(hid, 'cus_TEST1', 'sub_TEST1', 'canceled', 'monthly', now(), false, null, now() + interval '5 seconds'), 'gammelt abonnement rører ikke det nye';
  assert private.has_write_access(hid), 'stadig aktiv';
  -- Opsagt uden prøveperiode (null-dato) giver aldrig adgang
  update public.household_subscriptions set trial_ends_at = null where household_id = hid;
  perform public.billing_apply(hid, 'cus_TEST1', 'sub_TEST2', 'canceled', 'yearly', now() - interval '1 day', false, null, now() + interval '6 seconds');
  assert private.has_write_access(hid) is false, 'opsagt uden prøveperiode: ingen adgang (ikke null)';
  -- Slettet husstand: ignoreres
  assert not public.billing_apply('12345678-1234-1234-1234-123456789012', 'cus_X', 'sub_X', 'active', 'monthly', now(), false, null, now()), 'ukendt husstand';
  -- Gammel husstand der alligevel betaler: forbliver gratis indtil Stripe siger andet
  perform public.billing_set_customer('99999999-9999-9999-9999-999999999999', 'cus_OLD');
  assert (select status from public.household_subscriptions where household_id = '99999999-9999-9999-9999-999999999999') = 'comped', 'stadig gratis';
end $$;
rollback;
