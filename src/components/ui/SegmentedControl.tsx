import { cn } from '@/lib/cn'

type Option<T extends string> = { value: T; label: string }

export function SegmentedControl<T extends string>({ options, value, onChange, label }: { options: Option<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-surface-secondary p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'h-10 flex-1 truncate rounded-full px-3 text-[14px] font-semibold transition-all duration-200',
            value === o.value ? 'bg-surface-elevated text-primary shadow-raised' : 'text-secondary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
