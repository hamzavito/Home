-- =============================================================================
-- Ignorér alle nye bankposteringer på én gang (fx efter første hentning på 90 dage)
-- =============================================================================
-- Kun egne posteringer i egen husstand. De kan stadig tages med enkeltvis bagefter
-- under "Frasorteret". Returnerer antallet.
-- =============================================================================
create or replace function public.bank_ignore_all()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  hid uuid := public.current_household_id();
begin
  if hid is null or not private.is_household_member(hid) then
    raise exception 'Ingen husstand' using errcode = 'insufficient_privilege';
  end if;
  update public.bank_transactions b
     set state = 'ignored'
   where b.household_id = hid and b.user_id = auth.uid() and b.state = 'new';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.bank_ignore_all() from public, anon;
grant execute on function public.bank_ignore_all() to authenticated;
