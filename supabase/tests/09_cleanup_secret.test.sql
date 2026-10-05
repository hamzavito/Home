-- Hemmeligheden til oprydningen: kun service role kan tjekke den, og kun den rigtige værdi godkendes
begin;
insert into vault.decrypted_secrets (name, decrypted_secret) values ('cleanup_receipts_secret', repeat('a1', 32));

do $$
begin
  assert not has_function_privilege('anon', 'public.verify_cleanup_secret(text)', 'execute'), 'anon må ikke tjekke';
  assert not has_function_privilege('authenticated', 'public.verify_cleanup_secret(text)', 'execute'), 'brugere må ikke tjekke';
  assert has_function_privilege('service_role', 'public.verify_cleanup_secret(text)', 'execute'), 'service role skal kunne tjekke';
end $$;

set local role service_role;
do $$
begin
  assert public.verify_cleanup_secret(repeat('a1', 32)), 'rigtig hemmelighed godkendes';
  assert not public.verify_cleanup_secret(repeat('a1', 31) || 'a2'), 'forkert hemmelighed afvises';
  assert not public.verify_cleanup_secret(''), 'tom afvises';
  assert not public.verify_cleanup_secret(null), 'null afvises';
end $$;
reset role;

-- Uden gemt hemmelighed godkendes intet (heller ikke en kort/tom værdi)
update vault.decrypted_secrets set name = 'andet' where name = 'cleanup_receipts_secret';
set local role service_role;
do $$
begin
  assert not public.verify_cleanup_secret(repeat('a1', 32)), 'ingen hemmelighed = afvist';
end $$;
rollback;
