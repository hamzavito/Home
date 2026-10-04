import { CalendarClock, ExternalLink, ImageOff, Infinity as InfinityIcon, Maximize2, Receipt as ReceiptIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CategoryIcon } from '@/components/finance/CategoryIcon'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, FullScreenLoader } from '@/components/ui/Spinner'
import { useCategories } from '@/features/finance/api'
import { paidByLabel } from '@/features/finance/paidBy'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatLongDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { deleteDateFor, retentionOptions, retentionSentence, toDkIsoDate, type Retention } from '@/lib/retention'
import { receiptErrorMessage, useReceipt, useSetRetention, useSignedUrls, type ReceiptWithTransaction } from './api'
import { ImageViewer } from './ImageViewer'
import { RetentionPicker } from './RetentionPicker'

export function ReceiptDetailPage() {
  const { id } = useParams()
  const receipt = useReceipt(id)
  if (receipt.isPending) return <FullScreenLoader />
  if (!receipt.data || receipt.data.status !== 'approved')
    return (
      <>
        <PageHeader title="Kvittering" back="/kvitteringer" />
        <EmptyState icon={ReceiptIcon} title="Kvitteringen findes ikke" />
      </>
    )
  return <ReceiptDetail receipt={receipt.data} />
}

function ReceiptDetail({ receipt }: { receipt: ReceiptWithTransaction }) {
  const navigate = useNavigate()
  const { members } = useHousehold()
  const categories = useCategories()
  const urls = useSignedUrls(receipt.storage_path ? [receipt.storage_path] : [])
  const [viewer, setViewer] = useState(false)
  const [editRetention, setEditRetention] = useState(false)

  const t = receipt.transaction
  const c = t ? categories.data?.find((x) => x.id === t.category_id) : undefined
  const url = receipt.storage_path ? urls.data?.get(receipt.storage_path) : undefined
  const deleteIso = receipt.delete_at ? toDkIsoDate(receipt.delete_at) : null
  const retentionLabel = retentionOptions.find((o) => o.value === receipt.retention)?.label

  const rows: Array<[string, React.ReactNode]> = t
    ? [
        ['Købsdato', formatLongDate(fromIsoDate(t.occurred_on))],
        [
          'Kategori',
          <span key="c" className="inline-flex items-center gap-2">
            {c && <CategoryIcon icon={c.icon} color={c.color} size="sm" className="size-6 rounded-[8px] [&_svg]:size-3.5" />}
            {c?.name ?? '—'}
          </span>,
        ],
        ['Betalt af', paidByLabel(t.paid_by_kind, t.paid_by_user_id, members)],
        ['Registreret af', paidByLabel('member', receipt.uploaded_by, members)],
        ['Godkendt', receipt.approved_at ? formatLongDate(new Date(receipt.approved_at)) : '—'],
      ]
    : []

  return (
    <>
      <PageHeader title={t?.description ?? 'Kvittering'} eyebrow="Kvittering" back="/kvitteringer" />

      {/* Billede eller besked om at det er slettet */}
      {receipt.image_deleted_at ? (
        <Card variant="tonal" className="flex items-center gap-3 p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-3">
            <ImageOff className="size-5 text-text-secondary" />
          </span>
          <p className="text-[14px] text-text-secondary">
            Kvitteringsbilledet blev automatisk slettet {formatLongDate(new Date(receipt.image_deleted_at))}. Udgiften og oplysningerne er bevaret.
          </p>
        </Card>
      ) : (
        <button type="button" onClick={() => url && setViewer(true)} aria-label="Se kvitteringen i fuld størrelse" className="pressable relative block h-[260px] w-full overflow-hidden rounded-card bg-surface-2 shadow-card">
          {url ? <img src={url} alt="Kvittering" className="size-full object-cover object-top" /> : <Skeleton className="size-full rounded-none" />}
          <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur">
            <Maximize2 className="size-3.5" /> Se hele
          </span>
        </button>
      )}

      {/* Beløb */}
      {t && (
        <Card className="mt-3 p-5">
          <p className="text-[13px] font-medium text-text-secondary">Beløb</p>
          <Money ore={t.amount_ore} size="xl" />
          <dl className="mt-4 divide-y divide-separator">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                <dt className="text-text-secondary">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <Button variant="surface" block className="mt-4" onClick={() => navigate(`/okonomi/udgift/${t.id}`)}>
            <ExternalLink className="size-4" /> Åbn udgiften
          </Button>
          <p className="mt-2 px-1 text-center text-[12px] text-text-tertiary">Beløb, butik, dato og kategori redigeres på udgiften – så de altid er ens.</p>
        </Card>
      )}

      {/* Opbevaring */}
      <Card variant="tonal" className="mt-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-surface-1">
            {receipt.delete_at ? <CalendarClock className="size-5 text-text-secondary" /> : <InfinityIcon className="size-5 text-text-secondary" />}
          </span>
          <div>
            <p className="text-[13px] font-medium text-text-secondary">Opbevaring{retentionLabel ? ` · ${retentionLabel}` : ''}</p>
            <p className="text-[15px] font-semibold">
              {receipt.image_deleted_at ? 'Billedet er slettet' : retentionSentence(deleteIso)}
            </p>
          </div>
        </div>
        {!receipt.image_deleted_at && (
          <Button variant="surface" block className="mt-4" onClick={() => setEditRetention(true)}>
            Ændr opbevaring
          </Button>
        )}
      </Card>

      <BottomSheet open={editRetention} onClose={() => setEditRetention(false)} title="Opbevaring">
        {editRetention && <RetentionForm receipt={receipt} onDone={() => setEditRetention(false)} />}
      </BottomSheet>
      {viewer && url && <ImageViewer src={url} onClose={() => setViewer(false)} />}
    </>
  )
}

function RetentionForm({ receipt, onDone }: { receipt: ReceiptWithTransaction; onDone: () => void }) {
  const set = useSetRetention()
  const [retention, setRetention] = useState<Retention>(receipt.retention ?? '30d')
  const [customDate, setCustomDate] = useState<string | null>(receipt.retention === 'custom' && receipt.delete_at ? toDkIsoDate(receipt.delete_at) : null)
  // Perioder regnes fra godkendelsesdatoen
  const base = receipt.approved_at ? toDkIsoDate(receipt.approved_at) : toIsoDate(new Date())
  const deleteIso = deleteDateFor(retention, base, customDate)
  const today = toIsoDate(new Date())
  const passed = deleteIso !== null && deleteIso <= today
  const valid = retention !== 'custom' || Boolean(customDate && customDate > today)

  return (
    <>
      <RetentionPicker
        value={retention}
        customDate={customDate}
        onChange={(r, d) => {
          setRetention(r)
          setCustomDate(d)
        }}
        deleteIso={deleteIso}
      />
      {passed && <p className="mt-3 rounded-2xl bg-notice-soft px-4 py-3 text-[14px] font-medium text-notice">Perioden er allerede udløbet – billedet slettes ved næste oprydning i nat.</p>}
      {set.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{receiptErrorMessage(set.error)}</p>}
      <Button block className="mt-5" disabled={!valid} loading={set.isPending} onClick={() => set.mutate({ receiptId: receipt.id, retention, customDate }, { onSuccess: onDone })}>
        Gem
      </Button>
    </>
  )
}
