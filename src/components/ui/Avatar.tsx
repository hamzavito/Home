import { cn } from '@/lib/cn'

const fallbackColors = ['#2f7d6d', '#b3612f', '#5b5fc7', '#c2417a']

export function Avatar({ name, color, index = 0, className }: { name: string; color?: string | null; index?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white', className)}
      style={{ backgroundColor: color ?? fallbackColors[index % fallbackColors.length] }}
    >
      {initials || '?'}
    </span>
  )
}
