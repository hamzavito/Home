import { AmountInput } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { BudgetMode } from '@/types/database'

export type RuleValue = { mode: BudgetMode; amount: string; percent: string }

/** Standardbudget som fast beløb eller procent af "til fordeling". */
export function BudgetRuleInput({ value, onChange, distributableLabel }: { value: RuleValue; onChange: (v: RuleValue) => void; distributableLabel?: string }) {
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Budgettype"
        options={[
          { value: 'amount', label: 'Fast beløb' },
          { value: 'percent', label: 'Procent' },
        ]}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode: mode as BudgetMode })}
      />
      {value.mode === 'amount' ? (
        <AmountInput value={value.amount} onChange={(e) => onChange({ ...value, amount: e.target.value })} aria-label="Beløb pr. måned i kroner" />
      ) : (
        <>
          <label className="flex cursor-text items-baseline justify-center gap-2 rounded-card bg-surface-primary px-4 py-6 shadow-card ring-1 ring-subtle focus-within:ring-2 focus-within:ring-accent">
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={value.percent}
              size={Math.max(1, value.percent.length || 1)}
              onChange={(e) => onChange({ ...value, percent: e.target.value })}
              aria-label="Procent af til fordeling"
              className="tabular min-w-[1.2ch] bg-transparent text-center text-[44px] font-bold tracking-[-0.04em] text-primary outline-none placeholder:text-muted [field-sizing:content]"
            />
            <span className="text-[24px] font-semibold text-secondary">%</span>
          </label>
          <p className="px-1 text-[13px] text-secondary">
            Procent af beløbet til fordeling efter faste udgifter og faste budgetbeløb{distributableLabel ? ` (${distributableLabel})` : ''}.
          </p>
        </>
      )}
    </div>
  )
}
