-- =============================================================================
-- Hemmeligheden til den daglige oprydning ligger kun i Supabase Vault.
-- =============================================================================
-- Supabase Cron sender den i headeren x-cleanup-secret, og Edge Functionen
-- 'cleanup-receipts' kontrollerer den via denne funktion (med service role).
-- Så skal hemmeligheden ikke også sættes som Edge Function-secret, og den
-- forlader aldrig databasen i klartekst.
-- =============================================================================
create or replace function public.verify_cleanup_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32, false)
     and coalesce((
       select s.decrypted_secret = p_secret
       from vault.decrypted_secrets s
       where s.name = 'cleanup_receipts_secret'
       limit 1
     ), false);
$$;

revoke all on function public.verify_cleanup_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cleanup_secret(text) to service_role;
