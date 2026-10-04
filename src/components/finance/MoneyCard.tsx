import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatAmount } from '@/lib/money'

type Props = {
  eyebrow: string
  budgetOre: number
  spentOre: number
  /** Hvor langt vi er i måneden (0–1). Vises som markør på baren. */
  pace?: number
  children?: ReactNode
  to?: string
}

/** Hovedkortet: stort "tilbage"-tal, brugt af budget og progress. */
export function MoneyCard({ eyebrow, budgetOre, spentOre, pace, children, to }: Props) {
  const remaining = budgetOre - spentOre
  const over = remaining < 0
  return (
    <Card variant="hero" to={to} className="rounded-card-lg p-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-hero-text-secondary">{eyebrow}</p>
      <div className="mt-5">
        <Money ore={Math.abs(remaining)} size="hero" decimals="never" className={over ? 'text-[#ff8a8a]' : undefined} />
        <p className="mt-1.5 text-[15px] text-hero-text-secondary">{over ? 'over budgettet' : 'tilbage i budgettet'}</p>
      </div>
      <ProgressBar value={spentOre} max={budgetOre} tone="hero" size="lg" pace={pace} className="mt-6" label="Brugt af budget" />
      <div className="mt-3 flex items-baseline justify-between text-[14px]">
        <span className="tabular">
          <span className="font-semibold text-hero-text">{formatAmount(spentOre, { decimals: 'never' })} kr.</span>
          <span className="text-hero-text-secondary"> brugt af {formatAmount(budgetOre, { decimals: 'never' })} kr.</span>
        </span>
        {budgetOre > 0 && <span className="tabular font-semibold text-hero-text">{Math.round((spentOre / budgetOre) * 100)} %</span>}
      </div>
      {children}
    </Card>
  )
}
