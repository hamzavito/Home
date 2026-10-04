import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

type Variant = 'default' | 'tonal' | 'hero'

const variants: Record<Variant, string> = {
  default: 'bg-surface-1 shadow-card',
  tonal: 'bg-surface-2',
  hero: 'hero-surface shadow-raised',
}

type Props = HTMLAttributes<HTMLDivElement> & { variant?: Variant; to?: string; padded?: boolean }

/** Grundkortet. `hero` er det mørke hovedkort, `tonal` et roligt kort uden skygge. */
export function Card({ variant = 'default', to, padded = true, className, children, ...props }: Props) {
  const cls = cn('relative overflow-hidden rounded-card', variants[variant], padded && 'p-5', to && 'pressable block', className)
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    )
  return (
    <div className={cls} {...props}>
      {children}
    </div>
  )
}

/** Lille overskrift inde i et kort */
export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[13px] font-medium text-text-secondary', className)}>{children}</p>
}
