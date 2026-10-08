-- =============================================================================
-- Indtægter fra MobilePay godkendes ikke automatisk
-- =============================================================================
-- MobilePay ind er ofte penge fra venner/familie (fx deling af en regning) og
-- ikke indtjening. De bliver i "Fra banken", til de godkendes eller ignoreres.
-- Alt andet, der kommer ind (undtagen overførsler mellem egne konti), godkendes
-- stadig automatisk som indtægt.
-- =============================================================================
create or replace function private.is_mobilepay(p_counterparty text, p_description text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_counterparty, '') || ' ' || coalesce(p_description, '')) ~ 'mobile ?pay|mobilpay'
$$;

create or replace function public.bank_auto_income(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bank_transactions;
  n integer := 0;
begin
  for b in
    select x.* from public.bank_transactions x
    where x.state = 'new' and x.amount_ore > 0 and (p_user is null or x.user_id = p_user)
      and not private.is_mobilepay(x.counterparty, x.description)
    order by x.booked_on
    for update of x
  loop
    continue when not private.has_write_access(b.household_id);
    perform private.bank_import_income(b);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.is_mobilepay(text, text) from public, anon, authenticated;
revoke all on function public.bank_auto_income(uuid) from public, anon, authenticated;
grant execute on function public.bank_auto_income(uuid) to service_role;
