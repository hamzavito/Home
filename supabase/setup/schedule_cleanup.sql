-- =============================================================================
-- Engangsopsætning: daglig oprydning af kvitteringsbilleder via Supabase Cron
-- =============================================================================
-- Forudsætninger:
--   1. Migration 20261011000001_cleanup_secret.sql er kørt
--   2. Edge Function 'cleanup-receipts' er deployet med verify_jwt = false
--      (den tjekker selv headeren x-cleanup-secret)
--
-- Ret kun projektets ref i URL'en og kør scriptet i SQL Editor.
-- Hemmeligheden genereres her (256 bit) og ligger kun i Supabase Vault –
-- den skal ikke kopieres nogen steder hen. Scriptet kan køres igen.
-- =============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  fn_url constant text := 'https://<PROJECT-REF>.supabase.co/functions/v1/cleanup-receipts';
begin
  if not exists (select 1 from vault.secrets where name = 'cleanup_receipts_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cleanup_receipts_secret',
      'Delt hemmelighed: Supabase Cron → Edge Function cleanup-receipts');
  end if;
  if exists (select 1 from vault.secrets where name = 'cleanup_receipts_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'cleanup_receipts_url'), fn_url);
  else
    perform vault.create_secret(fn_url, 'cleanup_receipts_url', 'URL til Edge Function cleanup-receipts');
  end if;
end;
$$;

-- Kører hver nat kl. 03:17 UTC (ca. 04:17/05:17 dansk tid). Samme navn = opdaterer jobbet.
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
--   select * from cron.job;                                             -- jobbet findes
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
--   Forventet svar: {"ok":true,"expiredImages":…,"abandonedUploads":…,"orphanFiles":…,"fileErrors":0}
