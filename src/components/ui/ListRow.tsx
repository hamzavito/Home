import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

type Props = {
  icon?: LucideIcon
  iconColor?: string
  title: string
  subtitle?: string
  trailing?: ReactNode
  to?: string
  onClick?: () => void
}

/** iOS-agtig listerække. Bruges inde i en <ListGroup>. */
export function ListRow({ icon: Icon, iconColor = 'var(--accent)', title, subtitle, trailing, to, onClick }: Props) {
  const content = (
    <>
      {Icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px]" style={{ backgroundColor: iconColor }}>
          <Icon className="size-[18px] text-white" strokeWidth={2.2} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[17px]">{title}</span>
        {subtitle && <span className="truncate text-[13px] text-text-secondary">{subtitle}</span>}
      </span>
      {trailing}
      {(to || onClick) && <ChevronRight className="size-5 shrink-0 text-text-tertiary" />}
    </>
  )
  const cls = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left active:bg-fill'
  if (to)
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    )
  return <div className={cls}>{content}</div>
}

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('divide-y divide-separator overflow-hidden rounded-card bg-surface-strong shadow-card', className)}>
      {children}
    </div>
  )
}
