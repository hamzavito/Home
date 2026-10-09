-- =============================================================================
-- Engangsopsætning: hent nye bankposteringer hver nat via Supabase Cron
-- =============================================================================
-- Forudsætninger:
--   1. Migration 20261021000001_bank.sql er kørt
--   2. Edge Function 'bank' er deployet med verify_jwt = false og har secrets
--      ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY og APP_URL
--
-- Ret kun projektets ref i URL'en og kør scriptet i SQL Editor.
-- Hemmeligheden genereres her og ligger kun i Supabase Vault. Kan køres igen.
-- =============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  fn_url constant text := 'https://<PROJECT-REF>.supabase.co/functions/v1/bank';
begin
  if not exists (select 1 from vault.secrets where name = 'bank_sync_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bank_sync_secret',
      'Delt hemmelighed: Supabase Cron → Edge Function bank');
  end if;
  if exists (select 1 from vault.secrets where name = 'bank_sync_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'bank_sync_url'), fn_url);
  else
    perform vault.create_secret(fn_url, 'bank_sync_url', 'URL til Edge Function bank');
  end if;
end;
$$;

-- Fire gange i døgnet (PSD2 tillader højst 4 hentninger om dagen, når brugeren ikke selv er i appen).
-- Når brugeren åbner appen, hentes der desuden automatisk.
select cron.schedule(
  'bank-sync',
  '41 4,9,14,19 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'bank_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bank-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bank_sync_secret')
    ),
    body := '{"action":"sync-all"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Kontrol:
--   select * from cron.job where jobname = 'bank-sync';
--   select status_code, content from net._http_response order by created desc limit 5;
