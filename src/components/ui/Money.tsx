import { cn } from '@/lib/cn'
import { formatAmount } from '@/lib/money'

type Size = 'hero' | 'xl' | 'lg' | 'md' | 'sm'

const sizes: Record<Size, { num: string; unit: string }> = {
  hero: { num: 'text-[46px] leading-none font-bold tracking-[-0.04em]', unit: 'text-[20px] font-semibold' },
  xl: { num: 'text-[32px] leading-none font-bold tracking-[-0.035em]', unit: 'text-[16px] font-semibold' },
  lg: { num: 'text-[22px] leading-tight font-bold tracking-[-0.025em]', unit: 'text-[14px] font-semibold' },
  md: { num: 'text-[17px] font-semibold tracking-[-0.015em]', unit: 'text-[17px] font-semibold' },
  sm: { num: 'text-[14px] font-medium', unit: 'text-[14px] font-medium' },
}

type Props = {
  ore: number
  size?: Size
  /** Vis fortegn: "expense" = minus, "income" = plus */
  sign?: 'expense' | 'income'
  decimals?: 'auto' | 'always' | 'never'
  className?: string
}

/** Beløb med tabulære tal; "kr." gøres mindre ved store størrelser, så tallet dominerer. */
export function Money({ ore, size = 'md', sign, decimals, className }: Props) {
  const s = sizes[size]
  const prefix = sign === 'expense' ? '−' : sign === 'income' ? '+' : ore < 0 ? '−' : ''
  const big = size === 'hero' || size === 'xl' || size === 'lg'
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>
      <span className={s.num}>
        {prefix}
        {formatAmount(ore, { decimals })}
      </span>
      {/* "kr." arver tekstfarven (ingen gennemsigtighed – det sænker kontrasten på farvede beløb) */}
      <span className={cn(s.unit, big && 'ml-1')}>{big ? 'kr.' : ' kr.'}</span>
    </span>
  )
}
