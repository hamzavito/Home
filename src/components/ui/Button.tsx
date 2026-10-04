import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'plain' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent active:opacity-80',
  secondary: 'bg-fill text-text active:bg-fill-strong',
  plain: 'bg-transparent text-accent active:opacity-60',
  danger: 'bg-fill text-danger active:bg-fill-strong',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean }

export function Button({ variant = 'primary', loading, block, className, children, disabled, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[17px] font-semibold transition disabled:opacity-50',
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
