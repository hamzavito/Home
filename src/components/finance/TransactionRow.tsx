import { Link } from 'react-router'
import { Money } from '@/components/ui/Money'
import { CategoryIcon } from './CategoryIcon'

type Props = {
  title: string
  subtitle: string
  amountOre: number
  icon: string | null
  color: string | null
  meta?: string
  to?: string
}

/** Kompakt transaktionsrække – ikke en tabel. */
export function TransactionRow({ title, subtitle, amountOre, icon, color, meta, to }: Props) {
  const content = (
    <>
      <CategoryIcon icon={icon} color={color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold">{title}</p>
        <p className="truncate text-[13px] text-secondary">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <Money ore={amountOre} sign="expense" size="md" />
        {meta && <p className="text-[12px] text-muted">{meta}</p>}
      </div>
    </>
  )
  const cls = 'flex items-center gap-3 px-4 py-3 transition-colors active:bg-surface-secondary'
  return to ? (
    <Link to={to} className={cls}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  )
}
