import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'surface' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-[0_8px_20px_-8px_var(--accent)]',
  secondary: 'bg-surface-secondary text-primary',
  /** Til knapper oven på tonede kort eller baggrunden */
  surface: 'bg-surface-primary text-primary shadow-card',
  ghost: 'bg-transparent text-accent-text',
  danger: 'bg-danger-soft text-danger',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean; size?: 'md' | 'sm' }

export function Button({ variant = 'primary', size = 'md', loading, block, className, children, disabled, ...props }: Props) {
  return (
    <button
      className={cn(
        // Deaktiveret: neutral flade + dæmpet tekst (læsbar, 4,5:1) i stedet for gennemsigtighed
        'pressable inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:bg-surface-tertiary disabled:text-muted disabled:shadow-none disabled:active:scale-100',
        size === 'md' ? 'h-13 px-6 text-[16px]' : 'h-9 px-4 text-[14px]',
        variants[variant],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="size-5" /> : children}
    </button>
  )
}
