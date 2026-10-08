import { ArrowLeftRight, ChevronDown, Landmark, RefreshCw, Repeat } from 'lucide-react'
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
import { useEnsureDefaultGroups, useFixedGroups, useFixedItems } from '@/features/fixed/api'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import type { Frequency } from '@/types/database'
import { formatLongDate, formatShortDate, fromIsoDate } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { bankErrorMessage, useBankConnections, useBankInbox, useIgnoreAll, useImportBankTransaction, useImportSuggested, useLinkBankTransaction, useMarkFixed, useSetIgnored, useSyncBank, type BankTransaction } from './api'

/** Posteringer fra banken, der venter på at blive godkendt som udgift eller indtægt. Kun egne. */
export function BankInboxPage() {
  const inbox = useBankInbox()
  const connections = useBankConnections()
  const sync = useSyncBank()
  const [open, setOpen] = useState<BankTransaction | null>(null)
  const [showOther, setShowOther] = useState(false)
  const [confirmAll, setConfirmAll] = useState<'ignore' | 'suggested' | null>(null)
  const ignoreAll = useIgnoreAll()
  const importSuggested = useImportSuggested()
  const categories = useCategories()

  const rows = inbox.data ?? []
  const fresh = rows.filter((r) => r.state === 'new')
  const other = rows.filter((r) => r.state !== 'new')
  const hasConnection = (connections.data ?? []).length > 0
  const activeCategories = new Set((categories.data ?? []).filter((c) => !c.archived_at).map((c) => c.id))
  const withSuggestion = fresh.filter((r) => r.amount_ore < 0 && r.suggested_category_id && activeCategories.has(r.suggested_category_id) && !r.possible_duplicate_id)

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
          <p className="mb-3 px-1 text-[13px] text-secondary">Indtægter kommer automatisk med under Økonomi → Indtægter.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {withSuggestion.length > 0 && (
              <Button size="sm" onClick={() => setConfirmAll('suggested')}>
                Godkend {withSuggestion.length} med forslag
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setConfirmAll('ignore')}>
              Ignorér alle
            </Button>
          </div>
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
            <span className="flex-1">Frasorteret: overførsler, faste udgifter og ignorerede ({other.length})</span>
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

      <BottomSheet open={confirmAll === 'ignore'} onClose={() => setConfirmAll(null)} title={`Ignorér ${fresh.length} posteringer?`}>
        <p className="text-[15px] text-secondary">
          Ingen af dem kommer med i budgettet. Du kan stadig tage enkelte med bagefter under "Frasorteret". Nye posteringer fra banken dukker op som normalt.
        </p>
        {ignoreAll.isError && <p role="alert" className="mt-3 text-[14px] text-danger">{bankErrorMessage(ignoreAll.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmAll(null)}>
            Annullér
          </Button>
          <Button loading={ignoreAll.isPending} onClick={() => ignoreAll.mutate(undefined, { onSuccess: () => setConfirmAll(null) })}>
            Ignorér alle
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmAll === 'suggested'} onClose={() => setConfirmAll(null)} title={`Godkend ${withSuggestion.length} udgifter?`}>
        <p className="text-[15px] text-secondary">
          De gemmes som udgifter i den foreslåede kategori (ud fra tidligere køb eller butikker, du har valgt før). Mulige dubletter og indtægter skal du stadig se på selv.
        </p>
        {importSuggested.isError && <p role="alert" className="mt-3 text-[14px] text-danger">{bankErrorMessage(importSuggested.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmAll(null)}>
            Annullér
          </Button>
          <Button loading={importSuggested.isPending} onClick={() => importSuggested.mutate(undefined, { onSuccess: () => setConfirmAll(null) })}>
            Godkend
          </Button>
        </div>
      </BottomSheet>

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
          {row.state === 'transfer' ? ' · Overførsel mellem egne konti' : row.state === 'fixed' ? ' · Fast udgift' : row.state === 'ignored' ? ' · Ignoreret' : row.possible_duplicate_id ? ' · Måske allerede registreret' : row.amount_ore > 0 ? ' · Indtægt' : ''}
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
  const [fixedMode, setFixedMode] = useState(false)
  const fixedItems = useFixedItems()
  const fixedName = row.fixed_item_id ? fixedItems.data?.find((i) => i.id === row.fixed_item_id)?.name : undefined

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

      {fixedMode ? (
        <FixedForm row={row} onDone={onDone} onCancel={() => setFixedMode(false)} />
      ) : row.state !== 'new' ? (
        <>
          <p className="mt-4 text-[14px] text-secondary">
            {row.state === 'transfer'
              ? 'Frasorteret som overførsel mellem jeres egne konti. Den tæller ikke med i budgettet.'
              : row.state === 'fixed'
                ? `Registreret som fast udgift${fixedName ? `: ${fixedName}` : ''}. Den står allerede i jeres faste poster og tæller ikke dobbelt.`
                : 'Du har valgt at ignorere denne postering.'}
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
              <p className="mt-2 px-1 text-[13px] text-secondary">
                Appen husker valget: andre og fremtidige køb hos {row.counterparty || 'samme butik'} kommer automatisk i samme kategori. Kan slås fra under Indstillinger → Bank.
              </p>
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
          {!income && (
            <Button variant="ghost" block className="mt-2" disabled={busy} onClick={() => setFixedMode(true)}>
              <Repeat className="size-4" /> Det er en fast udgift
            </Button>
          )}
        </>
      )}
    </>
  )
}

const frequencies: Array<{ value: Frequency; label: string }> = [
  { value: 'monthly', label: 'Hver måned' },
  { value: 'quarterly', label: 'Kvartal' },
  { value: 'yearly', label: 'Årligt' },
]

/** Gør en bankpostering til en fast udgift: ny fast post eller en eksisterende */
function FixedForm({ row, onDone, onCancel }: { row: BankTransaction; onDone: () => void; onCancel: () => void }) {
  const groups = useFixedGroups()
  const items = useFixedItems()
  const ensureGroups = useEnsureDefaultGroups()
  const mark = useMarkFixed()
  const activeGroups = (groups.data ?? []).filter((g) => !g.archived_at)
  const existing = (items.data ?? []).filter((i) => i.kind === 'expense' && !i.archived_at)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState((row.counterparty || row.description).slice(0, 60))
  const [groupId, setGroupId] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const gid = groupId ?? activeGroups.find((g) => g.name === 'Bolig')?.id ?? activeGroups[0]?.id ?? null
  const valid = mode === 'existing' ? Boolean(itemId) : Boolean(gid && name.trim())

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[14px] text-secondary">
        Den kommer i jeres faste poster og tæller ikke som en løbende udgift. Fremtidige betalinger til {row.counterparty || 'samme modtager'} genkendes automatisk.
      </p>
      {existing.length > 0 && (
        <SegmentedControl
          label="Fast udgift"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'new', label: 'Ny fast udgift' },
            { value: 'existing', label: 'Har den allerede' },
          ]}
        />
      )}
      {mode === 'new' ? (
        <>
          <Field label="Navn">
            <TextInput value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gruppe</p>
            {activeGroups.length === 0 ? (
              <Button size="sm" variant="secondary" loading={ensureGroups.isPending} onClick={() => ensureGroups.mutate()}>
                Opret standardgrupper
              </Button>
            ) : (
              <div role="radiogroup" aria-label="Gruppe" className="flex flex-wrap gap-2">
                {activeGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={gid === g.id}
                    onClick={() => setGroupId(g.id)}
                    className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold', gid === g.id ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Hvor ofte</p>
            <SegmentedControl label="Hvor ofte" value={frequency} onChange={setFrequency} options={frequencies} />
          </div>
        </>
      ) : (
        <div role="radiogroup" aria-label="Eksisterende fast udgift" className="max-h-[40dvh] space-y-2 overflow-y-auto">
          {existing.map((i) => (
            <button
              key={i.id}
              type="button"
              role="radio"
              aria-checked={itemId === i.id}
              onClick={() => setItemId(i.id)}
              className={cn('pressable flex w-full items-center rounded-2xl px-4 py-3 text-left text-[15px] font-medium', itemId === i.id ? 'bg-accent text-on-accent' : 'bg-surface-secondary')}
            >
              {i.name}
            </button>
          ))}
        </div>
      )}
      {mark.isError && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{bankErrorMessage(mark.error)}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Tilbage
        </Button>
        <Button
          disabled={!valid}
          loading={mark.isPending}
          onClick={() => mark.mutate({ id: row.id, itemId: mode === 'existing' ? itemId : null, name, groupId: gid, frequency }, { onSuccess: onDone })}
        >
          Gem som fast
        </Button>
      </div>
    </div>
  )
}
