import { Lock, Users } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { TransactionVisibility } from '@/types/database'

const options = [
  { value: 'private' as const, label: 'Kun mig' },
  { value: 'shared' as const, label: 'Fælles' },
]

/** Hvem kan se udgiften: kun ejeren (privat) eller hele husstanden (fælles) */
export function VisibilityPicker({ value, onChange }: { value: TransactionVisibility; onChange: (v: TransactionVisibility) => void }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvem kan se udgiften</p>
      <SegmentedControl label="Hvem kan se udgiften" options={options} value={value} onChange={onChange} />
      <p className="mt-1.5 flex items-start gap-1.5 px-1 text-[13px] text-secondary">
        {value === 'private' ? <Lock className="mt-0.5 size-3.5 shrink-0" /> : <Users className="mt-0.5 size-3.5 shrink-0" />}
        {value === 'private'
          ? 'Kun du kan se den. Den tæller ikke i jeres fælles budgetter.'
          : 'Hele husstanden kan se den, og den tæller i jeres fælles budgetter.'}
      </p>
    </div>
  )
}

/** Lille "Privat"-mærke i lister */
export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-secondary">
      <Lock className="size-3" aria-hidden /> Privat
    </span>
  )
}
