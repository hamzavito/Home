import { Search, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { TransactionRow } from '@/components/finance/TransactionRow'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { Skeleton } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { dayLabel, formatMonth, fromIsoDate } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { useCategories, useMonthTransactions, type Transaction } from './api'
import { paidByLabel } from './paidBy'
import { useMonthParam } from './useMonthParam'

export function TransactionsPage() {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const [month, setMonth] = useMonthParam()
  const txs = useMonthTransactions(month)
  const categories = useCategories()
  const [query, setQuery] = useState('')
  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]))

  const q = query.trim().toLowerCase()
  const list = (txs.data ?? []).filter((t) => !q || t.description.toLowerCase().includes(q) || catById.get(t.category_id)?.name.toLowerCase().includes(q))
  const total = list.reduce((s, t) => s + t.amount_ore, 0)

  const groups: Array<{ day: string; items: Transaction[]; total: number }> = []
  for (const t of list) {
    const g = groups.at(-1)
    if (g && g.day === t.occurred_on) {
      g.items.push(t)
      g.total += t.amount_ore
    } else groups.push({ day: t.occurred_on, items: [t], total: t.amount_ore })
  }

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-primary px-4 shadow-card ring-1 ring-subtle focus-within:ring-2 focus-within:ring-accent">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg butik eller kategori"
          aria-label="Søg i transaktioner"
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-primary outline-none placeholder:text-muted"
        />
      </div>

      <div className="mb-2 mt-5 flex items-baseline justify-between px-1">
        <p className="text-[13px] font-semibold text-secondary">
          {list.length} {list.length === 1 ? 'udgift' : 'udgifter'}
        </p>
        <Money ore={total} size="md" decimals="always" />
      </div>

      {txs.isPending ? (
        <Skeleton className="h-64 rounded-card" />
      ) : groups.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Wallet} title={q ? 'Ingen match' : 'Ingen udgifter'} text={q ? 'Prøv et andet søgeord.' : `Intet registreret i ${formatMonth(fromIsoDate(month))}.`}>
            {!q && (
              <Button size="sm" onClick={() => navigate('/okonomi/ny')}>
                Registrér udgift
              </Button>
            )}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day}>
              <div className="mb-1.5 flex justify-between px-1 text-[13px] font-semibold text-secondary">
                <span>{dayLabel(g.day)}</span>
                <span className="tabular">−{formatAmount(g.total)} kr.</span>
              </div>
              <Card padded={false} className="divide-y divide-subtle">
                {g.items.map((t) => {
                  const c = catById.get(t.category_id)
                  return (
                    <TransactionRow
                      key={t.id}
                      title={t.description}
                      subtitle={`${c?.name ?? 'Kategori'} · ${paidByLabel(t.paid_by_kind, t.paid_by_user_id, members)}${t.source === 'receipt' ? ' · Kvittering' : ''}`}
                      amountOre={t.amount_ore}
                      icon={c?.icon ?? null}
                      color={c?.color ?? null}
                      to={`/okonomi/udgift/${t.id}`}
                    />
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
