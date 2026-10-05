import { Landmark, Plus, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatMonth, formatMonthYear, fromIsoDate, monthKey } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { frequencyShort, useEnsureDefaultGroups, useFixedGroups, useFixedItems, useFixedMonth, type FixedMonthRow } from './api'
import { GroupsSheet } from './GroupsSheet'

export function FixedPage() {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const [month, setMonth] = useMonthParam()
  const rows = useFixedMonth(month)
  const items = useFixedItems()
  const groups = useFixedGroups()
  const ensure = useEnsureDefaultGroups()
  const [groupsOpen, setGroupsOpen] = useState(false)
  const ensured = useRef(false)

  // Første gang: opret standardgrupperne (Bolig, Transport, …) – kan omdøbes bagefter
  useEffect(() => {
    if (!ensured.current && groups.data && groups.data.length === 0) {
      ensured.current = true
      ensure.mutate()
    }
  }, [groups.data, ensure])

  const active = rows.data ?? []
  const income = active.filter((r) => r.kind === 'income')
  const expenses = active.filter((r) => r.kind === 'expense')
  const incomeTotal = income.reduce((s, r) => s + r.monthly_ore, 0)
  const expenseTotal = expenses.reduce((s, r) => s + r.monthly_ore, 0)
  const activeIds = new Set(active.map((r) => r.item_id))
  const inactive = (items.data ?? []).filter((i) => !i.archived_at && !activeIds.has(i.id))
  const q = month === monthKey(new Date()) ? '' : `?m=${month.slice(0, 7)}`
  const groupList = (groups.data ?? []).filter((g) => !g.archived_at || expenses.some((e) => e.group_id === g.id))
  const ownerName = (r: FixedMonthRow) => (r.owner_kind === 'member' ? members.find((m) => m.userId === r.owner_user_id)?.displayName ?? 'Tidligere medlem' : 'Fælles')

  const itemRow = (r: FixedMonthRow) => (
    <Link key={r.item_id} to={`/okonomi/faste/${r.item_id}${q}`} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-surface-secondary">
      {r.kind === 'income' && <Avatar name={ownerName(r)} shared={r.owner_kind === 'shared'} index={members.findIndex((m) => m.userId === r.owner_user_id)} className="size-9" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold">{r.name}</p>
        <p className="truncate text-[13px] text-secondary">
          {r.frequency === 'monthly'
            ? r.kind === 'income'
              ? ownerName(r)
              : r.amount_ore < 0
                ? 'Modregning'
                : 'Månedligt'
            : `${formatAmount(Math.abs(r.amount_ore))} kr.${frequencyShort[r.frequency]}${r.due_this_month ? ' · betales i denne måned' : ''}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span className={`tabular text-[16px] font-semibold ${r.amount_ore < 0 ? 'text-positive' : ''}`}>
          {r.amount_ore < 0 ? '−' : ''}
          {formatAmount(Math.abs(r.monthly_ore))} kr.
        </span>
        {r.frequency !== 'monthly' && <p className="text-[12px] text-secondary">gns. pr. md.</p>}
      </div>
    </Link>
  )

  const loading = rows.isPending || items.isPending || groups.isPending

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />

      {loading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-32 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : (
        <>
          {/* Opsummering først (Nordnet: tal før detaljer) */}
          <Card variant="hero" className="mt-4 p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-hero-text-secondary">{formatMonth(fromIsoDate(month))}</p>
            <div className="mt-3 space-y-1.5 text-[15px]">
              <div className="flex justify-between">
                <span className="text-hero-text-secondary">Indkomst</span>
                <span className="tabular font-semibold">{formatAmount(incomeTotal, { decimals: 'always' })} kr.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-hero-text-secondary">Faste udgifter</span>
                <span className="tabular font-semibold">
                  {expenseTotal > 0 ? '−' : ''}
                  {formatAmount(expenseTotal, { decimals: 'always' })} kr.
                </span>
              </div>
            </div>
            <div className="mt-3 border-t border-white/15 pt-3">
              <p className="text-[13px] text-hero-text-secondary">Tilbage efter faste udgifter</p>
              <Money ore={incomeTotal - expenseTotal} size="xl" decimals="always" className={incomeTotal - expenseTotal < 0 ? 'text-hero-danger' : undefined} />
            </div>
          </Card>

          <SectionHeader
            title="Indtægter"
            action={
              <Button size="sm" variant="surface" aria-label="Tilføj indtægt" onClick={() => navigate('/okonomi/faste/ny?type=income')}>
                <Plus className="size-4" strokeWidth={2.6} /> Tilføj
              </Button>
            }
          />
          {income.length === 0 ? (
            <Card variant="tonal">
              <EmptyState compact icon={Landmark} title="Ingen faste indtægter" text="Fx løn, børnepenge eller anden fast indkomst." />
            </Card>
          ) : (
            <Card padded={false} className="divide-y divide-subtle">
              {income.map(itemRow)}
            </Card>
          )}

          <SectionHeader
            title="Faste udgifter"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="surface" aria-label="Redigér grupper" onClick={() => setGroupsOpen(true)}>
                  <Settings2 className="size-4" />
                </Button>
                <Button size="sm" variant="surface" aria-label="Tilføj fast udgift" onClick={() => navigate('/okonomi/faste/ny?type=expense')}>
                  <Plus className="size-4" strokeWidth={2.6} /> Tilføj
                </Button>
              </div>
            }
          />
          {expenses.length === 0 ? (
            <Card variant="tonal">
              <EmptyState compact icon={Landmark} title="Ingen faste udgifter" text="Fx husleje, bil, forsikringer og abonnementer." />
            </Card>
          ) : (
            <div className="space-y-3">
              {groupList.map((g) => {
                const list = expenses.filter((e) => e.group_id === g.id)
                if (list.length === 0) return null
                const sum = list.reduce((s, r) => s + r.monthly_ore, 0)
                return (
                  <section key={g.id}>
                    <div className="mb-1.5 flex items-baseline justify-between px-1">
                      <h3 className="text-[13px] font-semibold text-secondary">{g.name}</h3>
                      <span className="tabular text-[13px] font-semibold text-secondary">{formatAmount(sum, { decimals: 'always' })} kr.</span>
                    </div>
                    <Card padded={false} className="divide-y divide-subtle">
                      {list.map(itemRow)}
                    </Card>
                  </section>
                )
              })}
            </div>
          )}

          {inactive.length > 0 && (
            <>
              <SectionHeader title={`Ikke aktive i ${formatMonth(fromIsoDate(month))}`} />
              <Card padded={false} className="divide-y divide-subtle">
                {inactive.map((i) => (
                  <Link key={i.id} to={`/okonomi/faste/${i.id}${q}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-secondary">
                    <span className="truncate text-[15px] font-medium">{i.name}</span>
                    <span className="shrink-0 text-[13px] text-secondary">
                      {i.start_month > month ? `Fra ${formatMonthYear(fromIsoDate(i.start_month))}` : i.end_month ? `Stoppet efter ${formatMonthYear(fromIsoDate(i.end_month))}` : ''}
                    </span>
                  </Link>
                ))}
              </Card>
            </>
          )}

          {/* Afslutning: samme tal som i toppen, så man ikke skal scrolle op */}
          <Card className="mt-6 p-5">
            <dl className="space-y-2 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-secondary">Indkomst</dt>
                <dd className="tabular font-semibold">{formatAmount(incomeTotal, { decimals: 'always' })} kr.</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary">Faste udgifter</dt>
                <dd className="tabular font-semibold">
                  {expenseTotal > 0 ? '−' : ''}
                  {formatAmount(expenseTotal, { decimals: 'always' })} kr.
                </dd>
              </div>
              <div className="flex justify-between border-t border-subtle pt-2 text-[17px]">
                <dt className="font-bold">Tilbage</dt>
                <dd className={`tabular font-bold ${incomeTotal - expenseTotal < 0 ? 'text-danger' : ''}`}>
                  {incomeTotal - expenseTotal < 0 ? '−' : ''}
                  {formatAmount(Math.abs(incomeTotal - expenseTotal), { decimals: 'always' })} kr.
                </dd>
              </div>
            </dl>
            <Link to={`/okonomi${q}`} className="mt-3 block text-center text-[14px] font-semibold text-accent-text">
              Se fordelingen i Overblik
            </Link>
          </Card>
        </>
      )}

      <GroupsSheet open={groupsOpen} onClose={() => setGroupsOpen(false)} />
    </>
  )
}
