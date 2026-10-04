import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { AmountInput, Field } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { errorMessage, useCreateCategory } from '@/features/finance/api'
import { formatMonthYear } from '@/lib/dates'
import { defaultCategoryColor, defaultCategoryIcon } from '@/lib/categories'
import { parseKr } from '@/lib/money'
import { CategoryEditor } from './CategoryEditor'

export function CategoryNewPage() {
  const navigate = useNavigate()
  const create = useCreateCategory()
  const [value, setValue] = useState({ name: '', icon: defaultCategoryIcon, color: defaultCategoryColor as string })
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)

  const amountOre = amount.trim() === '' ? 0 : parseKr(amount)
  const nameError = value.name.trim() ? null : 'Giv kategorien et navn'
  const amountError = amountOre === null || amountOre < 0 ? 'Ugyldigt beløb' : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (nameError || amountError) return
    try {
      const id = await create.mutateAsync({ ...value, defaultOre: amountOre })
      navigate(`/okonomi/budgetter/${id}`, { replace: true })
    } catch {
      // vises nedenfor
    }
  }

  return (
    <>
      <PageHeader title="Ny kategori" back />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Field label="Standardbudget pr. måned" hint={`Gælder fra ${formatMonthYear(new Date())}. Kan ændres senere.`} error={touched ? amountError : null}>
          <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Standardbudget i kroner" />
        </Field>
        <CategoryEditor value={value} onChange={setValue} nameError={touched ? nameError : null} />
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
