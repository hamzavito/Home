import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-2xl bg-surface-1 px-4 text-[16px] text-text shadow-card outline-none transition-shadow placeholder:text-text-tertiary focus:ring-2 focus:ring-accent'

type FieldProps = { label: string; hint?: ReactNode; error?: string | null; hideLabel?: boolean; children: ReactNode }

/** Label + kontrol + hjælpetekst/fejl */
export function Field({ label, hint, error, hideLabel, children }: FieldProps) {
  return (
    <label className="block">
      <span className={cn('mb-1.5 block px-1 text-[13px] font-semibold text-text-secondary', hideLabel && 'sr-only')}>{label}</span>
      {children}
      {error ? <span className="mt-1 block px-1 text-[13px] text-danger">{error}</span> : hint ? <span className="mt-1 block px-1 text-[13px] text-text-tertiary">{hint}</span> : null}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-13', className)} {...props} />
})

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-24 py-3', className)} {...props} />
}

/** Stort beløbsfelt: tallet er hovedpersonen. */
export const AmountInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function AmountInput({ className, ...props }, ref) {
  return (
    <div className="flex items-baseline justify-center gap-2 rounded-card bg-surface-1 px-4 py-6 shadow-card focus-within:ring-2 focus-within:ring-accent">
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className={cn('tabular w-full min-w-0 bg-transparent text-center text-[44px] font-bold tracking-[-0.04em] text-text outline-none placeholder:text-text-tertiary', className)}
        {...props}
      />
      <span className="shrink-0 text-[20px] font-semibold text-text-secondary">kr.</span>
    </div>
  )
})
