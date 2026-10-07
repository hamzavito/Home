-- Børn: synlig PIN for forældre, opgavebelønninger med godkendelse, faste lommepenge
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'far@test.dk'),
  ('00000000-0000-0000-0000-0000000000f2', 'mor@test.dk'),
  ('00000000-0000-0000-0000-0000000000c1', 'child-a@internal.home'),
  ('00000000-0000-0000-0000-0000000000c2', 'child-b@internal.home'),
  ('00000000-0000-0000-0000-0000000000b1', 'farhat@test.dk'),
  ('00000000-0000-0000-0000-0000000000b9', 'child-f@internal.home');
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'Vores hjem'), ('22222222-2222-2222-2222-222222222222', 'Farhats hjem');
insert into public.household_members (household_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f1', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f2', 'adult'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1', 'owner');
-- Børnene oprettes som Edge Function "child-admin" gør det; lette PIN'er er tilladt
select public.child_account_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'Noah', 'noah', '123456', 6);
select public.child_account_create('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c2', 'Emma', 'emma', '1111', 4);
select public.child_account_create('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b9', 'Noah F', 'noah', '424242', 6);

-- ================================================================== PIN synlig for forældre
do $$ begin
  assert not exists (select 1 from private.child_credentials c where position('123456' in c::text) > 0), 'PIN står ikke i klar tekst i tabellen';
  assert (select pin_encrypted is not null from private.child_credentials where user_id = '00000000-0000-0000-0000-0000000000c1'), 'krypteret kopi gemt';
  assert (public.child_login_verify((select code from private.household_login_codes where household_id = '11111111-1111-1111-1111-111111111111'), 'noah', '123456', '1.1.1.1') ->> 'ok')::boolean, 'let PIN virker ved login';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  assert public.child_pin('00000000-0000-0000-0000-0000000000c1') = '123456', 'ejer ser PIN';
  perform public.child_set_pin('00000000-0000-0000-0000-0000000000c2', '0000', 4);
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$ begin
  assert public.child_pin('00000000-0000-0000-0000-0000000000c2') = '0000', 'voksen ser PIN – også efter ændring';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  begin
    perform public.child_pin('00000000-0000-0000-0000-0000000000c1');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barnet kan ikke slå PIN op';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  begin
    perform public.child_pin('00000000-0000-0000-0000-0000000000c1');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'en anden husstand kan ikke se PIN';
end $$;
reset role;

-- ================================================================== belønning for opgaver
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
insert into public.household_tasks (id, household_id, title, assignee_id, reward_ore, created_by) values
  ('7a000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Tøm opvaskemaskinen', '00000000-0000-0000-0000-0000000000c1', 2000, '00000000-0000-0000-0000-0000000000f1'),
  ('7a000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Red seng', '00000000-0000-0000-0000-0000000000c1', 500, '00000000-0000-0000-0000-0000000000f1'),
  ('7a000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'Ingen belønning', '00000000-0000-0000-0000-0000000000c1', null, '00000000-0000-0000-0000-0000000000f1'),
  ('7a000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'Fars opgave', '00000000-0000-0000-0000-0000000000f1', 1000, '00000000-0000-0000-0000-0000000000f1'),
  ('7a000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'Fodre katten', '00000000-0000-0000-0000-0000000000c2', 1000, '00000000-0000-0000-0000-0000000000f1');
insert into public.household_tasks (id, household_id, title, assignee_id, reward_ore, recurrence, due_on, created_by) values
  ('7a000000-0000-0000-0000-0000000000a4', '11111111-1111-1111-1111-111111111111', 'Tag skraldet ud', '00000000-0000-0000-0000-0000000000c1', 1000, 'weekly', '2026-10-10', '00000000-0000-0000-0000-0000000000f1');
reset request.jwt.claim.sub;

do $$ begin
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a1') = 'awaiting_completion', 'afventer udførelse';
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a3') = 'none', 'ingen belønning';
end $$;

-- Barnet (Noah) udfører opgaver
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a1', 'done');
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a2', 'done');
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a4', 'done');
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a1') = 'awaiting_approval', 'barnet ser: afventer godkendelse';
  assert (select count(*) from public.child_wallet_transactions) = 0, 'ingen penge før en forælder godkender';
  -- Den gentagende opgaves næste gang har sin egen belønning, der venter på udførelse
  assert (select reward_status from public.household_tasks where previous_task_id = '7a000000-0000-0000-0000-0000000000a4') = 'awaiting_completion', 'ny forekomst venter på udførelse';

  -- Barnet kan ikke godkende sin egen belønning
  begin
    perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a1', true);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barnet kan ikke godkende egen belønning';
  begin
    update public.household_tasks set reward_status = 'paid' where id = '7a000000-0000-0000-0000-0000000000a1';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke sætte status direkte';
  begin
    perform public.child_wallet_add('00000000-0000-0000-0000-0000000000c1', 'deposit', 2000);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke udbetale penge til sig selv';
end $$;

-- Voksne kan heller ikke sætte status direkte (kun via godkendelse)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$
declare ok boolean;
begin
  begin
    update public.household_tasks set reward_status = 'paid' where id = '7a000000-0000-0000-0000-0000000000a1';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'status kan kun ændres af databasen';

  -- Mor godkender: én bevægelse
  perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a1', true);
  assert (select count(*) from public.child_wallet_transactions where task_id = '7a000000-0000-0000-0000-0000000000a1') = 1, 'én udbetaling';
  assert (select amount_ore = 2000 and kind = 'deposit' and note = 'Opgave: Tøm opvaskemaskinen' and child_id = '00000000-0000-0000-0000-0000000000c1'
          from public.child_wallet_transactions where task_id = '7a000000-0000-0000-0000-0000000000a1'), 'beløb og tekst';
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a1') = 'paid', 'udbetalt';
  -- Dobbelttryk: samme svar, ingen ny bevægelse
  perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a1', true);
  perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a1', true);
  assert (select count(*) from public.child_wallet_transactions where task_id = '7a000000-0000-0000-0000-0000000000a1') = 1, 'dobbelttryk giver stadig én udbetaling';
  begin
    perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a1', false);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'en udbetalt belønning kan ikke afvises bagefter';

  -- Afvis den anden
  perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a2', false);
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a2') = 'rejected', 'afvist';
  assert (select count(*) from public.child_wallet_transactions where task_id = '7a000000-0000-0000-0000-0000000000a2') = 0, 'afvist: ingen penge';

  -- Kun børn kan få belønning
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000f1', 'done');
  begin
    perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000f1', true);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'voksnes opgaver udbetales ikke';
  -- Opgave der ikke er færdig kan ikke godkendes
  begin
    perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000b2', true);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ikke færdig: kan ikke godkendes';
end $$;

-- Barnet genåbner: afvist → forfra; udbetalt → forbliver udbetalt (pengene trækkes ikke tilbage)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a2', 'open');
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a2') = 'awaiting_completion', 'genåbnet: venter igen på udførelse';
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a2', 'done');
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a2') = 'awaiting_approval', 'færdig igen: venter på godkendelse';
  perform public.set_task_status('7a000000-0000-0000-0000-0000000000a1', 'open');
  assert (select reward_status from public.household_tasks where id = '7a000000-0000-0000-0000-0000000000a1') = 'paid', 'udbetalt forbliver udbetalt';
  assert (select sum(amount_ore) from public.child_wallet_transactions where voided_at is null) = 2000, 'saldoen er uændret';
  -- Barnet ser kun egne opgaver og egne penge
  assert (select count(*) from public.household_tasks where assignee_id = '00000000-0000-0000-0000-0000000000c2') = 0, 'Noah ser ikke Emmas opgaver';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
do $$ begin
  assert (select count(*) from public.child_wallet_transactions) = 0, 'Emma ser ikke Noahs udbetaling';
  assert (select count(*) from public.household_tasks) = 1, 'Emma ser kun sin egen opgave';
end $$;
reset role;

-- Sikkerhedsnet i databasen: to udbetalinger for samme opgave er umulige
do $$
declare ok boolean;
begin
  begin
    insert into public.child_wallet_transactions (household_id, child_id, kind, amount_ore, task_id, created_by)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'deposit', 2000, '7a000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1');
    ok := false;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'unikt indeks forhindrer dobbeltudbetaling';
end $$;

-- ================================================================== faste lommepenge
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  begin
    perform public.child_allowance_create('00000000-0000-0000-0000-0000000000c1', 100000, 'weekly', 1, null, current_date);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'barnet kan ikke oprette faste lommepenge';
end $$;
reset role;

-- Ugentligt: forfalder den i dag, udbetales den straks – præcis én gang
create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare today date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  insert into ids values ('weekly', public.child_allowance_create('00000000-0000-0000-0000-0000000000c1', 5000, 'weekly', extract(isodow from today)::int, null, today));
  assert (select count(*) from public.child_wallet_transactions where kind = 'allowance') = 1, 'ugentlig: udbetalt i dag';
  assert public.child_allowance_next((select id from ids where name = 'weekly')) = today + 7, 'næste udbetaling om en uge';
end $$;
reset role;

do $$
declare
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  w uuid := (select id from ids where name = 'weekly');
begin
  perform private.run_allowances(today);
  perform private.run_allowances(today);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 1, 'cron to gange samme dag: ingen dublet';
  perform private.run_allowances(today + 6);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 1, 'ingen udbetaling før næste uge';
  perform private.run_allowances(today + 7);
  perform private.run_allowances(today + 7);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 2, 'næste uge: præcis én udbetaling mere';
  assert (select count(distinct tx_id) from public.child_allowance_payouts where schedule_id = w) = 2, 'hver periode sin egen bevægelse';
  -- Et job der har været nede, indhenter de forsømte perioder (uden dubletter)
  perform private.run_allowances(today + 21);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 4, 'forsømte uger indhentes';
  perform private.run_allowances(today + 21);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 4, 'stadig ingen dubletter';
end $$;

-- Ændret beløb gælder kun fremad; pause stopper; genoptag fortsætter fra genoptagelsesdagen
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$
declare w uuid := (select id from ids where name = 'weekly');
begin
  perform public.child_allowance_update(w, 7500);
  perform public.child_allowance_set_state(w, 'pause');
  assert public.child_allowance_next(w) is null, 'pauset: ingen næste udbetaling';
end $$;
reset role;
do $$
declare
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  w uuid := (select id from ids where name = 'weekly');
begin
  assert (select count(*) from public.child_wallet_transactions where kind = 'allowance' and amount_ore = 5000) = 4, 'tidligere udbetalinger er uændrede';
  perform private.run_allowances(today + 28);
  perform private.run_allowances(today + 35);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 4, 'pause stopper udbetalinger';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  w uuid := (select id from ids where name = 'weekly');
begin
  perform public.child_allowance_set_state(w, 'resume');
  assert (select pay_from from public.child_allowance_schedules where id = w) = today, 'genoptag: fortsætter fra i dag';
end $$;
reset role;
do $$
declare
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  w uuid := (select id from ids where name = 'weekly');
begin
  -- Som om genoptagelsen skete efter fem ugers pause: pauseugerne udbetales ikke
  update public.child_allowance_schedules set pay_from = today + 35 where id = w;
  perform private.run_allowances(today + 35);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 5, 'kun perioden efter genoptagelse';
  assert not exists (select 1 from public.child_allowance_payouts where schedule_id = w and due_on = today + 28), 'pauseuge ikke udbetalt';
  assert (select amount_ore from public.child_allowance_payouts where schedule_id = w and due_on = today + 35) = 7500, 'nyt beløb fremadrettet';
end $$;

-- Stop: ingen udbetalinger og kan ikke genoptages
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$
declare ok boolean; w uuid := (select id from ids where name = 'weekly');
begin
  perform public.child_allowance_set_state(w, 'stop');
  begin
    perform public.child_allowance_set_state(w, 'resume');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'stoppet kan ikke genoptages';
end $$;
reset role;
do $$
declare today date := (now() at time zone 'Europe/Copenhagen')::date; w uuid := (select id from ids where name = 'weekly');
begin
  perform private.run_allowances(today + 42);
  assert (select count(*) from public.child_allowance_payouts where schedule_id = w) = 5, 'stoppet: ingen flere udbetalinger';
end $$;

-- Månedligt: den 31. bliver sidste dag i korte måneder; præcis én gang pr. måned
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  insert into ids values ('monthly', public.child_allowance_create('00000000-0000-0000-0000-0000000000c2', 20000, 'monthly', null, 31, '2027-01-01'));
  insert into ids values ('last', public.child_allowance_create('00000000-0000-0000-0000-0000000000c2', 10000, 'monthly', null, 0, '2027-01-01', '2027-03-15'));
  insert into ids values ('friday', public.child_allowance_create('00000000-0000-0000-0000-0000000000c2', 3000, 'weekly', 5, null, '2027-01-04'));
end $$;
reset role;
do $$
declare
  m uuid := (select id from ids where name = 'monthly');
  l uuid := (select id from ids where name = 'last');
  f uuid := (select id from ids where name = 'friday');
begin
  assert (select pay_from from public.child_allowance_schedules where id = m) = '2027-01-01', 'startdato i fremtiden';
  perform private.run_allowances('2026-12-31');
  assert not exists (select 1 from public.child_allowance_payouts where schedule_id in (m, l, f)), 'intet før startdatoen';
  perform private.run_allowances('2027-02-28');
  perform private.run_allowances('2027-02-28');
  assert (select array_agg(due_on order by due_on) from public.child_allowance_payouts where schedule_id = m) = array['2027-01-31', '2027-02-28']::date[], 'den 31. → sidste dag i februar';
  assert (select array_agg(period_key order by due_on) from public.child_allowance_payouts where schedule_id = m) = array['2027-01', '2027-02'], 'én periode pr. måned';
  assert (select array_agg(due_on order by due_on) from public.child_allowance_payouts where schedule_id = l) = array['2027-01-31', '2027-02-28']::date[], 'sidste dag i måneden';
  assert (select array_agg(due_on order by due_on) from public.child_allowance_payouts where schedule_id = f)
    = array['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29', '2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26']::date[], 'hver fredag';
  assert (select occurred_on from public.child_wallet_transactions where id = (select tx_id from public.child_allowance_payouts where schedule_id = m and period_key = '2027-02')) = '2027-02-28', 'bevægelsen dateres forfaldsdagen';
  perform private.run_allowances('2027-03-31');
  assert (select count(*) from public.child_allowance_payouts where schedule_id = l) = 2, 'slutdato overholdes';
  assert (select count(*) from public.child_allowance_payouts where schedule_id = m) = 3, 'marts udbetalt';
  assert (select count(*) from public.child_wallet_transactions where child_id = '00000000-0000-0000-0000-0000000000c2' and kind = 'allowance')
       = (select count(*) from public.child_allowance_payouts p join ids on ids.id = p.schedule_id where ids.name in ('monthly', 'last', 'friday')), 'én bevægelse pr. udbetaling';
end $$;

-- ================================================================== adgang
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.child_allowance_schedules) = 0, 'barnet ser ikke ordninger';
  assert (select count(*) from public.child_allowance_payouts) = 0, 'barnet ser ikke udbetalingstabellen';
  assert (select count(*) from public.child_wallet_transactions where child_id = '00000000-0000-0000-0000-0000000000c2') = 0, 'Noah ser ikke Emmas lommepenge';
  assert (select count(*) from public.child_wallet_transactions where kind = 'allowance') = 5, 'Noah ser sine egne udbetalinger som bevægelser';
  begin
    perform public.child_allowance_update((select id from ids where name = 'monthly'), 99900);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barnet kan ikke ændre beløb';
  begin
    perform public.child_allowance_set_state((select id from ids where name = 'monthly'), 'pause');
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'barnet kan ikke pause';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare ok boolean;
begin
  assert (select count(*) from public.child_allowance_schedules) = 0, 'Farhats hjem ser ikke Vores hjems ordninger';
  assert (select count(*) from public.child_wallet_transactions) = 0, 'Farhats hjem ser ikke Vores hjems lommepenge';
  assert (select count(*) from public.household_tasks) = 0, 'Farhats hjem ser ikke opgaverne';
  begin
    perform public.child_allowance_update((select id from ids where name = 'monthly'), 99900);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'anden husstand kan ikke ændre ordning';
  begin
    perform public.child_reward_decide('7a000000-0000-0000-0000-0000000000a2', true);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'anden husstand kan ikke godkende belønning';
  begin
    perform public.child_allowance_create('00000000-0000-0000-0000-0000000000c1', 5000, 'weekly', 1, null, current_date);
    ok := false;
  exception when no_data_found then ok := true;
  end;
  assert ok, 'anden husstand kan ikke oprette lommepenge til Noah';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('authenticated', 'private.run_allowances(date)', 'execute'), 'kun systemet kører udbetalingsjobbet';
  assert not has_function_privilege('authenticated', 'private.pin_key()', 'execute'), 'nøglen kan ikke hentes';
end $$;
rollback;
