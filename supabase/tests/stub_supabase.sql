-- Minimal efterligning af Supabase-miljøet, så migrations og RLS kan testes
-- mod en almindelig Postgres uden Docker. Bruges KUN af run-local.sh.
-- Roller gælder hele klyngen (genbruges af backup-testens anden database)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- pgcrypto ligger i schemaet extensions i Supabase
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase giver som udgangspunkt API-rollerne fulde rettigheder på public;
-- sikkerheden ligger i RLS. Vi efterligner det her.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Vault (forenklet): kun den dekrypterede visning, som funktionerne læser.
create schema vault;
create table vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text unique, decrypted_secret text);

-- Storage (forenklet): buckets og objects med RLS, som i Supabase.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;

-- Vault: oprettelse af hemmeligheder (bruges af init_push_vapid_keys)
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.decrypted_secrets (name, decrypted_secret) values (new_name, new_secret) returning id
$$;

-- pg_net (forenklet): kald registreres i en tabel i stedet for at blive sendt
create schema net;
create table net.requests (id bigserial primary key, url text, body jsonb, headers jsonb, created_at timestamptz default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$
  insert into net.requests (url, body, headers) values (url, body, headers) returning id
$$;
