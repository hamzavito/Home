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
  tone?: 'default' | 'danger'
}

/** Listerække til menuer og indstillinger. Bruges inde i <ListGroup>. */
export function ListRow({ icon: Icon, iconColor = 'var(--accent)', title, subtitle, trailing, to, onClick, tone = 'default' }: Props) {
  const content = (
    <>
      {Icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px]" style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 16%, transparent)` }}>
          <Icon className="size-5" style={{ color: iconColor }} strokeWidth={2.2} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-[16px] font-medium', tone === 'danger' && 'text-danger')}>{title}</span>
        {subtitle && <span className="truncate text-[13px] text-secondary">{subtitle}</span>}
      </span>
      {trailing}
      {(to || onClick) && tone !== 'danger' && <ChevronRight className="size-5 shrink-0 text-muted" />}
    </>
  )
  const cls = 'flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-surface-secondary'
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
  return <div className={cn('divide-y divide-subtle overflow-hidden rounded-card bg-surface-primary shadow-card', className)}>{children}</div>
}
