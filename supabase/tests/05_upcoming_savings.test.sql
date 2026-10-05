-- Tests for kommende udgifter og opsparing
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');
insert into public.budget_categories (id, household_id, name, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Buffer', '00000000-0000-0000-0000-0000000000a1');

insert into public.upcoming_expenses (id, household_id, title, amount_ore, due_on, category_id, created_by) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tandlæge', 120000, current_date + 7, 'c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bilservice', 250000, current_date + 14, 'c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
insert into public.savings_goals (id, household_id, name, target_ore, created_by) values
  ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ferie', 2500000, '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- Klienten kan oprette uden at vælge id, men ikke direkte som betalt
insert into public.upcoming_expenses (household_id, title, amount_ore, due_on, category_id)
values ('11111111-1111-1111-1111-111111111111', 'Gave', 40000, current_date + 3, 'c0000000-0000-0000-0000-000000000001');
do $$
declare ok boolean;
begin
  begin
    insert into public.upcoming_expenses (household_id, title, amount_ore, due_on, category_id, status, paid_at)
    values ('11111111-1111-1111-1111-111111111111', 'x', 1, current_date, 'c0000000-0000-0000-0000-000000000001', 'paid', now());
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'kan ikke oprette direkte som betalt';
  delete from public.upcoming_expenses where title = 'Gave';
end $$;

do $$
declare t1 uuid; t2 uuid; ok boolean;
begin
  assert (select count(*) from public.transactions) = 0, 'kommende udgift påvirker ikke økonomien';

  -- Betalt + registrér → én transaktion, idempotent
  t1 := public.set_upcoming_status('e0000000-0000-0000-0000-000000000001', 'paid', true, null, null, 'member', '00000000-0000-0000-0000-0000000000a1');
  t2 := public.set_upcoming_status('e0000000-0000-0000-0000-000000000001', 'paid', true);
  assert t1 = t2 and t1 is not null, 'samme transaktion ved gentagelse';
  assert (select count(*) from public.transactions) = 1, 'præcis én transaktion';
  assert (select source from public.transactions) = 'upcoming', 'kilde = kommende';
  assert (select amount_ore from public.transactions) = 120000, 'beløb fra den kommende udgift';
  assert (select transaction_id from public.upcoming_expenses where id = 'e0000000-0000-0000-0000-000000000001') = t1, 'linket';

  -- Direkte statusændring er ikke tilladt (kun via funktion)
  begin
    update public.upcoming_expenses set status = 'upcoming' where id = 'e0000000-0000-0000-0000-000000000001';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'status ændres kun via funktion';

  -- Kan ikke sættes tilbage uden at fortryde betalingen
  begin
    perform public.set_upcoming_status('e0000000-0000-0000-0000-000000000001', 'upcoming');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'tilbage kræver fortryd';

  -- Fortryd: transaktionen slettes, status kommende
  perform public.undo_upcoming_payment('e0000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.transactions) = 0, 'transaktion fjernet';
  assert (select status from public.upcoming_expenses where id = 'e0000000-0000-0000-0000-000000000001') = 'upcoming', 'kommende igen';
  perform public.undo_upcoming_payment('e0000000-0000-0000-0000-000000000001'); -- idempotent

  -- Betalt uden registrering → ingen transaktion
  perform public.set_upcoming_status('e0000000-0000-0000-0000-000000000002', 'paid', false);
  assert (select count(*) from public.transactions) = 0, 'betalt uden registrering';
  assert (select status from public.upcoming_expenses where id = 'e0000000-0000-0000-0000-000000000002') = 'paid', 'betalt';
  perform public.set_upcoming_status('e0000000-0000-0000-0000-000000000002', 'cancelled');
  assert (select paid_at from public.upcoming_expenses where id = 'e0000000-0000-0000-0000-000000000002') is null, 'annulleret';

  -- Slettes den registrerede transaktion, bevares den kommende udgift som betalt
  t1 := public.set_upcoming_status('e0000000-0000-0000-0000-000000000001', 'paid', true);
  perform public.delete_transaction(t1);
  assert (select status from public.upcoming_expenses where id = 'e0000000-0000-0000-0000-000000000001') = 'paid', 'stadig betalt';
  assert (select transaction_id from public.upcoming_expenses where id = 'e0000000-0000-0000-0000-000000000001') is null, 'link fjernet';
end $$;

-- Opsparing
insert into public.savings_movements (household_id, goal_id, kind, amount_ore) values
  ('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', 'deposit', 500000),
  ('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', 'deposit', 300000),
  ('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', 'withdrawal', 100000);
do $$
declare ok boolean;
begin
  assert (select current_ore from public.savings_goal_progress()) = 700000, 'saldo = 5.000 + 3.000 − 1.000';
  assert (select movement_count from public.savings_goal_progress()) = 3, 'tre bevægelser';
  begin
    insert into public.savings_movements (household_id, goal_id, kind, amount_ore)
    values ('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', 'withdrawal', 800000);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kan ikke hæve mere end saldoen';
  begin
    delete from public.savings_goals where id = '90000000-0000-0000-0000-000000000001';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mål kan ikke slettes (arkiveres)';
  update public.savings_goals set archived_at = now() where id = '90000000-0000-0000-0000-000000000001';
  assert (select current_ore from public.savings_goal_progress()) = 700000, 'arkiveret mål bevarer saldo';
end $$;

-- Isolation
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.upcoming_expenses) = 0, 'B ser ingen kommende udgifter';
  assert (select count(*) from public.savings_goals) = 0, 'B ser ingen mål';
  assert (select count(*) from public.savings_goal_progress()) = 0, 'B ingen saldi';
  begin
    perform public.set_upcoming_status('e0000000-0000-0000-0000-000000000002', 'paid', true);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'B kan ikke markere A''s udgift';
  begin
    insert into public.savings_movements (household_id, goal_id, kind, amount_ore)
    values ('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', 'deposit', 1);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'B kan ikke indbetale på A''s mål';
  delete from public.savings_movements;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.savings_movements) = 3, 'B kunne ikke slette A''s bevægelser';
end $$;
rollback;
