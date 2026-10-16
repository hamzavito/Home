import { PageHeader } from '@/components/ui/PageHeader'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { retentionOptions } from '@/lib/retention'
import type { DefaultRetention } from '@/types/database'
import { useUpdateRetentionDefault } from './api'

const retentionChoices = retentionOptions.filter((o) => o.value !== 'custom') as Array<{ value: DefaultRetention; label: string }>

/** Kvitteringer: hvor længe billeder gemmes (gælder hele husstanden) */
export function ReceiptSettingsPage() {
  const household = useHousehold()
  const retention = useUpdateRetentionDefault()
  const shown = retention.isPending && retention.variables ? retention.variables : household.defaultRetention

  return (
    <>
      <PageHeader title="Kvitteringer" back="/indstillinger" />
      <div className="mt-4 rounded-card bg-surface-primary p-5 shadow-card">
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gem kvitteringsbilleder i</p>
        <div role="radiogroup" aria-label="Gem kvitteringsbilleder i" className="flex flex-wrap gap-2">
          {retentionChoices.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={shown === o.value}
              onClick={() => o.value !== household.defaultRetention && retention.mutate(o.value)}
              className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', shown === o.value ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[13px] text-secondary">
          Gælder nye kvitteringer for hele husstanden. Eksisterende kvitteringer ændres ikke, og udgifterne bevares altid.
          {retention.isSuccess && <span className="font-semibold text-positive"> Gemt</span>}
        </p>
        {retention.isError && <p className="mt-1 px-1 text-[13px] text-danger">Det kunne ikke gemmes. Prøv igen.</p>}
      </div>
    </>
  )
}
