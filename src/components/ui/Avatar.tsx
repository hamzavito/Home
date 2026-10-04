import { Users } from 'lucide-react'
import { cn } from '@/lib/cn'

const fallbackColors = ['#5a3cf0', '#1aa59a', '#d65a9c', '#3b8fd9']

export function Avatar({ name, color, index = 0, shared, className }: { name: string; color?: string | null; index?: number; shared?: boolean; className?: string }) {
  if (shared)
    return (
      <span aria-hidden className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-text-secondary', className)}>
        <Users className="size-[45%]" strokeWidth={2.4} />
      </span>
    )
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white', className)}
      style={{ backgroundColor: color ?? fallbackColors[index % fallbackColors.length] }}
    >
      {initials || '?'}
    </span>
  )
}
