import { Camera, ImagePlus, Image as ImageIcon, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { receiptErrorMessage, useAttachReceiptImage, useRemoveReceiptImage, useRotateReceiptImage, type Receipt } from './api'

/**
 * Tilføj, udskift, drej eller fjern kvitteringsbilledet på en udgift.
 * `receipt` er udgiftens nuværende kvittering (kan mangle eller have et slettet billede).
 */
export function ReceiptImageActions({ transactionId, receipt }: { transactionId: string; receipt: Receipt | null | undefined }) {
  const attach = useAttachReceiptImage()
  const rotate = useRotateReceiptImage()
  const remove = useRemoveReceiptImage()
  const [picker, setPicker] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const hasImage = Boolean(receipt?.storage_path)
  const busy = attach.isPending || rotate.isPending || remove.isPending
  const error = attach.error ?? rotate.error ?? remove.error

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPicker(false)
    rotate.reset()
    remove.reset()
    attach.mutate({ transactionId, file, current: receipt })
  }

  return (
    <>
      {hasImage ? (
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} loading={attach.isPending} onClick={() => setPicker(true)}>
            <RefreshCw className="size-4" /> Udskift
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            loading={rotate.isPending}
            onClick={() => {
              attach.reset()
              remove.reset()
              rotate.mutate(receipt!)
            }}
          >
            <RotateCw className="size-4" /> Drej
          </Button>
          <Button type="button" size="sm" variant="danger" disabled={busy} loading={remove.isPending} onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-4" /> Fjern
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" block loading={attach.isPending} onClick={() => setPicker(true)}>
          <ImagePlus className="size-5" /> Tilføj kvittering
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
          {receiptErrorMessage(error)}
        </p>
      )}

      <BottomSheet open={picker} onClose={() => setPicker(false)} title={hasImage ? 'Udskift billede' : 'Tilføj kvittering'}>
        <div className="space-y-3">
          <label className="pressable flex h-16 cursor-pointer items-center gap-4 rounded-[20px] bg-accent px-5 text-on-accent">
            <Camera className="size-6" />
            <span className="text-[17px] font-bold">Tag billede</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} />
          </label>
          <label className="pressable flex h-16 cursor-pointer items-center gap-4 rounded-[20px] bg-surface-secondary px-5">
            <ImageIcon className="size-6 text-secondary" />
            <span className="text-[17px] font-semibold">Vælg fra billeder</span>
            <input type="file" accept="image/*" className="sr-only" onChange={onFile} aria-label="Vælg kvitteringsbillede" />
          </label>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Fjern billedet?">
        <p className="text-[15px] text-secondary">Kvitteringsbilledet slettes. Udgiften og beløbet bevares, og du kan altid tilføje et nyt billede.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={() => setConfirmRemove(false)}>
            Annullér
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setConfirmRemove(false)
              attach.reset()
              rotate.reset()
              remove.mutate(receipt!.id)
            }}
          >
            Fjern billede
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
