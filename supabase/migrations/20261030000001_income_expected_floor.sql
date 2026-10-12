-- =============================================================================
-- Indtægter i månedens plan
-- * Små beløb på en kilde med forventet beløb (fx to MobilePay-beløb på "Løn")
--   erstatter ikke den forventede løn: det faktiske beløb bruges først, når der
--   er modtaget mindst halvdelen af det forventede.
-- * Indtægter uden kilde tæller ikke med, før de er godkendt til en kilde
--   (status 'unassigned', used_ore 0).
-- =============================================================================
create or replace function public.month_income(p_month date)
returns table (
  source_id uuid,
  name text,
  type_name text,
  owner_kind text,
  owner_user_id uuid,
  actual_ore bigint,
  expected_ore bigint,
  used_ore bigint,
  status text,
  entry_count integer,
  unconfirmed_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (select date_trunc('month', p_month)::date as start),
  actual as (
    select e.source_id, sum(e.amount_ore)::bigint as ore, count(*)::int as cnt,
           count(*) filter (where e.source_id is not null and not e.matched_by_user)::int as unconfirmed
    from public.income_entries e, m
    where e.household_id = public.current_household_id() and e.period_month = m.start
    group by e.source_id
  ),
  expected as (
    select s.id as source_id, f.monthly_ore as ore
    from public.fixed_items_month(p_month) f
    join public.income_sources s on s.fixed_item_id = f.item_id
    where f.kind = 'income'
  ),
  rows as (
    select s.id, s.name, t.name as type_name, s.owner_kind, s.owner_user_id,
           coalesce(a.ore, 0) as act, ex.ore as exp, coalesce(a.cnt, 0) as cnt, coalesce(a.unconfirmed, 0) as unconfirmed,
           (a.cnt > 0 and (ex.ore is null or a.ore * 2 >= ex.ore)) as received
    from public.income_sources s
    join public.income_types t on t.id = s.type_id
    left join actual a on a.source_id = s.id
    left join expected ex on ex.source_id = s.id
    where s.household_id = public.current_household_id()
      and (a.cnt > 0 or ex.ore is not null)
  )
  select r.id, r.name, r.type_name, r.owner_kind, r.owner_user_id, r.act, r.exp,
         case when r.received then r.act else coalesce(r.exp, 0) end,
         case when r.received then 'actual' else 'expected' end,
         r.cnt, r.unconfirmed
  from rows r
  union all
  select null, 'Uden kilde', null, null, null, a.ore, null, 0::bigint, 'unassigned', a.cnt, 0
  from actual a where a.source_id is null
  order by 9, 2;
$$;
