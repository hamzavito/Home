import { CategoryIcon } from '@/components/finance/CategoryIcon'
import { cn } from '@/lib/cn'
import type { Category } from './api'

/** Vælg kategori som et gitter af "chips" – hurtigt med tommelfingeren. */
export function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Kategori" className="grid grid-cols-3 gap-2">
      {categories.map((c) => {
        const active = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className={cn(
              'pressable flex flex-col items-center gap-1.5 rounded-[18px] px-1 py-3 text-center transition-colors',
              active ? 'bg-surface-primary shadow-raised ring-2 ring-accent' : 'bg-surface-primary shadow-card',
            )}
          >
            <CategoryIcon icon={c.icon} color={c.color} size="sm" />
            <span className="w-full truncate px-1 text-[13px] font-semibold">{c.name}</span>
          </button>
        )
      })}
    </div>
  )
}
