import { cn } from '@/lib/cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Indlæser"
      className={cn('inline-block size-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70', className)}
    />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-xl bg-surface-2 [animation:shimmer_1.4s_ease-in-out_infinite]', className)} />
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-text-secondary">
      <Spinner className="size-8" />
    </div>
  )
}
