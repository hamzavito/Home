import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatAmount } from '@/lib/money'

/** Opsparingsmål med positiv (grøn) fremdrift. Tages i brug i fase 4. */
export function SavingsCard({ name, currentOre, targetOre, sub, to }: { name: string; currentOre: number; targetOre: number; sub?: string; to?: string }) {
  const pct = targetOre > 0 ? Math.min(100, Math.round((currentOre / targetOre) * 100)) : 0
  return (
    <Card to={to} className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <span className="tabular text-[13px] font-semibold text-positive">{pct} %</span>
      </div>
      <Money ore={currentOre} size="lg" decimals="never" className="mt-1 block" />
      <p className="tabular text-[13px] text-text-tertiary">
        af {formatAmount(targetOre, { decimals: 'never' })} kr.{sub ? ` · ${sub}` : ''}
      </p>
      <ProgressBar value={currentOre} max={targetOre} tone="positive" size="sm" className="mt-3" label={`${name}: ${pct} % sparet`} />
    </Card>
  )
}
