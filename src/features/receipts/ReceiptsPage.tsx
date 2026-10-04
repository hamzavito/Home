import { Camera, Receipt as ReceiptIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useCategories } from '@/features/finance/api'
import { cn } from '@/lib/cn'
import { formatMonthYear, formatShortDate, fromIsoDate } from '@/lib/dates'
import { retentionBadge } from '@/lib/retention'
import { useReceipts, useSignedUrls, type ReceiptWithTransaction } from './api'
import { ReceiptThumb } from './ReceiptThumb'

export function ReceiptsPage() {
  const navigate = useNavigate()
  const receipts = useReceipts()
  const categories = useCategories()
  const list = receipts.data ?? []
  const paths = list.map((r) => r.storage_path).filter((p): p is string => Boolean(p))
  const urls = useSignedUrls(paths)
  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]))

  // Gruppér efter købsmåned
  const groups: Array<{ key: string; items: ReceiptWithTransaction[] }> = []
  for (const r of list) {
    const key = (r.transaction?.occurred_on ?? r.created_at).slice(0, 7)
    const g = groups.find((x) => x.key === key)
    if (g) g.items.push(r)
    else groups.push({ key, items: [r] })
  }
  groups.sort((a, b) => b.key.localeCompare(a.key))
  for (const g of groups) g.items.sort((a, b) => (b.transaction?.occurred_on ?? '').localeCompare(a.transaction?.occurred_on ?? ''))

  return (
    <>
      <PageHeader title="Kvitteringer" back />

      <Card variant="hero" to="/kvitteringer/scan" className="flex items-center gap-4 p-5">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
          <Camera className="size-6 text-white" />
        </span>
        <div>
          <p className="text-[17px] font-bold">Scan kvittering</p>
          <p className="text-[14px] text-hero-text-secondary">Tag et billede – du godkender altid selv</p>
        </div>
      </Card>

      {receipts.isPending ? (
        <div className="mt-6 space-y-2">
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="Ingen kvitteringer endnu" text="Godkendte kvitteringer vises her med deres opbevaringstid.">
          <Button size="sm" onClick={() => navigate('/kvitteringer/scan')}>
            Scan den første
          </Button>
        </EmptyState>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 px-1 text-[13px] font-semibold text-text-secondary first-letter:uppercase">{formatMonthYear(fromIsoDate(`${g.key}-01`))}</h2>
              <Card padded={false} className="divide-y divide-separator">
                {g.items.map((r) => {
                  const t = r.transaction
                  const c = t ? catById.get(t.category_id) : undefined
                  const badge = retentionBadge({ deleteAt: r.delete_at, imageDeletedAt: r.image_deleted_at })
                  const soon = !r.image_deleted_at && r.delete_at && /i morgen|i nat|^[1-7] dage/.test(badge)
                  return (
                    <Link key={r.id} to={`/kvitteringer/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-surface-2">
                      <ReceiptThumb url={r.storage_path ? urls.data?.get(r.storage_path) : undefined} deleted={Boolean(r.image_deleted_at)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold">{t?.description ?? 'Kvittering'}</p>
                        <p className="flex items-center gap-1.5 truncate text-[13px] text-text-secondary">
                          {c && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />}
                          {c?.name ?? ''}
                          {t && <> · {formatShortDate(fromIsoDate(t.occurred_on))}</>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {t && <Money ore={t.amount_ore} size="md" />}
                        <p className={cn('text-[12px]', soon ? 'font-semibold text-notice' : 'text-text-tertiary')}>{badge}</p>
                      </div>
                    </Link>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
