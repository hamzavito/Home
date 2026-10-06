-- Notifikationer: tilmelding, påmindelser, nye varer, testbesked og rettigheder
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dk'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.dk'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dk');
update public.profiles set display_name = 'Anna' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Bo' where id = '00000000-0000-0000-0000-0000000000a2';
insert into public.households (id, name) values ('11111111-1111-1111-1111-111111111111', 'A'), ('22222222-2222-2222-2222-222222222222', 'B');
insert into public.household_members (household_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b1');

-- Hjælpere: gyldige nøgler (87/22 tegn base64url) og "claim som Edge Functionen"
create function pg_temp.k(n int) returns text language sql as $$ select repeat('A', n) $$;
create function pg_temp.claim() returns table (subscription_id uuid, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql as $$
begin
  set local role service_role;
  return query select * from public.claim_push_messages();
  reset role;
end $$;

-- ---------------------------------------------------------------- rettigheder
do $$
declare f text;
begin
  foreach f in array array['public.verify_push_secret(text)', 'public.push_vapid_keys()', 'public.init_push_vapid_keys(text,text)',
                           'public.claim_push_messages()', 'public.record_push_results(uuid[],uuid[])'] loop
    assert not has_function_privilege('authenticated', f, 'execute'), f || ' må ikke kunne kaldes af brugere';
    assert has_function_privilege('service_role', f, 'execute'), f || ' skal kunne kaldes af service role';
  end loop;
  foreach f in array array['public.push_public_key()', 'public.save_push_subscription(text,text,text)',
                           'public.disable_push_subscription(text)', 'public.send_test_notification()'] loop
    assert has_function_privilege('authenticated', f, 'execute'), f || ' skal kunne kaldes af brugere';
  end loop;
  assert not has_table_privilege('authenticated', 'public.push_subscriptions', 'select'), 'tilmeldinger kan ikke læses direkte';
  assert not has_table_privilege('authenticated', 'public.push_subscriptions', 'insert'), 'tilmeldinger kan ikke indsættes direkte';
  assert not has_table_privilege('authenticated', 'private.push_queue_shopping', 'select'), 'køen er privat';
end $$;

-- ---------------------------------------------------------------- tilmelding
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare ok boolean;
begin
  assert public.send_test_notification() = false, 'ingen telefon tilmeldt endnu';
  perform public.save_push_subscription('https://push.example/a1-phone', pg_temp.k(87), pg_temp.k(22));
  perform public.save_push_subscription('https://push.example/a1-phone', pg_temp.k(87), pg_temp.k(22)); -- igen: ingen dublet
  begin
    perform public.save_push_subscription('http://usikker.example/x', pg_temp.k(87), pg_temp.k(22));
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'kun https-endpoints';
  begin
    perform public.save_push_subscription('https://push.example/kort', 'kort', 'kort');
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'ugyldige nøgler afvises';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select public.save_push_subscription('https://push.example/a2-phone', pg_temp.k(87), pg_temp.k(22));
-- A2 kan ikke afmelde A1's telefon
select public.disable_push_subscription('https://push.example/a1-phone');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.save_push_subscription('https://push.example/b1-phone', pg_temp.k(87), pg_temp.k(22));
reset role;

do $$ begin
  assert (select count(*) from public.push_subscriptions where disabled_at is null) = 3, '3 aktive telefoner';
  assert (select user_id from public.push_subscriptions where endpoint = 'https://push.example/a1-phone') = '00000000-0000-0000-0000-0000000000a1', 'a1 ejer sin telefon';
end $$;

-- Ingen beskeder endnu
do $$ begin
  assert (select count(*) from pg_temp.claim()) = 0, 'intet at sende';
  assert not private.push_work_pending(), 'intet i kø';
end $$;

-- ---------------------------------------------------------------- påmindelser
-- Aftaler gemt for en time siden; påmindelsestidspunktet er lige passeret
insert into public.calendar_events (id, household_id, title, event_date, start_time, end_time, all_day, reminder_minutes, for_user_id, created_by, created_at, updated_at)
select '33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tandlæge',
  (s.t)::date, (s.t)::time, null, false, 30, '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour', now() - interval '1 hour'
from (select date_trunc('minute', (now() at time zone 'Europe/Copenhagen') + interval '29 minutes') as t) s;
insert into public.calendar_events (id, household_id, title, event_date, start_time, all_day, reminder_minutes, created_by, created_at, updated_at)
select '33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Forældremøde',
  (s.t)::date, (s.t)::time, false, 60, '00000000-0000-0000-0000-0000000000a1', now() - interval '2 hours', now() - interval '2 hours'
from (select date_trunc('minute', (now() at time zone 'Europe/Copenhagen') + interval '59 minutes') as t) s;
-- Ikke endnu (om 2 timer, påmind 1 time før)
insert into public.calendar_events (household_id, title, event_date, start_time, all_day, reminder_minutes, created_by, updated_at)
select '11111111-1111-1111-1111-111111111111', 'Senere', (s.t)::date, (s.t)::time, false, 60, '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'
from (select (now() at time zone 'Europe/Copenhagen') + interval '2 hours' as t) s;
-- Ingen påmindelse valgt
insert into public.calendar_events (household_id, title, event_date, start_time, all_day, reminder_minutes, created_by, updated_at)
select '11111111-1111-1111-1111-111111111111', 'Uden', (s.t)::date, (s.t)::time, false, null, '00000000-0000-0000-0000-0000000000a1', now() - interval '1 hour'
from (select (now() at time zone 'Europe/Copenhagen') + interval '10 minutes' as t) s;
-- Oprettet EFTER påmindelsestidspunktet: ingen påmindelse "bagud"
insert into public.calendar_events (household_id, title, event_date, start_time, all_day, reminder_minutes, created_by)
select '11111111-1111-1111-1111-111111111111', 'For sent', (s.t)::date, (s.t)::time, false, 60, '00000000-0000-0000-0000-0000000000a1'
from (select (now() at time zone 'Europe/Copenhagen') + interval '50 minutes' as t) s;
-- Anden husstand: påmindelse til b1
insert into public.calendar_events (household_id, title, event_date, start_time, all_day, reminder_minutes, created_by, updated_at)
select '22222222-2222-2222-2222-222222222222', 'B-aftale', (s.t)::date, (s.t)::time, false, 15, '00000000-0000-0000-0000-0000000000b1', now() - interval '1 hour'
from (select date_trunc('minute', (now() at time zone 'Europe/Copenhagen') + interval '14 minutes') as t) s;

do $$
declare n int;
begin
  assert private.push_work_pending(), 'påmindelser venter';
  create temp table got on commit drop as select * from pg_temp.claim();
  -- Tandlæge → kun a2 (gælder for). Forældremøde → a1 og a2 (fælles). B-aftale → b1.
  assert (select count(*) from got) = 4, format('4 beskeder, fik %s', (select count(*) from got));
  assert (select count(*) from got where payload ->> 'title' = 'Tandlæge') = 1, 'tandlæge én gang';
  assert (select endpoint from got where payload ->> 'title' = 'Tandlæge') = 'https://push.example/a2-phone', 'tandlæge til a2';
  assert (select count(*) from got where payload ->> 'title' = 'Forældremøde') = 2, 'fælles til begge';
  assert (select endpoint from got where payload ->> 'title' = 'B-aftale') = 'https://push.example/b1-phone', 'b-aftale kun til b1';
  assert not exists (select 1 from got where payload ->> 'title' in ('Senere', 'Uden', 'For sent')), 'ingen forkerte påmindelser';
  assert (select payload ->> 'url' from got where payload ->> 'title' = 'Tandlæge') = '/hjemmet/kalender/33333333-0000-0000-0000-000000000001', 'link til aftalen';
  assert (select payload ->> 'body' from got where payload ->> 'title' = 'Tandlæge') ~ '^I (dag|morgen) kl\. \d{1,2}\.\d{2}$', 'tekst: ' || (select payload ->> 'body' from got where payload ->> 'title' = 'Tandlæge');
  -- Sendes kun én gang
  select count(*) into n from pg_temp.claim();
  assert n = 0, 'påmindelser sendes kun én gang';
end $$;

-- Flyttes aftalen, kan den påmindes igen på det nye tidspunkt
-- (updated_at sættes manuelt til før påmindelsen – hele testen kører i én transaktion med samme now())
alter table public.calendar_events disable trigger calendar_events_updated_at;
update public.calendar_events set start_time = start_time - interval '1 minute', updated_at = now() - interval '30 minutes'
where id = '33333333-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from pg_temp.claim()) = 1, 'flyttet aftale påmindes igen';
end $$;

-- Slået fra i indstillingerne → ingen påmindelse
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set notify_calendar = false where id = '00000000-0000-0000-0000-0000000000a2';
reset role;
update public.calendar_events set start_time = start_time - interval '1 minute', updated_at = now() - interval '30 minutes'
where id = '33333333-0000-0000-0000-000000000001';
alter table public.calendar_events enable trigger calendar_events_updated_at;
do $$ begin
  assert (select count(*) from pg_temp.claim()) = 0, 'notify_calendar = false respekteres';
end $$;

-- ---------------------------------------------------------------- tekster
do $$ begin
  assert private.danish_list(array['mælk']) = 'mælk', 'liste 1';
  assert private.danish_list(array['mælk', 'æg']) = 'mælk og æg', 'liste 2';
  assert private.danish_list(array['mælk', 'æg', 'brød']) = 'mælk, æg og brød', 'liste 3';
  assert private.danish_list(array['mælk', 'æg', 'brød', 'ost', 'smør']) = 'mælk, æg, brød og 2 mere', 'liste 5';
  assert private.event_when_text((now() at time zone 'Europe/Copenhagen')::date, '09:05', '10:30') = 'I dag kl. 9.05–10.30', 'i dag med sluttid';
  assert private.event_when_text((now() at time zone 'Europe/Copenhagen')::date + 1, null, null) = 'I morgen hele dagen', 'i morgen hele dagen';
  assert private.event_when_text('2026-10-16', '14:00', null) like 'Fredag 16. oktober kl. 14.00', 'dato: ' || private.event_when_text('2026-10-16', '14:00', null);
  -- Sommertid: kl. 8 dansk tid = 06:00 UTC om sommeren, 07:00 UTC om vinteren
  assert private.event_reminder_at('2026-07-01', '08:00', 0) = '2026-07-01 06:00:00+00', 'sommertid';
  assert private.event_reminder_at('2026-12-01', '08:00', 0) = '2026-12-01 07:00:00+00', 'vintertid';
  assert private.event_reminder_at('2026-12-01', null, 360) = '2026-11-30 17:00:00+00', 'heldag: dagen før kl. 18';
  assert private.event_reminder_at('2026-12-01', null, -480) = '2026-12-01 07:00:00+00', 'heldag: samme dag kl. 8';
end $$;

-- ---------------------------------------------------------------- indkøb
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.ensure_shopping_list();
insert into public.shopping_items (household_id, list_id, name)
select '11111111-1111-1111-1111-111111111111', id, n
from public.shopping_lists, unnest(array['Mælk', 'Æg', 'Brød']) n
where household_id = '11111111-1111-1111-1111-111111111111';
reset role;

do $$ begin
  assert (select count(*) from private.push_queue_shopping where sent_at is null) = 3, '3 varer i kø';
  assert (select count(*) from pg_temp.claim()) = 0, 'venter 30 sek. på flere varer';
  assert not private.push_work_pending(), 'ikke klar endnu';
end $$;

update private.push_queue_shopping set created_at = now() - interval '1 minute';
-- Brød er allerede købt → nævnes ikke
update public.shopping_items set is_checked = true where name = 'Brød';
do $$
declare got jsonb;
begin
  assert private.push_work_pending(), 'klar efter 30 sek.';
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'payload', payload)) into got from pg_temp.claim();
  assert jsonb_array_length(got) = 1, 'én samlet besked: ' || got::text;
  assert got -> 0 ->> 'endpoint' = 'https://push.example/a2-phone', 'kun til den anden i husstanden';
  assert got -> 0 -> 'payload' ->> 'body' = 'Anna tilføjede Mælk og Æg', 'tekst: ' || (got -> 0 -> 'payload' ->> 'body');
  assert got -> 0 -> 'payload' ->> 'url' = '/indkob', 'link til indkøb';
  assert (select count(*) from pg_temp.claim()) = 0, 'sendes kun én gang';
end $$;

-- Slået fra → ingen besked
update public.profiles set notify_shopping = false where id = '00000000-0000-0000-0000-0000000000a2';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.shopping_items (household_id, list_id, name)
select '11111111-1111-1111-1111-111111111111', id, 'Ost' from public.shopping_lists where household_id = '11111111-1111-1111-1111-111111111111';
reset role;
update private.push_queue_shopping set created_at = now() - interval '1 minute' where sent_at is null;
do $$ begin
  assert (select count(*) from pg_temp.claim()) = 0, 'notify_shopping = false respekteres';
end $$;

-- ---------------------------------------------------------------- testbesked og cron
insert into vault.decrypted_secrets (name, decrypted_secret) values
  ('push_function_url', 'https://projekt.example/functions/v1/send-push'),
  ('push_secret', repeat('c3', 32));

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.send_test_notification(), 'testbesked sendt';
end $$;
reset role;
do $$
declare got jsonb;
begin
  assert (select count(*) from net.requests) = 1, 'Edge Function kaldt med det samme';
  assert (select headers ->> 'x-push-secret' from net.requests) = repeat('c3', 32), 'med hemmeligheden';
  select jsonb_agg(endpoint) into got from pg_temp.claim();
  assert got = '["https://push.example/a1-phone"]'::jsonb, 'test kun til egne telefoner: ' || got::text;
  -- Cron kalder kun, når der er noget at sende
  assert private.push_tick() is null, 'intet at sende → intet kald';
  assert (select count(*) from net.requests) = 1, 'stadig ét kald';
end $$;

-- Afviste telefoner afmeldes; afmeldte får intet
set local role service_role;
select public.record_push_results(
  array[(select id from public.push_subscriptions where endpoint = 'https://push.example/a1-phone')],
  array[(select id from public.push_subscriptions where endpoint = 'https://push.example/b1-phone')]);
reset role;
do $$ begin
  assert (select last_success_at is not null from public.push_subscriptions where endpoint = 'https://push.example/a1-phone'), 'succes registreret';
  assert (select disabled_at is not null from public.push_subscriptions where endpoint = 'https://push.example/b1-phone'), 'afvist telefon afmeldt';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.disable_push_subscription('https://push.example/a1-phone');
do $$ begin
  assert public.send_test_notification() = false, 'afmeldt telefon tæller ikke';
end $$;
-- Gen-tilmelding genaktiverer
select public.save_push_subscription('https://push.example/a1-phone', pg_temp.k(87), pg_temp.k(22));
do $$ begin
  assert public.send_test_notification(), 'aktiv igen';
end $$;
reset role;

-- ---------------------------------------------------------------- hemmelighed og VAPID-nøgler
set local role service_role;
do $$
declare k jsonb;
begin
  assert public.verify_push_secret(repeat('c3', 32)), 'rigtig hemmelighed';
  assert not public.verify_push_secret(repeat('c3', 31) || 'c4'), 'forkert hemmelighed';
  assert not public.verify_push_secret(null), 'null afvist';
  assert public.push_vapid_keys() is null, 'ingen nøgler endnu';
  k := public.init_push_vapid_keys('PUB1', '{"d":"x"}');
  assert k ->> 'public_key' = 'PUB1', 'nøgler gemt';
  k := public.init_push_vapid_keys('PUB2', '{"d":"y"}');
  assert k ->> 'public_key' = 'PUB1' and k ->> 'private_jwk' = '{"d":"x"}', 'eksisterende nøgler overskrives aldrig';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert public.push_public_key() = 'PUB1', 'offentlig nøgle kan hentes af brugere';
end $$;
reset role;
rollback;
