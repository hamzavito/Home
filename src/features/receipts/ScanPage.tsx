import { AlertTriangle, Camera, Check, ChevronLeft, ImageIcon, Loader2, Maximize2, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AmountInput, Field, TextInput } from '@/components/ui/Field'
import { Money } from '@/components/ui/Money'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Toggle } from '@/components/ui/Toggle'
import { useCategories, useSaveTransaction } from '@/features/finance/api'
import { CategoryPicker } from '@/features/finance/CategoryPicker'
import { decodePaidBy, defaultPaidBy, paidByOptions } from '@/features/finance/paidBy'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { formatLongDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { compressReceiptImage } from '@/lib/image'
import { formatKr, parseKr, toInputValue } from '@/lib/money'
import { parseReceiptText, type Confidence, type ParsedReceipt } from '@/lib/receipt-parser'
import { deleteDateFor, type Retention } from '@/lib/retention'
import {
  createPendingReceipt,
  discardPendingReceipt,
  receiptErrorMessage,
  suggestCategory,
  uploadReceiptImage,
  useApproveReceipt,
} from './api'
import { ImageViewer } from './ImageViewer'
import { recognizeReceipt } from './ocr'
import { RetentionPicker } from './RetentionPicker'

type Phase = 'pick' | 'working' | 'review' | 'details' | 'done'
type Status = 'idle' | 'running' | 'done' | 'error'

type Pending = { receiptId: string; path: string; upload: Promise<void> }

export function ScanPage() {
  const navigate = useNavigate()
  const { me, members, defaultRetention: householdRetention } = useHousehold()
  const categories = useCategories()
  const approve = useApproveReceipt()
  const saveTransaction = useSaveTransaction()

  const [phase, setPhase] = useState<Phase>('pick')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [compressStatus, setCompressStatus] = useState<Status>('idle')
  const [uploadStatus, setUploadStatus] = useState<Status>('idle')
  const [ocrStatus, setOcrStatus] = useState<Status>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [viewer, setViewer] = useState(false)

  // Formular
  const [merchant, setMerchant] = useState('')
  const [merchantHint, setMerchantHint] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [amountChoices, setAmountChoices] = useState<number[]>([])
  const [date, setDate] = useState(toIsoDate(new Date()))
  const [confidence, setConfidence] = useState<{ merchant?: Confidence; amount?: Confidence; date?: Confidence }>({})
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [suggestedFrom, setSuggestedFrom] = useState<string | null>(null)
  const [paidBy, setPaidBy] = useState(defaultPaidBy(me))
  const [retention, setRetention] = useState<Retention>(householdRetention)
  const [customDate, setCustomDate] = useState<string | null>(null)
  // Fra: kun udgiften gemmes, billedet slettes med det samme
  const [keepImage, setKeepImage] = useState(true)
  const [result, setResult] = useState<{ amountOre: number; merchant: string; category: string; imageKept: boolean } | null>(null)

  const pending = useRef<Pending | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const approved = useRef(false)
  // Spærre mod dobbelttryk (serveren er desuden idempotent)
  const approving = useRef(false)

  // Ryd op hvis brugeren forlader flowet uden at godkende (fx tilbage-knap).
  // Vi venter på at uploaden er færdig, så filen ikke lander EFTER sletningen.
  const discard = useCallback(async () => {
    const p = pending.current
    pending.current = null
    if (!p || approved.current) return
    await p.upload.catch(() => {})
    await discardPendingReceipt(p.receiptId, p.path).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      void discard()
    }
  }, [discard])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const activeCategories = (categories.data ?? []).filter((c) => !c.archived_at)

  async function startUpload(blob: Blob) {
    setUploadStatus('running')
    const created = await createPendingReceipt()
    const upload = uploadReceiptImage(created.path, blob)
    pending.current = { ...created, upload }
    await upload
    setUploadStatus('done')
  }

  async function retryUpload() {
    const p = pending.current
    const blob = blobRef.current
    if (!blob) return
    setError(null)
    try {
      if (p) {
        setUploadStatus('running')
        const upload = uploadReceiptImage(p.path, blob)
        pending.current = { ...p, upload }
        await upload
        setUploadStatus('done')
      } else {
        await startUpload(blob)
      }
    } catch (e) {
      setUploadStatus('error')
      setError(receiptErrorMessage(e))
    }
  }

  function applyParsed(parsed: ParsedReceipt) {
    if (parsed.merchant) setMerchant(parsed.merchant.value)
    setMerchantHint(parsed.merchantHint)
    if (parsed.total) setAmount(toInputValue(parsed.total.ore))
    setAmountChoices(parsed.total ? [parsed.total.ore, ...parsed.alternatives] : parsed.alternatives)
    if (parsed.date) setDate(parsed.date.value)
    setConfidence({ merchant: parsed.merchant?.confidence, amount: parsed.total?.confidence, date: parsed.date?.confidence })
    if (parsed.merchant) {
      void suggestCategory(parsed.merchant.value).then((id) => {
        if (id && activeCategories.some((c) => c.id === id)) {
          setCategoryId((cur) => cur ?? id)
          setSuggestedFrom(parsed.merchant!.value)
        }
      })
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setPhase('working')
    setCompressStatus('running')

    let blob: Blob
    try {
      const compressed = await compressReceiptImage(file)
      blob = compressed.blob
      blobRef.current = blob
      setPreview(URL.createObjectURL(blob))
      setCompressStatus('done')
    } catch (err) {
      setCompressStatus('error')
      setError(err instanceof Error ? err.message : 'Billedet kunne ikke læses.')
      setPhase('pick')
      return
    }

    // Upload og OCR kører samtidig. Uploaden skal være færdig før godkendelse.
    const uploadTask = startUpload(blob).catch((err) => {
      setUploadStatus('error')
      setError(receiptErrorMessage(err))
    })

    setOcrStatus('running')
    try {
      const text = await recognizeReceipt(blob, setOcrProgress)
      applyParsed(parseReceiptText(text))
      setOcrStatus('done')
    } catch {
      // OCR er kun en hjælp – flowet fortsætter med tomme felter
      setOcrStatus('error')
    }
    setPhase('review')
    await uploadTask
  }

  async function cancelFlow() {
    setConfirmCancel(false)
    await discard()
    navigate(-1)
  }

  const amountOre = parseKr(amount)
  const reviewErrors = {
    merchant: merchant.trim() ? null : 'Skriv butikkens navn',
    amount: amountOre && amountOre > 0 ? null : 'Skriv beløbet',
    date: date ? null : 'Vælg dato',
  }
  const reviewValid = !reviewErrors.merchant && !reviewErrors.amount && !reviewErrors.date
  const deleteIso = deleteDateFor(retention, toIsoDate(new Date()), customDate)
  const detailsValid = Boolean(categoryId) && (!keepImage || retention !== 'custom' || Boolean(customDate && customDate > toIsoDate(new Date())))
  const saving = approve.isPending || saveTransaction.isPending

  async function onApprove() {
    const p = pending.current
    if (!categoryId || !amountOre || approving.current) return
    if (!keepImage) return onSaveWithoutImage()
    if (!p) return
    approving.current = true
    setError(null)
    try {
      await p.upload
      await approve.mutateAsync({
        receiptId: p.receiptId,
        categoryId,
        amountOre,
        occurredOn: date,
        description: merchant,
        note: null,
        paidBy: decodePaidBy(paidBy),
        retention,
        customDate,
      })
      approved.current = true
      const cat = activeCategories.find((c) => c.id === categoryId)
      setResult({ amountOre, merchant: merchant.trim(), category: cat?.name ?? '', imageKept: true })
      setPhase('done')
    } catch (e) {
      setError(receiptErrorMessage(e))
    } finally {
      approving.current = false
    }
  }

  /** Kun udgiften gemmes – billedet (og den midlertidige kvittering) slettes med det samme */
  async function onSaveWithoutImage() {
    if (!categoryId || !amountOre) return
    approving.current = true
    setError(null)
    try {
      await saveTransaction.mutateAsync({
        input: { categoryId, amountOre, occurredOn: date, description: merchant, note: null, paidBy: decodePaidBy(paidBy) },
      })
      // Udgiften er gemt: fjern billedet. Fejler det, rydder den daglige oprydning op.
      await discard()
      const cat = activeCategories.find((c) => c.id === categoryId)
      setResult({ amountOre, merchant: merchant.trim(), category: cat?.name ?? '', imageKept: false })
      setPhase('done')
    } catch (e) {
      setError(receiptErrorMessage(e))
    } finally {
      approving.current = false
    }
  }

  // ------------------------------------------------------------------ UI
  const header = (title: string, onBack?: () => void) => (
    <header className="flex items-center justify-between pb-3 pt-3">
      {onBack ? (
        <button type="button" aria-label="Tilbage" onClick={onBack} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card">
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </button>
      ) : (
        <span className="size-10" />
      )}
      <h1 className="text-[17px] font-bold">{title}</h1>
      {phase !== 'done' ? (
        <button
          type="button"
          aria-label="Annullér scanning"
          onClick={() => (pending.current ? setConfirmCancel(true) : navigate(-1))}
          className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card"
        >
          <X className="size-5" strokeWidth={2.5} />
        </button>
      ) : (
        <span className="size-10" />
      )}
    </header>
  )

  const stepDots = (n: number) => (
    <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
      {[1, 2].map((i) => (
        <span key={i} className={cn('h-1.5 rounded-full transition-all duration-300', i === n ? 'w-6 bg-accent' : 'w-1.5 bg-surface-tertiary')} />
      ))}
    </div>
  )

  return (
    <>
      {phase === 'pick' && (
        <>
          {header('Scan kvittering')}
          <div className="mt-6 text-center">
            <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[22px] bg-surface-accent">
              <Camera className="size-8 text-accent-text" />
            </span>
            <h2 className="text-[26px] font-bold tracking-tight">Tag et billede af kvitteringen</h2>
            <p className="mx-auto mt-2 max-w-xs text-[15px] text-secondary">
              Læg den fladt i godt lys. Appen foreslår butik, dato og beløb – du godkender altid selv.
            </p>
          </div>
          {error && <ErrorBox className="mt-5">{error}</ErrorBox>}
          <div className="mt-8 space-y-3">
            <label className="pressable flex h-[76px] cursor-pointer items-center gap-4 rounded-[22px] bg-accent px-5 text-on-accent shadow-[0_12px_28px_-10px_var(--accent)]">
              <Camera className="size-6" />
              <span className="text-[17px] font-bold">Tag billede</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} />
            </label>
            <label className="pressable flex h-[76px] cursor-pointer items-center gap-4 rounded-[22px] bg-surface-primary px-5 shadow-card">
              <ImageIcon className="size-6 text-secondary" />
              <span className="text-[17px] font-semibold">Vælg fra billeder</span>
              <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
            </label>
          </div>
        </>
      )}

      {phase === 'working' && (
        <>
          {header('Læser kvittering')}
          <div className="mt-2 flex flex-col items-center">
            <div className="relative h-[300px] w-[220px] overflow-hidden rounded-[22px] bg-surface-secondary shadow-raised">
              {preview && <img src={preview} alt="Kvittering" className="size-full object-cover object-top" />}
              {ocrStatus === 'running' && (
                <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--accent)_35%,transparent)] to-transparent [animation:scan_1.6s_ease-in-out_infinite_alternate]" />
              )}
            </div>
            <ul className="mt-7 w-full max-w-xs space-y-3">
              <StepRow status={compressStatus} label="Gør billedet klar" />
              <StepRow status={uploadStatus} label="Gemmer sikkert" />
              <StepRow status={ocrStatus} label={ocrStatus === 'running' && ocrProgress > 0 ? `Læser tekst · ${Math.round(ocrProgress * 100)} %` : 'Læser tekst'} />
            </ul>
            <p className="mt-6 text-center text-[13px] text-muted">Teksten læses på din telefon. Første gang tager det lidt længere.</p>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          {header('Kontrollér')}
          {stepDots(1)}
          <div className="flex gap-4">
            {preview && (
              <button type="button" onClick={() => setViewer(true)} aria-label="Se kvitteringen i fuld størrelse" className="pressable relative h-[132px] w-[100px] shrink-0 overflow-hidden rounded-[18px] bg-surface-secondary shadow-card">
                <img src={preview} alt="" className="size-full object-cover object-top" />
                <span className="absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/50 text-white">
                  <Maximize2 className="size-3.5" />
                </span>
              </button>
            )}
            <div className="min-w-0 flex-1 self-center">
              <p className="text-[13px] font-medium text-secondary">{ocrStatus === 'error' ? 'Kunne ikke læse teksten' : 'Det fandt vi'}</p>
              <p className="truncate text-[20px] font-bold">{merchant || '—'}</p>
              {amountOre ? <Money ore={amountOre} size="lg" /> : <p className="text-[15px] text-muted">Intet beløb fundet</p>}
              <UploadBadge status={uploadStatus} onRetry={retryUpload} />
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <AmountInput
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setConfidence((c) => ({ ...c, amount: 'high' }))
                }}
                aria-label="Beløb i kroner"
              />
              <FieldNote confidence={confidence.amount} missing={!amount} what="beløbet" />
              {amountChoices.length > 1 && (
                <div className="mt-2.5">
                  <p className="mb-1.5 px-1 text-[13px] text-secondary">Beløb på kvitteringen – tryk for at vælge</p>
                  <div role="radiogroup" aria-label="Beløb på kvitteringen" className="flex flex-wrap gap-2">
                    {amountChoices.map((ore) => (
                      <button
                        key={ore}
                        type="button"
                        role="radio"
                        aria-checked={amountOre === ore}
                        onClick={() => {
                          setAmount(toInputValue(ore))
                          setConfidence((c) => ({ ...c, amount: 'high' }))
                        }}
                        className={cn(
                          'pressable tabular h-10 rounded-full px-4 text-[15px] font-semibold transition-colors',
                          amountOre === ore ? 'bg-accent text-on-accent' : 'bg-surface-primary text-primary shadow-card',
                        )}
                      >
                        {formatKr(ore, { decimals: 'always' })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Field label="Butik" error={null}>
              <TextInput
                value={merchant}
                maxLength={80}
                placeholder="Fx Bilka"
                onChange={(e) => {
                  setMerchant(e.target.value)
                  setConfidence((c) => ({ ...c, merchant: 'high' }))
                }}
              />
              {!merchant && merchantHint && (
                <button type="button" onClick={() => setMerchant(merchantHint)} className="pressable mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-accent px-3 py-1.5 text-[13px] font-semibold text-accent-text">
                  <Sparkles className="size-3.5" /> Forslag: {merchantHint}
                </button>
              )}
              <FieldNote confidence={confidence.merchant} missing={!merchant} what="butikken" />
            </Field>

            <Field label="Købsdato" hint={date ? formatLongDate(fromIsoDate(date)) : undefined}>
              <TextInput
                type="date"
                value={date}
                max={toIsoDate(new Date())}
                onChange={(e) => {
                  setDate(e.target.value)
                  setConfidence((c) => ({ ...c, date: 'high' }))
                }}
              />
              <FieldNote confidence={confidence.date} missing={false} what="datoen" />
            </Field>
          </div>

          {error && <ErrorBox className="mt-4">{error}</ErrorBox>}
          <StickyAction>
            <Button block disabled={!reviewValid} onClick={() => setPhase('details')}>
              Videre
            </Button>
          </StickyAction>
        </>
      )}

      {phase === 'details' && (
        <>
          {header('Placér', () => setPhase('review'))}
          {stepDots(2)}
          <Card variant="hero" className="mb-6 flex items-center justify-between p-5">
            <div className="min-w-0">
              <p className="truncate text-[15px] text-hero-text-secondary">{merchant}</p>
              <p className="text-[13px] text-hero-text-secondary">{formatLongDate(fromIsoDate(date))}</p>
            </div>
            <Money ore={amountOre ?? 0} size="xl" />
          </Card>

          <div className="space-y-6">
            <div>
              <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Budget</p>
              {activeCategories.length === 0 ? (
                <p className="rounded-2xl bg-surface-secondary p-4 text-[14px] text-secondary">Opret en budgetkategori først under Økonomi → Budgetter.</p>
              ) : (
                <CategoryPicker
                  categories={activeCategories}
                  value={categoryId}
                  onChange={(id) => {
                    setCategoryId(id)
                    setSuggestedFrom(null)
                  }}
                />
              )}
              {suggestedFrom && (
                <p className="mt-2 flex items-center gap-1.5 px-1 text-[13px] text-secondary">
                  <Sparkles className="size-3.5 text-accent-text" /> Foreslået ud fra jeres tidligere køb hos {suggestedFrom}
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Betalt af</p>
              <SegmentedControl label="Betalt af" options={paidByOptions(members)} value={paidBy} onChange={setPaidBy} />
            </div>

            <div>
              <div className="mb-3 overflow-hidden rounded-2xl bg-surface-primary shadow-card ring-1 ring-subtle">
                <Toggle
                  label="Gem kvitteringsbilledet"
                  hint={keepImage ? undefined : 'Kun udgiften gemmes. Billedet slettes med det samme.'}
                  checked={keepImage}
                  onChange={setKeepImage}
                />
              </div>
              {keepImage && (
                <RetentionPicker
                  value={retention}
                  customDate={customDate}
                  onChange={(r, d) => {
                    setRetention(r)
                    setCustomDate(d)
                  }}
                  deleteIso={deleteIso}
                />
              )}
            </div>
          </div>

          {error && <ErrorBox className="mt-4">{error}</ErrorBox>}
          <StickyAction>
            <Button block disabled={!detailsValid || !reviewValid || (keepImage && uploadStatus !== 'done')} loading={saving} onClick={onApprove}>
              {!keepImage ? 'Gem udgift uden billede' : uploadStatus === 'running' ? 'Gemmer billede …' : 'Godkend og gem'}
            </Button>
            {keepImage && uploadStatus === 'error' && (
              <Button block variant="ghost" className="mt-1" onClick={retryUpload}>
                Prøv upload igen
              </Button>
            )}
          </StickyAction>
        </>
      )}

      {phase === 'done' && result && (
        <>
          {header('Gemt')}
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-positive-soft [animation:pop_420ms_var(--ease-spring)_both]">
              <Check className="size-10 text-positive" strokeWidth={3} />
            </span>
            <h2 className="mt-5 text-[26px] font-bold tracking-tight">{result.imageKept ? 'Kvitteringen er gemt' : 'Udgiften er gemt'}</h2>
            <p className="mt-2 text-[15px] text-secondary">
              <Money ore={result.amountOre} size="sm" /> fra {result.merchant} er trukket fra {result.category}.
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {!result.imageKept ? 'Kvitteringsbilledet er ikke gemt.' : deleteIso ? `Billedet slettes automatisk ${formatLongDate(fromIsoDate(deleteIso))}.` : 'Billedet beholdes permanent.'}
            </p>
          </div>
          <div className="mt-10 space-y-3">
            <Button block onClick={() => navigate('/', { replace: true })}>
              Til forsiden
            </Button>
            <Button block variant="surface" onClick={() => navigate(result.imageKept ? '/kvitteringer' : '/okonomi/transaktioner', { replace: true })}>
              {result.imageKept ? 'Se kvitteringer' : 'Se udgifter'}
            </Button>
          </div>
        </>
      )}

      <BottomSheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Kassér kvittering?">
        <p className="text-[15px] text-secondary">Billedet slettes, og der registreres ingen udgift.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
            Fortsæt
          </Button>
          <Button variant="danger" onClick={cancelFlow}>
            Kassér
          </Button>
        </div>
      </BottomSheet>

      {viewer && preview && <ImageViewer src={preview} onClose={() => setViewer(false)} />}
    </>
  )
}

// ------------------------------------------------------------------ små dele

function StepRow({ status, label }: { status: Status; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full transition-colors',
          status === 'done' ? 'bg-positive-soft text-positive' : status === 'error' ? 'bg-notice-soft text-notice' : 'bg-surface-secondary text-muted',
        )}
      >
        {status === 'done' ? <Check className="size-4" strokeWidth={3} /> : status === 'running' ? <Loader2 className="size-4 animate-spin" /> : status === 'error' ? <AlertTriangle className="size-4" /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className={cn('text-[15px] font-medium', status === 'idle' && 'text-muted')}>{label}</span>
    </li>
  )
}

function UploadBadge({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status === 'done') return <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-positive"><Check className="size-3.5" strokeWidth={3} /> Billedet er gemt sikkert</p>
  if (status === 'running') return <p className="mt-1 flex items-center gap-1 text-[12px] text-secondary"><Loader2 className="size-3.5 animate-spin" /> Gemmer billedet …</p>
  if (status === 'error')
    return (
      <button type="button" onClick={onRetry} className="mt-1 text-[12px] font-semibold text-warning underline">
        Upload fejlede – prøv igen
      </button>
    )
  return null
}

/** "Kontrollér beløbet" når OCR er usikker */
function FieldNote({ confidence, missing, what }: { confidence?: Confidence; missing: boolean; what: string }) {
  if (missing) return <p className="mt-1.5 px-1 text-[13px] text-secondary">Kunne ikke aflæse {what} – udfyld selv.</p>
  if (!confidence || confidence === 'high') return null
  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-notice-soft px-2.5 py-1 text-[12px] font-semibold text-notice">
      <AlertTriangle className="size-3.5" /> Kontrollér {what}
    </p>
  )
}

function ErrorBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn('rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger', className)}>
      {children}
    </p>
  )
}

/** Primær handling fastgjort i bunden (scan-flowet vises uden bundmenu) */
function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-24" />
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent px-safe pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto max-w-lg">{children}</div>
      </div>
    </>
  )
}
