-- =============================================================================
-- Slet et barn (kun Edge Function "child-admin"; ejeren bekræfter i appen)
-- =============================================================================
-- Slettes: barnets login, lommepenge, opsparingsmål, faste lommepenge, notifikationer
-- og aftaler, hvor barnet er eneste deltager. Opgaver bliver uden ansvarlig, og
-- barnet fjernes fra fælles aftaler. Udgifter/indtægter, der stod på barnet,
-- bliver fælles. Profilen anonymiseres; login-identiteten slettes bagefter.
-- =============================================================================
create or replace function public.child_delete_prepare(p_owner uuid, p_child uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := private.owner_household(p_owner);
begin
  if hid is null then
    raise exception 'Kun ejere kan slette børn' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('household_members:' || hid::text));
  if not exists (select 1 from public.household_members where household_id = hid and user_id = p_child and role = 'child') then
    raise exception 'Barnet findes ikke' using errcode = 'no_data_found';
  end if;

  delete from public.calendar_events where household_id = hid and participant_ids = array[p_child];
  update public.calendar_events
     set participant_ids = array_remove(participant_ids, p_child),
         for_user_id = case when for_user_id = p_child then null else for_user_id end
   where household_id = hid and (p_child = any (participant_ids) or for_user_id = p_child);

  update public.transactions set paid_by_kind = 'shared', paid_by_user_id = null where household_id = hid and paid_by_user_id = p_child;
  update public.fixed_items set owner_kind = 'shared', owner_user_id = null where household_id = hid and owner_user_id = p_child;
  update public.income_entries set received_by_kind = 'shared', received_by_user_id = null where household_id = hid and received_by_user_id = p_child;

  delete from public.push_subscriptions where user_id = p_child;
  -- Kaskade: login (PIN), lommepenge, mål, faste lommepenge; opgaver mister ansvarlig
  delete from public.household_members where household_id = hid and user_id = p_child;
  update public.profiles set display_name = 'Tidligere medlem', color = null where id = p_child;
end;
$$;

revoke all on function public.child_delete_prepare(uuid, uuid) from public, anon, authenticated;
grant execute on function public.child_delete_prepare(uuid, uuid) to service_role;
