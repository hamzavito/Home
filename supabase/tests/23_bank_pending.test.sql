-- Bank: reserverede posteringer vises med det samme (kun for ejeren)
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult');
insert into private.bank_connections (id, household_id, user_id, aspsp_name, state_hash, status, valid_until) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Lunar', repeat('a', 64), 'active', now() + interval '100 days');
insert into private.bank_accounts (id, connection_id, household_id, user_id, account_uid, name) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-1', 'Lønkonto');

do $$
declare ok boolean;
begin
  assert not has_function_privilege('authenticated', 'public.bank_set_pending(uuid, jsonb)', 'execute'), 'kun Edge Function';
  assert has_function_privilege('authenticated', 'public.bank_pending_list()', 'execute'), 'brugeren kan læse egne';
  -- Kun reservationer gemmes; bogførte og nul-beløb springes over
  assert public.bank_set_pending('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('booked_on', '2026-10-08', 'amount_ore', -14995, 'description', 'NETTO 1234', 'counterparty', 'Netto', 'pending', true),
    jsonb_build_object('booked_on', '2026-10-09', 'amount_ore', -4500, 'description', '  ', 'counterparty', 'Shell', 'pending', true),
    jsonb_build_object('booked_on', '2026-10-07', 'amount_ore', -9900, 'description', 'Bogført', 'pending', false),
    jsonb_build_object('booked_on', '2026-10-07', 'amount_ore', 0, 'description', 'Nul', 'pending', true))) = 2, 'to reservationer';
  begin
    perform public.bank_set_pending(gen_random_uuid(), '[]');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'ukendt konto';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.bank_pending_list()) = 2, 'ejeren ser to';
  assert (select description from public.bank_pending_list() limit 1) = 'Shell', 'nyeste først, tom tekst → modpart';
  assert (select sum(amount_ore) from public.bank_pending_list()) = -19495, 'beløb';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select count(*) from public.bank_pending_list()) = 0, 'partneren ser dem ikke';
end $$;
reset role;

-- Næste hentning erstatter listen (bogført nu → væk som reservation)
do $$ begin
  assert public.bank_set_pending('b1000000-0000-0000-0000-0000000000a1', '[]') = 0;
  assert (select pending = '[]'::jsonb and pending_at is not null from private.bank_accounts where id = 'b1000000-0000-0000-0000-0000000000a1'), 'tømt';
end $$;
-- Udløbet forbindelse viser ingen reservationer
do $$ begin
  perform public.bank_set_pending('b1000000-0000-0000-0000-0000000000a1', jsonb_build_array(
    jsonb_build_object('booked_on', '2026-10-08', 'amount_ore', -100, 'description', 'X', 'pending', true)));
  update private.bank_connections set status = 'revoked' where id = 'b0000000-0000-0000-0000-0000000000a1';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.bank_pending_list()) = 0, 'fjernet forbindelse';
end $$;
rollback;
