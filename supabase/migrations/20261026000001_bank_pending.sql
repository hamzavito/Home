-- =============================================================================
-- Reserverede posteringer (kortkøb, banken ikke har bogført endnu)
-- =============================================================================
-- Banken melder et kortkøb som reservation (PDNG) med det samme og bogfører det
-- først 1–3 dage senere. Reservationerne gemmes som et øjebliksbillede pr. konto
-- (erstattes ved hver hentning), så de kan vises i "Fra banken" med det samme.
-- De kan ikke godkendes – den bogførte postering kommer i indbakken som normalt.
-- =============================================================================
alter table private.bank_accounts
  add column pending jsonb not null default '[]'::jsonb check (jsonb_typeof(pending) = 'array'),
  add column pending_at timestamptz;

-- Kun Edge Functionen: erstat kontoens reservationer med dem, banken melder nu
create or replace function public.bank_set_pending(p_account_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rows jsonb;
begin
  select coalesce(jsonb_agg(x order by x ->> 'booked_on' desc), '[]'::jsonb) into rows
  from (
    select jsonb_build_object(
      'booked_on', (r ->> 'booked_on')::date,
      'amount_ore', (r ->> 'amount_ore')::bigint,
      'description', left(coalesce(nullif(trim(r ->> 'description'), ''), nullif(trim(r ->> 'counterparty'), ''), 'Postering'), 140),
      'counterparty', left(nullif(trim(r ->> 'counterparty'), ''), 140)) as x
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where coalesce((r ->> 'pending')::boolean, false)
      and coalesce((r ->> 'amount_ore')::bigint, 0) <> 0
      and (r ->> 'booked_on') ~ '^\d{4}-\d{2}-\d{2}'
    limit 200
  ) s;
  update private.bank_accounts set pending = rows, pending_at = now() where id = p_account_id;
  if not found then
    raise exception 'Kontoen findes ikke' using errcode = 'no_data_found';
  end if;
  return jsonb_array_length(rows);
end;
$$;

-- Egne reservationer i den aktuelle husstand (kun ejeren af forbindelsen ser dem)
create or replace function public.bank_pending_list()
returns table (account_name text, booked_on date, amount_ore bigint, description text, counterparty text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.name, (p ->> 'booked_on')::date, (p ->> 'amount_ore')::bigint, p ->> 'description', p ->> 'counterparty'
  from private.bank_accounts a
  join private.bank_connections c on c.id = a.connection_id
  cross join lateral jsonb_array_elements(a.pending) p
  where a.user_id = auth.uid()
    and c.status = 'active'
    and a.household_id = public.current_household_id()
    and private.is_household_member(a.household_id)
  order by 2 desc, 3;
$$;

revoke all on function public.bank_set_pending(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bank_set_pending(uuid, jsonb) to service_role;
revoke all on function public.bank_pending_list() from public, anon;
grant execute on function public.bank_pending_list() to authenticated;
