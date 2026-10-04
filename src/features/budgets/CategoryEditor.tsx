import { createElement } from 'react'
import { Field, TextInput } from '@/components/ui/Field'
import { categoryColors, categoryIcons } from '@/lib/categories'
import { cn } from '@/lib/cn'

type Value = { name: string; icon: string; color: string }

/** Navn, ikon og farve for en kategori. */
export function CategoryEditor({ value, onChange, nameError }: { value: Value; onChange: (v: Value) => void; nameError?: string | null }) {
  return (
    <div className="space-y-5">
      <Field label="Navn" error={nameError}>
        <TextInput value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Fx Dagligvarer" maxLength={40} autoCapitalize="sentences" />
      </Field>

      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-text-secondary">Farve</p>
        <div role="radiogroup" aria-label="Farve" className="flex flex-wrap gap-2.5 px-1">
          {categoryColors.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value.color === c}
              aria-label={c}
              onClick={() => onChange({ ...value, color: c })}
              className={cn('pressable size-9 rounded-full ring-offset-2 ring-offset-[var(--bg)]', value.color === c && 'ring-2 ring-text')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-text-secondary">Ikon</p>
        <div role="radiogroup" aria-label="Ikon" className="grid grid-cols-6 gap-2">
          {Object.entries(categoryIcons).map(([key, icon]) => {
            const active = value.icon === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={key}
                onClick={() => onChange({ ...value, icon: key })}
                className={cn('pressable flex aspect-square items-center justify-center rounded-[14px] bg-surface-1 shadow-card', active && 'ring-2')}
                style={active ? { background: `color-mix(in srgb, ${value.color} 16%, var(--surface-1))`, ['--tw-ring-color' as string]: value.color } : undefined}
              >
                {createElement(icon, { className: 'size-5', style: { color: active ? value.color : 'var(--text-secondary)' }, strokeWidth: 2.2 })}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
