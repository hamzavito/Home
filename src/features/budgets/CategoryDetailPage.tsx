import { Archive, ArchiveRestore, Pencil, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { CategoryIcon } from '@/components/finance/CategoryIcon'
import { TransactionRow } from '@/components/finance/TransactionRow'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AmountInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { MonthStepper } from '@/components/ui/MonthStepper'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import {
  errorMessage,
  useBudgetMonth,
  useCategories,
  useCategoryDefaults,
  useMonthTransactions,
  useSetCategoryDefault,
  useSetMonthlyBudget,
  useUpdateCategory,
  type Category,
} from '@/features/finance/api'
import { paidByLabel } from '@/features/finance/paidBy'
import { useMonthParam } from '@/features/finance/useMonthParam'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { budgetStatus, percentUsed, statusColor, statusLabel } from '@/lib/budget'
import { formatMonth, formatMonthYear, fromIsoDate, monthKey, relativeDay } from '@/lib/dates'
import { formatAmount, parseKr, toInputValue } from '@/lib/money'
import { daysInMonth, elapsedDays } from '@/lib/series'
import { CategoryEditor } from './CategoryEditor'

type SheetKind = 'month' | 'default' | 'edit' | 'archive' | null

export function CategoryDetailPage() {
  const { id } = useParams()
  const categories = useCategories()
  const category = categories.data?.find((c) => c.id === id)

  if (categories.isPending) return <FullScreenLoader />
  if (!category)
    return (
      <>
        <PageHeader title="Kategori" back="/okonomi/budgetter" />
        <EmptyState icon={WalletCards} title="Kategorien findes ikke" />
      </>
    )
  return <CategoryDetail category={category} />
}

function CategoryDetail({ category }: { category: Category }) {
  const { members } = useHousehold()
  const [month, setMonth] = useMonthParam()
  const budget = useBudgetMonth(month)
  const transactions = useMonthTransactions(month)
  const defaults = useCategoryDefaults(category.id)
  const [sheet, setSheet] = useState<SheetKind>(null)

  const line = budget.data?.find((l) => l.category_id === category.id)
  const budgetOre = line?.budget_ore ?? 0
  const spentOre = line?.spent_ore ?? 0
  const remaining = budgetOre - spentOre
  const status = budgetStatus(spentOre, budgetOre)
  const elapsed = elapsedDays(month)
  const days = daysInMonth(month)
  const pace = elapsed > 0 && elapsed < days ? elapsed / days : undefined
  const txs = (transactions.data ?? []).filter((t) => t.category_id === category.id)
  const archived = Boolean(category.archived_at)
  const currentMonth = monthKey(new Date())
  const currentDefault = defaults.data?.find((d) => d.valid_from <= currentMonth)
  const q = month === currentMonth ? '' : `?m=${month.slice(0, 7)}`

  return (
    <>
      <PageHeader
        title={category.name}
        eyebrow={archived ? 'Arkiveret kategori' : 'Budget'}
        back={`/okonomi/budgetter${q}`}
        action={
          <button type="button" aria-label="Redigér kategori" onClick={() => setSheet('edit')} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
            <Pencil className="size-4.5" />
          </button>
        }
      />
      <MonthSwitcher month={month} onChange={setMonth} />

      {/* Månedens status */}
      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-secondary">{remaining < 0 ? 'Over budget' : 'Tilbage'} i {formatMonth(fromIsoDate(month))}</p>
            <Money ore={Math.abs(remaining)} size="xl" decimals="never" className={remaining < 0 ? 'text-danger' : undefined} />
          </div>
          <CategoryIcon icon={category.icon} color={category.color} size="lg" />
        </div>
        <ProgressBar value={spentOre} max={budgetOre} pace={pace} size="lg" className="mt-5" label={statusLabel[status]} />
        <div className="tabular mt-2.5 flex justify-between text-[13px]">
          <span className="text-secondary">
            {formatAmount(spentOre, { decimals: 'never' })} / {formatAmount(budgetOre, { decimals: 'never' })} kr.
          </span>
          <span className="font-semibold" style={{ color: status === 'normal' || status === 'none' ? 'var(--text-secondary)' : statusColor[status] }}>
            {percentUsed(spentOre, budgetOre)} % · {statusLabel[status]}
          </span>
        </div>
      </Card>

      {/* Budgetindstillinger */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card variant="tonal" className="p-4">
          <p className="text-[13px] font-medium text-secondary">Budget i {formatMonth(fromIsoDate(month))}</p>
          <Money ore={budgetOre} size="lg" decimals="never" />
          <p className="mt-0.5 text-[12px] text-muted">{line?.budget_source === 'override' ? 'Tilpasset denne måned' : line?.budget_source === 'default' ? 'Standardbudget' : 'Intet budget'}</p>
          {!archived && (
            <Button size="sm" variant="surface" className="mt-3 w-full" onClick={() => setSheet('month')}>
              Tilpas måned
            </Button>
          )}
        </Card>
        <Card variant="tonal" className="p-4">
          <p className="text-[13px] font-medium text-secondary">Standard pr. måned</p>
          <Money ore={currentDefault?.amount_ore ?? 0} size="lg" decimals="never" />
          <p className="mt-0.5 text-[12px] text-muted">{currentDefault ? `Siden ${formatMonthYear(fromIsoDate(currentDefault.valid_from))}` : 'Ikke sat'}</p>
          {!archived && (
            <Button size="sm" variant="surface" className="mt-3 w-full" onClick={() => setSheet('default')}>
              Ændr standard
            </Button>
          )}
        </Card>
      </div>

      {/* Udgifter i måneden */}
      <SectionHeader title="Udgifter" />
      {txs.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={WalletCards} title="Ingen udgifter" text={`Intet registreret i ${formatMonth(fromIsoDate(month))}.`} />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {txs.map((t) => (
            <TransactionRow
              key={t.id}
              title={t.description}
              subtitle={paidByLabel(t.paid_by_kind, t.paid_by_user_id, members)}
              amountOre={t.amount_ore}
              icon={category.icon}
              color={category.color}
              meta={relativeDay(t.occurred_on)}
              to={`/okonomi/udgift/${t.id}`}
            />
          ))}
        </Card>
      )}

      {/* Historik for standardbudget */}
      {(defaults.data?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Standardbudget over tid" />
          <Card padded={false} className="divide-y divide-subtle">
            {defaults.data!.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[15px]">
                  Fra <span className="font-semibold first-letter:uppercase">{formatMonthYear(fromIsoDate(d.valid_from))}</span>
                  {d.valid_from > currentMonth && <span className="ml-2 rounded-full bg-surface-accent px-2 py-0.5 text-[11px] font-semibold text-accent-text">Planlagt</span>}
                </span>
                <Money ore={d.amount_ore} size="md" decimals="never" />
              </div>
            ))}
          </Card>
          <p className="mt-2 px-1 text-[12px] text-muted">Tidligere måneder beholder det budget, der gjaldt dengang.</p>
        </>
      )}

      <ListGroup className="mt-8">
        {archived ? (
          <ListRow icon={ArchiveRestore} title="Gendan kategori" onClick={() => setSheet('archive')} />
        ) : (
          <ListRow icon={Archive} iconColor="var(--danger)" tone="danger" title="Arkivér kategori" onClick={() => setSheet('archive')} />
        )}
      </ListGroup>

      <MonthBudgetSheet open={sheet === 'month'} onClose={() => setSheet(null)} category={category} month={month} current={line} />
      <DefaultBudgetSheet open={sheet === 'default'} onClose={() => setSheet(null)} category={category} currentOre={currentDefault?.amount_ore ?? 0} />
      <EditCategorySheet open={sheet === 'edit'} onClose={() => setSheet(null)} category={category} />
      <ArchiveSheet open={sheet === 'archive'} onClose={() => setSheet(null)} category={category} />
    </>
  )
}

function SheetError({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{errorMessage(error)}</p>
}

type MonthLine = { budget_ore: number; budget_source: string; default_ore: number } | undefined

// Hvert sheet monterer sin formular kun når det er åbent, så startværdierne
// altid er friske, og fejl nulstilles ved næste åbning.

function MonthBudgetSheet({ open, onClose, category, month, current }: { open: boolean; onClose: () => void; category: Category; month: string; current: MonthLine }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Budget for ${formatMonthYear(fromIsoDate(month))}`}>
      {open && <MonthBudgetForm onDone={onClose} category={category} month={month} current={current} />}
    </BottomSheet>
  )
}

function MonthBudgetForm({ onDone, category, month, current }: { onDone: () => void; category: Category; month: string; current: MonthLine }) {
  const set = useSetMonthlyBudget()
  const [amount, setAmount] = useState(current ? toInputValue(current.budget_ore) : '')
  const ore = parseKr(amount)
  const label = formatMonthYear(fromIsoDate(month))
  return (
    <>
      <p className="mb-4 text-[15px] text-secondary">
        Gælder kun {label}. Standardbudgettet ({formatAmount(current?.default_ore ?? 0, { decimals: 'never' })} kr.) ændres ikke.
      </p>
      <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Budget i kroner" />
      <SheetError error={set.error} />
      <div className="mt-5 space-y-2">
        <Button
          block
          disabled={ore === null || ore < 0}
          loading={set.isPending && set.variables?.amountOre !== null}
          onClick={() => set.mutate({ categoryId: category.id, month, amountOre: ore }, { onSuccess: onDone })}
        >
          Gem for {formatMonth(fromIsoDate(month))}
        </Button>
        {current?.budget_source === 'override' && (
          <Button
            block
            variant="secondary"
            loading={set.isPending && set.variables?.amountOre === null}
            onClick={() => set.mutate({ categoryId: category.id, month, amountOre: null }, { onSuccess: onDone })}
          >
            Brug standardbudget igen
          </Button>
        )}
      </div>
    </>
  )
}

function DefaultBudgetSheet({ open, onClose, category, currentOre }: { open: boolean; onClose: () => void; category: Category; currentOre: number }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Ændr standardbudget">
      {open && <DefaultBudgetForm onDone={onClose} category={category} currentOre={currentOre} />}
    </BottomSheet>
  )
}

function DefaultBudgetForm({ onDone, category, currentOre }: { onDone: () => void; category: Category; currentOre: number }) {
  const set = useSetCategoryDefault()
  const minMonth = monthKey(new Date())
  const [amount, setAmount] = useState(toInputValue(currentOre))
  const [from, setFrom] = useState(minMonth)
  const ore = parseKr(amount)
  return (
    <>
      <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Standardbudget i kroner" />
      <p className="mb-1.5 mt-5 px-1 text-[13px] font-semibold text-secondary">Gælder fra</p>
      <MonthStepper month={from} onChange={setFrom} min={minMonth} />
      <p className="mt-3 px-1 text-[13px] text-secondary">
        Måneder før {formatMonthYear(fromIsoDate(from))} beholder deres budget. Måneder med et tilpasset budget påvirkes ikke.
      </p>
      <SheetError error={set.error} />
      <Button
        block
        className="mt-5"
        disabled={ore === null || ore < 0}
        loading={set.isPending}
        onClick={() => set.mutate({ categoryId: category.id, validFrom: from, amountOre: ore! }, { onSuccess: onDone })}
      >
        Gem standardbudget
      </Button>
    </>
  )
}

function EditCategorySheet({ open, onClose, category }: { open: boolean; onClose: () => void; category: Category }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Redigér kategori">
      {open && <EditCategoryForm onDone={onClose} category={category} />}
    </BottomSheet>
  )
}

function EditCategoryForm({ onDone, category }: { onDone: () => void; category: Category }) {
  const update = useUpdateCategory()
  const [value, setValue] = useState({ name: category.name, icon: category.icon, color: category.color })
  const nameError = value.name.trim() ? null : 'Giv kategorien et navn'
  return (
    <>
      <CategoryEditor value={value} onChange={setValue} nameError={nameError} />
      <SheetError error={update.error} />
      <Button
        block
        className="mt-5"
        disabled={Boolean(nameError)}
        loading={update.isPending}
        onClick={() => update.mutate({ id: category.id, name: value.name.trim(), icon: value.icon, color: value.color }, { onSuccess: onDone })}
      >
        Gem
      </Button>
    </>
  )
}

function ArchiveSheet({ open, onClose, category }: { open: boolean; onClose: () => void; category: Category }) {
  const archived = Boolean(category.archived_at)
  return (
    <BottomSheet open={open} onClose={onClose} title={archived ? 'Gendan kategori?' : 'Arkivér kategori?'}>
      {open && <ArchiveForm onDone={onClose} category={category} />}
    </BottomSheet>
  )
}

function ArchiveForm({ onDone, category }: { onDone: () => void; category: Category }) {
  const update = useUpdateCategory()
  const archived = Boolean(category.archived_at)
  return (
    <>
      <p className="text-[15px] text-secondary">
        {archived
          ? 'Kategorien bliver aktiv igen og kan bruges til nye udgifter.'
          : 'Kategorien skjules og kan ikke bruges til nye udgifter. Alle tidligere udgifter og budgetter bevares i historikken.'}
      </p>
      <SheetError error={update.error} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onDone}>
          Annullér
        </Button>
        <Button
          variant={archived ? 'primary' : 'danger'}
          loading={update.isPending}
          onClick={() => update.mutate({ id: category.id, archived_at: archived ? null : new Date().toISOString() }, { onSuccess: onDone })}
        >
          {archived ? 'Gendan' : 'Arkivér'}
        </Button>
      </div>
    </>
  )
}
