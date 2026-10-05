import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-2xl bg-surface-primary px-4 text-[16px] text-primary shadow-card outline-none ring-1 ring-subtle transition-shadow placeholder:text-muted focus:ring-2 focus:ring-accent'

type FieldProps = { label: string; hint?: ReactNode; error?: string | null; hideLabel?: boolean; children: ReactNode }

/** Label + kontrol + hjælpetekst/fejl */
export function Field({ label, hint, error, hideLabel, children }: FieldProps) {
  return (
    <label className="block">
      <span className={cn('mb-1.5 block px-1 text-[13px] font-semibold text-secondary', hideLabel && 'sr-only')}>{label}</span>
      {children}
      {error ? <span className="mt-1 block px-1 text-[13px] text-danger">{error}</span> : hint ? <span className="mt-1 block px-1 text-[13px] text-muted">{hint}</span> : null}
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
    // <label> så et tryk hvor som helst i kortet sætter fokus i feltet
    <label className="flex cursor-text items-baseline justify-center gap-2 rounded-card bg-surface-primary px-4 py-6 shadow-card ring-1 ring-subtle focus-within:ring-2 focus-within:ring-accent">
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        // Feltet er lige så bredt som beløbet, så "kr." står lige efter tallet
        size={Math.max(1, String(props.value ?? '').length || 1)}
        className={cn('tabular min-w-[1.2ch] max-w-full bg-transparent text-center text-[44px] font-bold tracking-[-0.04em] text-primary outline-none placeholder:text-muted [field-sizing:content]', className)}
        {...props}
      />
      <span className="shrink-0 text-[20px] font-semibold text-secondary">kr.</span>
    </label>
  )
})
