-- =============================================================================
-- Engangsopsætning: notifikationer (Web Push) via Supabase Cron
-- =============================================================================
-- Forudsætninger:
--   1. Migration 20261013000001_push_notifications.sql er kørt
--   2. Edge Function 'send-push' er deployet med verify_jwt = false
--      (den tjekker selv headeren x-push-secret)
--
-- Ret projektets ref og appens adresse herunder og kør scriptet i SQL Editor.
-- Hemmeligheden genereres her (256 bit) og ligger kun i Supabase Vault.
-- VAPID-nøglerne laves af Edge Functionen første gang (kaldet nederst).
-- Scriptet kan køres igen.
-- =============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  fn_url constant text := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-push';
  -- Afsenderen Apple/Google kan kontakte (VAPID "sub"): appens adresse
  subject constant text := 'https://<APP-ADRESSE>';
begin
  if not exists (select 1 from vault.secrets where name = 'push_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_secret',
      'Delt hemmelighed: private.push_tick → Edge Function send-push');
  end if;
  if exists (select 1 from vault.secrets where name = 'push_function_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'push_function_url'), fn_url);
  else
    perform vault.create_secret(fn_url, 'push_function_url', 'URL til Edge Function send-push');
  end if;
  if exists (select 1 from vault.secrets where name = 'push_subject') then
    perform vault.update_secret((select id from vault.secrets where name = 'push_subject'), subject);
  else
    perform vault.create_secret(subject, 'push_subject', 'VAPID subject (kontakt for push-tjenesterne)');
  end if;
end;
$$;

-- Hvert minut: kalder kun Edge Functionen, når der er noget at sende. Samme navn = opdaterer jobbet.
select cron.schedule('push-notifications', '* * * * *', 'select private.push_tick()');

-- Cron logger hver kørsel (1.440 rækker i døgnet). Historik ældre end 3 dage ryddes dagligt,
-- så databasen ikke vokser (gratisplanen har 500 MB).
select cron.schedule('cron-history-cleanup', '23 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);

-- Første kald: opretter VAPID-nøglerne
select private.push_tick(true);

-- Kontrol:
--   select public.push_public_key() is not null;                        -- nøglerne findes
--   select * from cron.job where jobname = 'push-notifications';
--   select status_code, content from net._http_response order by created desc limit 5;
--   Forventet svar: {"ok":true,"sent":…,"gone":…,"failed":0}
