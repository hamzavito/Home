import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-accent-soft">
        <Icon className="size-7 text-accent" />
      </span>
      <p className="text-[17px] font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-[15px] text-text-secondary">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
