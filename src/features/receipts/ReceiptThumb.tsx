import { ImageOff, Receipt as ReceiptIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Lille miniature. Uden billede (slettet) vises et diskret ikon. */
export function ReceiptThumb({ url, deleted, className }: { url?: string; deleted: boolean; className?: string }) {
  return (
    <span className={cn('relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-surface-secondary', className)}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover object-top" />
      ) : deleted ? (
        <ImageOff className="size-5 text-muted" />
      ) : (
        <ReceiptIcon className="size-5 text-muted" />
      )}
    </span>
  )
}
