import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { errorMessage, useCreateCategory } from '@/features/finance/api'
import { defaultCategoryColor, defaultCategoryIcon } from '@/lib/categories'
import { formatMonthYear } from '@/lib/dates'
import { parseKr } from '@/lib/money'
import { parsePercent } from '@/lib/percent'
import type { CategoryKind } from '@/types/database'
import { BudgetRuleInput, type RuleValue } from './BudgetRuleInput'
import { CategoryEditor } from './CategoryEditor'
import { KindPicker } from './KindPicker'

export function CategoryNewPage() {
  const navigate = useNavigate()
  const create = useCreateCategory()
  const [value, setValue] = useState({ name: '', icon: defaultCategoryIcon, color: defaultCategoryColor as string })
  const [kind, setKind] = useState<CategoryKind>('spending')
  const [rule, setRule] = useState<RuleValue>({ mode: 'amount', amount: '', percent: '' })
  const [touched, setTouched] = useState(false)

  const amountOre = rule.amount.trim() === '' ? 0 : parseKr(rule.amount)
  const bp = parsePercent(rule.percent)
  const nameError = value.name.trim() ? null : 'Giv kategorien et navn'
  const ruleError = rule.mode === 'amount' ? (amountOre === null || amountOre < 0 ? 'Ugyldigt beløb' : null) : bp === null ? 'Skriv en procent mellem 0 og 100' : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (nameError || ruleError) return
    try {
      const id = await create.mutateAsync({ ...value, kind, mode: rule.mode, defaultOre: amountOre, percentBp: bp })
      navigate(`/okonomi/budgetter/${id}`, { replace: true })
    } catch {
      // vises nedenfor
    }
  }

  return (
    <>
      <PageHeader title="Ny kategori" back />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Standardbudget pr. måned</p>
          <BudgetRuleInput value={rule} onChange={setRule} />
          <p className="mt-1.5 px-1 text-[13px] text-secondary">Gælder fra {formatMonthYear(new Date())}. Kan ændres senere.</p>
          {touched && ruleError && <p className="mt-1 px-1 text-[13px] text-danger">{ruleError}</p>}
        </div>
        <CategoryEditor value={value} onChange={setValue} nameError={touched ? nameError : null} />
        <KindPicker value={kind} onChange={setKind} />
        {create.isError && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
            {errorMessage(create.error)}
          </p>
        )}
        <Button type="submit" block loading={create.isPending}>
          Opret kategori
        </Button>
      </form>
    </>
  )
}
