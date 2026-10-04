import { ImageOff, Receipt as ReceiptIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Lille miniature. Uden billede (slettet) vises et diskret ikon. */
export function ReceiptThumb({ url, deleted, className }: { url?: string; deleted: boolean; className?: string }) {
  return (
    <span className={cn('relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-surface-2', className)}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : deleted ? (
        <ImageOff className="size-5 text-text-tertiary" />
      ) : (
        <ReceiptIcon className="size-5 text-text-tertiary" />
      )}
    </span>
  )
}
