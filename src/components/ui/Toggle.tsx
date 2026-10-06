import { cn } from '@/lib/cn'

/** iOS-agtig kontakt i en liste-række */
export function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-left disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-[16px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-secondary">{hint}</span>}
      </span>
      <span className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', checked ? 'bg-positive' : 'bg-surface-tertiary')}>
        <span className={cn('absolute top-[2px] size-[27px] rounded-full bg-white shadow-raised transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
      </span>
    </button>
  )
}
