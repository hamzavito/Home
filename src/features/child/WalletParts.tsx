import { ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AmountInput, Field, TextInput } from '@/components/ui/Field'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { relativeDay } from '@/lib/dates'
import { formatAmount, parseKr } from '@/lib/money'
import { balanceEffect, goalPercent, walletKindLabels } from '@/lib/wallet'
import type { ChildGoal, WalletTransaction } from './api'

/** Én bevægelse: type, note, dato og beløb med fortegn. Fortrudte vises gennemstreget. */
export function WalletTxRow({ tx, goals, action }: { tx: WalletTransaction; goals: ChildGoal[]; action?: ReactNode }) {
  const effect = balanceEffect(tx)
  const goal = tx.goal_id ? goals.find((g) => g.id === tx.goal_id) : null
  const voided = tx.voided_at !== null
  const Icon = tx.kind === 'to_goal' || tx.kind === 'from_goal' ? PiggyBank : effect > 0 ? ArrowDownLeft : ArrowUpRight
  const title = tx.note ?? (goal ? `${walletKindLabels[tx.kind]} · ${goal.name}` : walletKindLabels[tx.kind])
  const sub = [tx.note ? walletKindLabels[tx.kind] : null, relativeDay(tx.occurred_on), voided ? 'Fortrudt' : null].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-[14px]', effect > 0 ? 'bg-positive-soft text-positive' : 'bg-surface-secondary text-secondary')}>
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[16px] font-semibold', voided && 'text-secondary line-through')}>{title}</span>
        <span className="block truncate text-[13px] text-secondary">{sub}</span>
      </span>
      <span className={cn('tabular shrink-0 text-[16px] font-semibold', voided ? 'text-muted line-through' : effect > 0 ? 'text-positive' : 'text-primary')}>
        {effect > 0 ? '+' : '−'}
        {formatAmount(Math.abs(effect))} kr.
      </span>
      {action}
    </div>
  )
}

/** Barnets opsparingsmål med grøn fremdrift */
export function ChildGoalCard({ goal, savedOre, onClick }: { goal: ChildGoal; savedOre: number; onClick?: () => void }) {
  const pct = goalPercent(savedOre, goal.target_ore)
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[16px] font-semibold">{goal.name}</p>
        <span className="tabular text-[14px] font-bold text-positive">{pct} %</span>
      </div>
      <p className="tabular mt-0.5 text-[14px] text-secondary">
        <span className="font-semibold text-primary">{formatAmount(savedOre)} kr.</span> af {formatAmount(goal.target_ore, { decimals: 'never' })} kr.
      </p>
      <ProgressBar value={savedOre} max={goal.target_ore} tone="positive" size="sm" className="mt-3" label={`${goal.name}: ${pct} % sparet`} />
    </>
  )
  if (!onClick) return <Card className="p-4">{body}</Card>
  return (
    <button type="button" onClick={onClick} className="pressable block w-full rounded-card bg-surface-primary p-4 text-left shadow-card">
      {body}
    </button>
  )
}

/** Beløb (+ valgfri note) i et ark. Fejl fra databasen vises under knappen. */
export function AmountForm({
  submitLabel,
  onSubmit,
  pending,
  error,
  maxOre,
  withNote = true,
  notePlaceholder,
  children,
}: {
  submitLabel: string
  onSubmit: (amountOre: number, note: string) => void
  pending: boolean
  error: string | null
  /** Højeste tilladte beløb (fx saldoen) */
  maxOre?: number
  withNote?: boolean
  notePlaceholder?: string
  children?: ReactNode
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const ore = parseKr(amount)
  const tooMuch = ore !== null && maxOre !== undefined && ore > maxOre
  const invalid = amount.trim() !== '' && (ore === null || ore <= 0)
  const valid = ore !== null && ore > 0 && ore <= 100_000_000 && !tooMuch

  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid) onSubmit(ore, note)
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {children}
      <Field label="Beløb" hideLabel error={invalid ? 'Skriv et beløb, fx 25 eller 12,50' : tooMuch ? `Du kan højst bruge ${formatAmount(maxOre!)} kr.` : null}>
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Beløb" autoFocus />
      </Field>
      {withNote && (
        <Field label="Note (valgfri)">
          <TextInput value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} />
        </Field>
      )}
      {error && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{error}</p>}
      <Button type="submit" block disabled={!valid} loading={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}

/** Navn og målbeløb til et nyt mål */
export function GoalForm({ onSubmit, pending, error }: { onSubmit: (name: string, targetOre: number) => void; pending: boolean; error: string | null }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const ore = parseKr(target)
  const valid = name.trim().length > 0 && name.trim().length <= 60 && ore !== null && ore >= 100 && ore <= 100_000_000
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(name, ore)
      }}
    >
      <Field label="Hvad sparer du op til?">
        <TextInput value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Fx cykel eller LEGO" autoFocus autoCapitalize="sentences" />
      </Field>
      <Field label="Mål" error={target.trim() !== '' && (ore === null || ore < 100) ? 'Skriv et beløb på mindst 1 kr.' : null}>
        <TextInput value={target} inputMode="decimal" onChange={(e) => setTarget(e.target.value)} placeholder="Fx 500" />
      </Field>
      {error && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{error}</p>}
      <Button type="submit" block disabled={!valid} loading={pending}>
        Opret mål
      </Button>
    </form>
  )
}
