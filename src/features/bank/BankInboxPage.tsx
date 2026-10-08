import { ArrowLeftRight, ChevronDown, Landmark, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, TextInput } from '@/components/ui/Field'
import { ListGroup } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useCategories, useTransaction } from '@/features/finance/api'
import { CategoryPicker } from '@/features/finance/CategoryPicker'
import { formatLongDate, formatShortDate, fromIsoDate } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { bankErrorMessage, useBankConnections, useBankInbox, useImportBankTransaction, useLinkBankTransaction, useSetIgnored, useSyncBank, type BankTransaction } from './api'

/** Posteringer fra banken, der venter på at blive godkendt som udgift eller indtægt. Kun egne. */
export function BankInboxPage() {
  const inbox = useBankInbox()
  const connections = useBankConnections()
  const sync = useSyncBank()
  const [open, setOpen] = useState<BankTransaction | null>(null)
  const [showOther, setShowOther] = useState(false)

  const rows = inbox.data ?? []
  const fresh = rows.filter((r) => r.state === 'new')
  const other = rows.filter((r) => r.state !== 'new')
  const hasConnection = (connections.data ?? []).length > 0

  return (
    <>
      <PageHeader
        title="Fra banken"
        back="/okonomi"
        action={
          hasConnection ? (
            <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()} aria-label="Hent nye posteringer">
              <RefreshCw className="size-4" /> Hent
            </Button>
          ) : undefined
        }
      />
      {sync.isError && <p role="alert" className="mb-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{bankErrorMessage(sync.error)}</p>}
      {sync.isSuccess && <p role="status" className="mb-3 px-1 text-[14px] text-secondary">{sync.data.imported ? `${sync.data.imported} nye posteringer hentet.` : 'Ingen nye posteringer.'}</p>}

      {inbox.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !hasConnection && rows.length === 0 ? (
        <EmptyState icon={Landmark} title="Ingen bank forbundet" text="Forbind din bank, så kommer dine udgifter og indtægter automatisk hertil.">
          <Link to="/indstillinger/bank" className="pressable inline-flex h-11 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent">
            Forbind bank
          </Link>
        </EmptyState>
      ) : fresh.length === 0 ? (
        <EmptyState icon={Landmark} title="Alt er gennemgået" text="Nye posteringer dukker op her, når banken har bogført dem." />
      ) : (
        <>
          <p className="mb-2 px-1 text-[13px] font-semibold text-secondary">
            {fresh.length} {fresh.length === 1 ? 'ny postering' : 'nye posteringer'} · kun du kan se dem
          </p>
          <ListGroup>
            {fresh.map((r) => (
              <BankRow key={r.id} row={r} onOpen={() => setOpen(r)} />
            ))}
          </ListGroup>
        </>
      )}

      {other.length > 0 && (
        <>
          <button type="button" onClick={() => setShowOther((v) => !v)} aria-expanded={showOther} className="mt-6 flex w-full items-center gap-2 px-1 text-left text-[14px] font-semibold text-secondary">
            <ArrowLeftRight className="size-4" />
            <span className="flex-1">Frasorteret: overførsler mellem egne konti og ignorerede ({other.length})</span>
            <ChevronDown className={cn('size-4 transition-transform', showOther && 'rotate-180')} />
          </button>
          {showOther && (
            <ListGroup className="mt-2">
              {other.map((r) => (
                <BankRow key={r.id} row={r} onOpen={() => setOpen(r)} />
              ))}
            </ListGroup>
          )}
        </>
      )}

      <BottomSheet open={open !== null} onClose={() => setOpen(null)} title={open && open.amount_ore > 0 ? 'Indtægt fra banken' : 'Udgift fra banken'}>
        {open && <ReviewSheet key={open.id} row={open} onDone={() => setOpen(null)} />}
      </BottomSheet>
    </>
  )
}

function BankRow({ row, onOpen }: { row: BankTransaction; onOpen: () => void }) {
  const label = row.counterparty || row.description
  return (
    <button type="button" onClick={onOpen} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-surface-secondary">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] font-medium">{label}</span>
        <span className="truncate text-[13px] text-secondary">
          {formatShortDate(fromIsoDate(row.booked_on))}
          {row.state === 'transfer' ? ' · Overførsel mellem egne konti' : row.state === 'ignored' ? ' · Ignoreret' : row.possible_duplicate_id ? ' · Måske allerede registreret' : row.amount_ore > 0 ? ' · Indtægt' : ''}
        </span>
      </span>
      <Money ore={Math.abs(row.amount_ore)} size="md" sign={row.amount_ore > 0 ? 'income' : 'expense'} className={row.amount_ore > 0 ? 'text-positive' : undefined} decimals="always" />
    </button>
  )
}

function ReviewSheet({ row, onDone }: { row: BankTransaction; onDone: () => void }) {
  const categories = useCategories()
  const imp = useImportBankTransaction()
  const link = useLinkBankTransaction()
  const ignore = useSetIgnored()
  const dup = useTransaction(row.possible_duplicate_id ?? undefined)
  const income = row.amount_ore > 0
  const [categoryId, setCategoryId] = useState<string | null>(row.suggested_category_id)
  const [description, setDescription] = useState((row.counterparty || row.description).slice(0, 80))
  const choices = (categories.data ?? []).filter((c) => !c.archived_at)
  const error = imp.error ?? link.error ?? ignore.error
  const busy = imp.isPending || link.isPending || ignore.isPending

  return (
    <>
      <div className="rounded-2xl bg-surface-secondary p-4">
        <Money ore={Math.abs(row.amount_ore)} size="lg" sign={income ? 'income' : 'expense'} decimals="always" className={income ? 'text-positive' : undefined} />
        <p className="mt-1 text-[14px] text-secondary">{formatLongDate(fromIsoDate(row.booked_on))}</p>
        <p className="mt-1 break-words text-[14px]">{row.description}</p>
      </div>

      {row.state === 'new' && dup.data && (
        <div className="mt-4 rounded-2xl bg-notice-soft p-4">
          <p className="text-[14px] font-semibold text-notice">Måske allerede registreret</p>
          <p className="mt-0.5 text-[14px]">
            {dup.data.description} · {formatShortDate(fromIsoDate(dup.data.occurred_on))} · <Money ore={dup.data.amount_ore} size="sm" decimals="always" />
          </p>
          <Button size="sm" variant="secondary" className="mt-2" loading={link.isPending} disabled={busy} onClick={() => link.mutate({ id: row.id, transactionId: dup.data!.id }, { onSuccess: onDone })}>
            Det er den samme
          </Button>
        </div>
      )}

      {row.state !== 'new' ? (
        <>
          <p className="mt-4 text-[14px] text-secondary">
            {row.state === 'transfer' ? 'Frasorteret som overførsel mellem jeres egne konti. Den tæller ikke med i budgettet.' : 'Du har valgt at ignorere denne postering.'}
          </p>
          <Button block className="mt-4" loading={ignore.isPending} onClick={() => ignore.mutate({ id: row.id, ignored: false }, { onSuccess: onDone })}>
            Tag med alligevel
          </Button>
        </>
      ) : (
        <>
          <div className="mt-4">
            <Field label={income ? 'Beskrivelse' : 'Butik / beskrivelse'}>
              <TextInput value={description} maxLength={80} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          {!income && (
            <div className="mt-4">
              <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Kategori{row.suggested_category_id ? ' (foreslået ud fra tidligere køb)' : ''}</p>
              <CategoryPicker categories={choices} value={categoryId} onChange={setCategoryId} />
            </div>
          )}
          {error && <p role="alert" className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{bankErrorMessage(error)}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" disabled={busy} loading={ignore.isPending} onClick={() => ignore.mutate({ id: row.id, ignored: true }, { onSuccess: onDone })}>
              Ignorér
            </Button>
            <Button
              disabled={busy || (!income && !categoryId) || !description.trim()}
              loading={imp.isPending}
              onClick={() => imp.mutate({ id: row.id, categoryId: income ? null : categoryId, description }, { onSuccess: onDone })}
            >
              {income ? 'Gem indtægt' : 'Gem udgift'}
            </Button>
          </div>
        </>
      )}
    </>
  )
}
