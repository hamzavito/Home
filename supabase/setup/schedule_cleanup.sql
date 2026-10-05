-- =============================================================================
-- Engangsopsætning: daglig oprydning af kvitteringsbilleder via Supabase Cron
-- =============================================================================
-- Forudsætninger (se docs/SETUP.md):
--   1. Edge Function 'cleanup-receipts' er deployet
--      (npx supabase functions deploy cleanup-receipts --no-verify-jwt)
--   2. Secret sat:  npx supabase secrets set CLEANUP_SECRET=<lang tilfældig streng>
--   3. Udvidelserne pg_cron og pg_net er slået til (Database → Extensions)
--
-- Ret de to værdier nedenfor og kør scriptet i SQL Editor.
-- Hemmeligheden gemmes i Supabase Vault – ikke i klartekst i cron-jobbet.
-- Scriptet kan køres igen (opdaterer secrets og job).
-- =============================================================================
do $$
declare
  fn_url constant text := 'https://<PROJECT-REF>.supabase.co/functions/v1/cleanup-receipts';
  fn_secret constant text := '<SAMME-VÆRDI-SOM-CLEANUP_SECRET>';
begin
  if exists (select 1 from vault.secrets where name = 'cleanup_receipts_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'cleanup_receipts_url'), fn_url);
  else
    perform vault.create_secret(fn_url, 'cleanup_receipts_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'cleanup_receipts_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'cleanup_receipts_secret'), fn_secret);
  else
    perform vault.create_secret(fn_secret, 'cleanup_receipts_secret');
  end if;
end;
$$;

-- Kører hver nat kl. 03:17 UTC (ca. 04:17/05:17 dansk tid).
select cron.schedule(
  'cleanup-receipts',
  '17 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_receipts_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_receipts_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Kontrol:
--   select * from cron.job;                                   -- jobbet findes
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select * from net._http_response order by created desc limit 5;  -- svar fra funktionen
