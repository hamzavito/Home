import { CalendarClock, Infinity as InfinityIcon } from 'lucide-react'
import { TextInput } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { toIsoDate } from '@/lib/dates'
import { retentionOptions, retentionSentence, type Retention } from '@/lib/retention'

type Props = {
  value: Retention
  customDate: string | null
  onChange: (r: Retention, customDate: string | null) => void
  /** Beregnet sletningsdato (YYYY-MM-DD) eller null ved permanent */
  deleteIso: string | null
}

/** Vælg opbevaringstid som chips + konkret dato. */
export function RetentionPicker({ value, customDate, onChange, deleteIso }: Props) {
  const tomorrow = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toIsoDate(d)
  })()
  return (
    <div>
      <div role="radiogroup" aria-label="Opbevaringstid" className="grid grid-cols-3 gap-2">
        {retentionOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value, o.value === 'custom' ? (customDate ?? null) : null)}
            className={cn(
              'pressable h-12 rounded-2xl px-2 text-[14px] font-semibold transition-colors',
              value === o.value ? 'bg-surface-inverse text-on-inverse' : 'bg-surface-primary text-primary shadow-card',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <TextInput type="date" className="mt-2" min={tomorrow} value={customDate ?? ''} onChange={(e) => onChange('custom', e.target.value || null)} aria-label="Sletningsdato" />
      )}
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-secondary px-4 py-3 text-[14px] font-medium">
        {deleteIso || value !== 'permanent' ? <CalendarClock className="size-4 shrink-0 text-secondary" /> : <InfinityIcon className="size-4 shrink-0 text-secondary" />}
        {value === 'custom' && !customDate ? 'Vælg en dato efter i dag.' : retentionSentence(deleteIso)}
      </p>
      <p className="mt-1.5 px-1 text-[12px] text-muted">Kun billedet slettes. Udgiften og oplysningerne bevares.</p>
    </div>
  )
}
