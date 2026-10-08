-- Ignorér alle nye bankposteringer: kun egne og kun nye
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'adult');
insert into private.bank_connections (id, household_id, user_id, aspsp_name, state_hash, status) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Lunar', repeat('a', 64), 'active'),
  ('b0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'Nordea', repeat('b', 64), 'active');
insert into private.bank_accounts (id, connection_id, household_id, user_id, account_uid, name) values
  ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'acc-1', 'Konto'),
  ('b1000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'acc-2', 'Konto');
insert into public.bank_transactions (household_id, user_id, account_id, external_id, booked_on, amount_ore, description, state) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-0000000000a1', repeat('1', 64), '2026-10-01', -100, 'Ny 1', 'new'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-0000000000a1', repeat('2', 64), '2026-10-02', 200, 'Ny 2', 'new'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-0000000000a1', repeat('3', 64), '2026-10-02', -300, 'Overførsel', 'transfer'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-0000000000a1', repeat('4', 64), '2026-10-02', -400, 'Godkendt', 'imported'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-0000000000a2', repeat('5', 64), '2026-10-02', -500, 'Partnerens', 'new');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.bank_ignore_all() = 2, 'begge nye ignoreres';
  assert (select count(*) from public.bank_transactions where state = 'new') = 0, 'ingen nye tilbage';
  assert (select state from public.bank_transactions where description = 'Overførsel') = 'transfer', 'overførsler røres ikke';
  assert (select state from public.bank_transactions where description = 'Godkendt') = 'imported', 'godkendte røres ikke';
  assert public.bank_ignore_all() = 0, 'igen: intet at gøre';
  -- Kan tages med enkeltvis bagefter
  perform public.bank_set_ignored((select id from public.bank_transactions where description = 'Ny 1'), false);
  assert (select state from public.bank_transactions where description = 'Ny 1') = 'new', 'fortrudt';
end $$;
reset role;
do $$ begin
  assert (select state from public.bank_transactions where description = 'Partnerens') = 'new', 'partnerens posteringer røres ikke';
  assert not has_function_privilege('anon', 'public.bank_ignore_all()', 'execute'), 'ikke uden login';
end $$;
rollback;
