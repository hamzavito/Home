import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { AmountInput, Field, TextArea, TextInput } from '@/components/ui/Field'
import { parseKr, toInputValue } from '@/lib/money'
import { savingsErrorMessage, useSaveGoal, type Goal } from './api'

/** Opret eller redigér et opsparingsmål. */
export function GoalForm({ goal, onDone }: { goal?: Goal; onDone: (id: string) => void }) {
  const save = useSaveGoal()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? toInputValue(goal.target_ore) : '')
  const [date, setDate] = useState(goal?.target_date ?? '')
  const [note, setNote] = useState(goal?.note ?? '')
  const [touched, setTouched] = useState(false)
  const ore = parseKr(target)
  const errors = { name: name.trim() ? null : 'Giv målet et navn', target: ore && ore > 0 ? null : 'Skriv målbeløbet' }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setTouched(true)
        if (errors.name || errors.target) return
        try {
          const id = await save.mutateAsync({ id: goal?.id, name: name.trim(), target_ore: ore!, target_date: date || null, note: note.trim() || null })
          onDone(id)
        } catch {
          // vises nedenfor
        }
      }}
    >
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Målbeløb</p>
        <AmountInput value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Målbeløb i kroner" autoFocus={!goal} />
        {touched && errors.target && <p className="mt-1 px-1 text-center text-[13px] text-danger">{errors.target}</p>}
      </div>
      <Field label="Navn" error={touched ? errors.name : null}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Fx Ferie, Nødbuffer, Umrah" autoCapitalize="sentences" />
      </Field>
      <Field label="Måldato (valgfri)">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (valgfri)">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} />
      </Field>
      {save.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{savingsErrorMessage(save.error)}</p>}
      <Button type="submit" block loading={save.isPending}>
        {goal ? 'Gem' : 'Opret mål'}
      </Button>
    </form>
  )
}
