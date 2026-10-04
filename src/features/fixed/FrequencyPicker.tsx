import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { Frequency } from '@/types/database'

const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december']

export const selectCls =
  'h-13 w-full appearance-none rounded-2xl bg-surface-primary px-4 text-[16px] text-primary shadow-card outline-none ring-1 ring-subtle focus:ring-2 focus:ring-accent'

/** Frekvens + betalingsmåned for kvartalsvise/årlige poster */
export function FrequencyPicker({
  frequency,
  dueMonth,
  onChange,
}: {
  frequency: Frequency
  dueMonth: number | null
  onChange: (f: Frequency, due: number | null) => void
}) {
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Hvor ofte"
        options={[
          { value: 'monthly', label: 'Månedligt' },
          { value: 'quarterly', label: 'Kvartalsvis' },
          { value: 'yearly', label: 'Årligt' },
        ]}
        value={frequency}
        onChange={(f) => onChange(f as Frequency, f === 'monthly' ? null : (dueMonth ?? new Date().getMonth() + 1))}
      />
      {frequency !== 'monthly' && (
        <label className="block">
          <span className="mb-1.5 block px-1 text-[13px] font-semibold text-secondary">{frequency === 'yearly' ? 'Betales i' : 'Første betaling i'}</span>
          <select className={selectCls} value={dueMonth ?? 1} onChange={(e) => onChange(frequency, Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
          {frequency === 'quarterly' && <span className="mt-1 block px-1 text-[12px] text-secondary">Derefter hver 3. måned.</span>}
        </label>
      )}
    </div>
  )
}

export function monthName(n: number | null): string {
  return n ? MONTHS[n - 1]! : ''
}
