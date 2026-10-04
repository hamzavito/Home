import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function EmptyState({ icon: Icon, title, text, children, compact }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-12')}>
      <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-soft">
        <Icon className="size-6 text-accent" strokeWidth={2.2} />
      </span>
      <p className="text-[17px] font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-[15px] text-text-secondary">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
