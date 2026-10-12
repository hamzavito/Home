import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AmountInput } from '@/components/ui/Field'
import { MonthSwitcher } from '@/components/ui/MonthSwitcher'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useMonthIncomeBySource } from '@/features/bank/api'
import { useMonthPlan } from '@/features/fixed/api'
import { cn } from '@/lib/cn'
import { formatMonth, formatMonthYear, fromIsoDate, monthKey } from '@/lib/dates'
import { formatAmount, parseKr, toInputValue } from '@/lib/money'
import { formatPercent } from '@/lib/percent'
import { errorMessage, useBudgetMonth, useSetMonthlyBudget, type BudgetLine } from './api'
import { useMonthParam } from './useMonthParam'

const kr = (ore: number) => `${formatAmount(Math.abs(ore), { decimals: 'always' })} kr.`

function Line({ label, sub, ore, sign, strong, muted, to, onClick, children }: { label: ReactNode; sub?: ReactNode; ore: number; sign?: '−' | '+'; strong?: boolean; muted?: boolean; to?: string; onClick?: () => void; children?: ReactNode }) {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate', strong ? 'text-[16px] font-bold' : muted ? 'text-[14px] text-secondary' : 'text-[15px] font-medium')}>{label}</span>
        {sub && <span className="block truncate text-[12.5px] text-secondary">{sub}</span>}
      </span>
      <span className={cn('tabular shrink-0 text-right', strong ? 'text-[18px] font-bold' : muted ? 'text-[14px] text-secondary' : 'text-[15px] font-semibold', strong && ore < 0 && 'text-danger')}>
        {sign === '−' && ore !== 0 ? '−' : ore < 0 ? '−' : ''}
        {kr(ore)}
      </span>
      {(to || onClick) && <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />}
      {children}
    </>
  )
  const cls = cn('flex w-full items-center gap-2 text-left', strong ? 'py-3.5' : muted ? 'py-1.5 pl-3' : 'py-3')
  if (to)
    return (
      <Link to={to} className={cn(cls, 'transition-opacity active:opacity-60')}>
        {content}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'transition-opacity active:opacity-60')}>
        {content}
      </button>
    )
  return <div className={cls}>{content}</div>
}

/**
 * Månedens plan: faktiske indtægter − faste udgifter = tilbage − faste budgetbeløb = til fordeling → procent.
 * Hver kategori viser, om beløbet er automatisk (standard) eller manuelt for netop denne måned.
 */
export function MonthPlanPage() {
  const [month, setMonth] = useMonthParam()
  const plan = useMonthPlan(month)
  const budget = useBudgetMonth(month)
  const income = useMonthIncomeBySource(month)
  const [edit, setEdit] = useState<BudgetLine | null>(null)
  const q = month === monthKey(new Date()) ? '' : `?m=${month.slice(0, 7)}`

  if (plan.isPending || budget.isPending || income.isPending)
    return (
      <>
        <MonthSwitcher month={month} onChange={setMonth} />
        <Skeleton className="mt-4 h-96 w-full rounded-card" />
      </>
    )
  if (plan.isError || budget.isError) return <p className="mt-4 text-[15px] text-danger">{errorMessage(plan.error ?? budget.error)}</p>

  const p = plan.data!
  const lines = (budget.data ?? []).filter((l) => !l.archived)
  const amountLines = lines.filter((l) => l.budget_mode === 'amount')
  const percentLines = lines.filter((l) => l.budget_mode === 'percent')
  const otherLines = lines.filter((l) => l.budget_mode === 'none' && l.budget_source === 'override')
  const sources = income.data ?? []
  const unconfirmed = sources.reduce((s, r) => s + r.unconfirmed_count, 0)
  const freeBp = Math.max(10000 - p.percent_total_bp, 0)

  const ruleSub = (l: BudgetLine) =>
    l.budget_source === 'override' ? (
      <span className="font-semibold text-notice">Manuel for {formatMonth(fromIsoDate(month))}: {kr(l.budget_ore)}</span>
    ) : l.budget_mode === 'percent' ? (
      `Automatisk: ${formatPercent(l.percent_bp ?? 0)}`
    ) : l.kind === 'reserve' ? (
      'Automatisk: fast beløb · reserve'
    ) : (
      'Automatisk: fast beløb'
    )

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />

      <div className="mt-4 rounded-card-lg bg-surface-inverse p-5 text-on-inverse shadow-raised">
        <p className="text-[14px] font-semibold opacity-80">Til fordeling i {formatMonthYear(fromIsoDate(month))}</p>
        <p className="tabular mt-1 text-[34px] font-bold leading-tight tracking-[-0.02em]">{kr(p.distributable_ore)}</p>
        <p className="tabular mt-1 text-[13.5px] opacity-80">
          {p.unallocated_ore === 0 ? 'Alt er fordelt' : p.unallocated_ore > 0 ? `${kr(p.unallocated_ore)} ufordelt` : `${kr(p.unallocated_ore)} overfordelt`}
        </p>
      </div>

      {unconfirmed > 0 && (
        <Link to={`/okonomi/indtaegter${q}`} className="mt-3 flex items-center gap-2 rounded-2xl bg-notice-soft px-4 py-3 text-[14px] font-medium text-notice">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{unconfirmed === 1 ? '1 indtægt' : `${unconfirmed} indtægter`} fra banken venter på, at du bekræfter kilden.</span>
          <ChevronRight className="size-4" />
        </Link>
      )}

      <Card className="mt-3 px-5 py-1">
        <div className="divide-y divide-subtle">
          <div>
            <Line label="Indtægter" ore={p.income_ore} to={`/okonomi/indtaegter${q}`} />
            {sources.length > 0 && (
              <div className="pb-2">
                {sources.map((s) => (
                  <Line key={s.source_id ?? 'none'} muted label={s.name} sub={s.status === 'expected' ? 'Forventet – ikke modtaget endnu' : s.unconfirmed_count > 0 ? 'Faktisk · forslag til kilde' : 'Faktisk'} ore={s.used_ore} />
                ))}
              </div>
            )}
          </div>
          <Line label="Faste udgifter" ore={p.fixed_expenses_ore} sign="−" to={`/okonomi/faste${q}`} />
          <Line label="Tilbage efter faste udgifter" ore={p.available_ore} strong />
          {amountLines.map((l) => (
            <Line key={l.category_id} label={l.name} sub={ruleSub(l)} ore={l.budget_ore} sign="−" onClick={() => setEdit(l)} />
          ))}
          {amountLines.length > 0 && <Line label="Til fordeling" ore={p.distributable_ore} strong />}
          {percentLines.map((l) => (
            <Line
              key={l.category_id}
              label={
                <>
                  {l.name} <span className="font-normal text-secondary">{formatPercent(l.percent_bp ?? 0)}</span>
                </>
              }
              sub={ruleSub(l)}
              ore={l.budget_ore}
              onClick={() => setEdit(l)}
            />
          ))}
          {otherLines.map((l) => (
            <Line key={l.category_id} label={l.name} sub={ruleSub(l)} ore={l.budget_ore} onClick={() => setEdit(l)} />
          ))}
          <Line
            label={p.unallocated_ore < 0 ? 'Overfordelt' : 'Ufordelt'}
            sub={freeBp > 0 && percentLines.length > 0 ? `${formatPercent(freeBp)} af til fordeling er ikke fordelt` : undefined}
            ore={p.unallocated_ore}
            strong
          />
        </div>
      </Card>

      {(p.percent_total_bp > 10000 || p.available_ore < 0) && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-notice-soft px-3.5 py-3 text-[13px] font-medium text-notice">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {p.available_ore < 0
            ? 'De faste udgifter er større end indtægterne. Procentkategorierne er sat til 0.'
            : `Procenterne summer til ${formatPercent(p.percent_total_bp)}. Ret dem under Budgetter, så de højst er 100 %.`}
        </p>
      )}

      <SectionHeader title="Sådan regnes det" />
      <Card variant="tonal" className="text-[14px] text-secondary">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Faktiske indtægter i måneden (forventet beløb, hvis en kilde ikke er kommet endnu)</li>
          <li>minus faste udgifter</li>
          <li>minus kategorier med fast beløb</li>
          <li>resten fordeles i procent – præcist i øre</li>
          <li>det, der ikke er fordelt, vises som ufordelt</li>
        </ol>
        <p className="mt-3">
          Standardfordelingen ændres under{' '}
          <Link to={`/okonomi/budgetter${q}`} className="font-semibold text-accent-text">
            Budgetter
          </Link>
          . Tidligere måneder ændrer sig ikke.
        </p>
      </Card>

      <BottomSheet open={edit !== null} onClose={() => setEdit(null)} title={edit ? `${edit.name} i ${formatMonth(fromIsoDate(month))}` : ''}>
        {edit && <OverrideForm key={edit.category_id} line={edit} month={month} onDone={() => setEdit(null)} />}
      </BottomSheet>
    </>
  )
}

/** Manuelt beløb for én måned – næste måned bruges standarden igen */
function OverrideForm({ line, month, onDone }: { line: BudgetLine; month: string; onDone: () => void }) {
  const set = useSetMonthlyBudget()
  const overridden = line.budget_source === 'override'
  const [value, setValue] = useState(toInputValue(line.budget_ore))
  const ore = parseKr(value)
  const standard = line.budget_mode === 'percent' ? `${formatPercent(line.percent_bp ?? 0)} af til fordeling` : line.budget_mode === 'amount' ? `fast beløb: ${kr(line.default_ore)}` : 'intet standardbeløb'
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ore !== null && ore >= 0) set.mutate({ categoryId: line.category_id, month, amountOre: ore }, { onSuccess: onDone })
      }}
    >
      <p className="text-[15px] text-secondary">
        Automatisk: <span className="font-semibold text-primary">{standard}</span>.
        {overridden ? ` Lige nu manuelt: ${kr(line.budget_ore)}.` : ''} Et manuelt beløb gælder kun {formatMonthYear(fromIsoDate(month))} – næste måned bruges standarden igen.
      </p>
      <AmountInput value={value} onChange={(e) => setValue(e.target.value)} aria-label="Beløb denne måned" />
      {set.isError && <p role="alert" className="text-[14px] text-danger">{errorMessage(set.error)}</p>}
      <Button type="submit" block disabled={ore === null || ore < 0} loading={set.isPending}>
        Gem for {formatMonth(fromIsoDate(month))}
      </Button>
      {overridden && (
        <Button type="button" variant="secondary" block loading={set.isPending} onClick={() => set.mutate({ categoryId: line.category_id, month, amountOre: null }, { onSuccess: onDone })}>
          Brug automatisk igen
        </Button>
      )}
    </form>
  )
}
