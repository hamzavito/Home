import { createElement } from 'react'
import { categoryIcon } from '@/lib/categories'
import { cn } from '@/lib/cn'

/** Rund ikon-boble i kategoriens farve (tonet baggrund). */
export function CategoryIcon({ icon, color, size = 'md', className }: { icon: string | null; color: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const c = color ?? 'var(--accent)'
  const box = { sm: 'size-8 rounded-[11px]', md: 'size-11 rounded-[15px]', lg: 'size-14 rounded-[19px]' }[size]
  const ic = { sm: 'size-4', md: 'size-5', lg: 'size-6' }[size]
  return (
    <span className={cn('flex shrink-0 items-center justify-center', box, className)} style={{ backgroundColor: `color-mix(in srgb, ${c} 15%, transparent)` }}>
      {createElement(categoryIcon(icon), { className: ic, style: { color: c }, strokeWidth: 2.2 })}
    </span>
  )
}
