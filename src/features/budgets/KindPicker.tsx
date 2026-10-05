import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { CategoryKind } from '@/types/database'

/** Forbrug (almindeligt budget) eller reserve (fx buffer til uforudsete udgifter). */
export function KindPicker({ value, onChange }: { value: CategoryKind; onChange: (k: CategoryKind) => void }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Type</p>
      <SegmentedControl
        label="Type"
        options={[
          { value: 'spending', label: 'Forbrug' },
          { value: 'reserve', label: 'Reserve / buffer' },
        ]}
        value={value}
        onChange={(k) => onChange(k as CategoryKind)}
      />
      <p className="mt-1.5 px-1 text-[12px] text-secondary">
        {value === 'reserve'
          ? 'En reserve sættes til side først og tæller ikke med i "tilbage i budgettet". I kan stadig registrere udgifter på den.'
          : 'Almindeligt budget til forbrug, fx mad eller hygge.'}
      </p>
    </div>
  )
}
