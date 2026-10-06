import { Minus, Plus } from 'lucide-react'

/** − tal + (fx antal portioner) */
export function Stepper({ value, onChange, min = 1, max = 50, label, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; unit?: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-full bg-surface-secondary p-1">
      <button
        type="button"
        aria-label={`Færre ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="pressable flex size-9 items-center justify-center rounded-full bg-surface-primary shadow-card disabled:opacity-40"
      >
        <Minus className="size-4" strokeWidth={2.6} />
      </button>
      <output aria-live="polite" className="tabular min-w-[4.5rem] text-center text-[15px] font-semibold">
        {value}
        {unit ? ` ${unit}` : ''}
      </output>
      <button
        type="button"
        aria-label={`Flere ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="pressable flex size-9 items-center justify-center rounded-full bg-surface-primary shadow-card disabled:opacity-40"
      >
        <Plus className="size-4" strokeWidth={2.6} />
      </button>
    </div>
  )
}
