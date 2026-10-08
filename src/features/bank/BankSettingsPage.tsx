import { Landmark, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { daysLeft } from '@/lib/billing'
import { formatLongDate } from '@/lib/dates'
import { bankErrorMessage, useBankConnections, useBanks, useConnectBank, useDisconnectBank, useSyncBank } from './api'

/** Forbind egne bankkonti (MitID hos banken) – kun læseadgang, højst 180 dage ad gangen. */
export function BankSettingsPage() {
  const connections = useBankConnections()
  const sync = useSyncBank()
  const disconnect = useDisconnectBank()
  const [picker, setPicker] = useState(false)
  const [remove, setRemove] = useState<string | null>(null)
  const list = connections.data ?? []

  return (
    <>
      <PageHeader title="Bank" back="/indstillinger" />
      <Card variant="tonal" className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-text" />
        <div className="text-[14px] text-secondary">
          <p className="font-semibold text-primary">Kun læseadgang til dine egne konti</p>
          <p className="mt-1">
            Du logger ind med MitID hos din bank. Hjem kan ikke flytte penge og gemmer kun dato, beløb og tekst – ingen saldo eller kontonumre. Nye posteringer lander i "Fra banken", som kun du kan se, og du godkender dem selv.
          </p>
        </div>
      </Card>

      <h2 className="mb-2 mt-6 px-1 text-[17px] font-bold">Dine forbindelser</h2>
      {connections.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : list.length === 0 ? (
        <p className="px-1 text-[15px] text-secondary">Ingen bank forbundet endnu.</p>
      ) : (
        <ListGroup>
          {list.map((c) => {
            const d = daysLeft(c.valid_until)
            const expired = c.status === 'expired' || d === 0
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-surface-accent">
                  <Landmark className="size-5 text-accent-text" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[16px] font-medium">{c.aspsp_name}</span>
                  <span className="truncate text-[13px] text-secondary">{c.accounts.join(', ') || 'Ingen konti'}</span>
                  <span className={expired || d <= 14 ? 'text-[13px] font-semibold text-danger' : 'text-[13px] text-secondary'}>
                    {expired ? 'Adgangen er udløbet – forbind igen' : d <= 14 ? `Godkend igen inden ${formatLongDate(new Date(c.valid_until!))}` : `Hentet ${c.last_synced_at ? formatLongDate(new Date(c.last_synced_at)) : 'endnu ikke'}`}
                  </span>
                  {c.last_error && !expired && <span className="text-[13px] text-danger">Sidste hentning mislykkedes</span>}
                </span>
                <button type="button" onClick={() => setRemove(c.id)} aria-label={`Fjern ${c.aspsp_name}`} className="pressable flex size-10 items-center justify-center rounded-full bg-surface-secondary">
                  <Trash2 className="size-4 text-danger" />
                </button>
              </div>
            )
          })}
        </ListGroup>
      )}

      <div className="mt-4 grid gap-3">
        <Button onClick={() => setPicker(true)}>
          <Landmark className="size-5" /> {list.length ? 'Forbind en bank mere' : 'Forbind bank'}
        </Button>
        {list.length > 0 && (
          <Button variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className="size-5" /> Hent nye posteringer nu
          </Button>
        )}
      </div>
      {sync.isError && <p role="alert" className="mt-3 text-[14px] text-danger">{bankErrorMessage(sync.error)}</p>}
      {sync.isSuccess && <p role="status" className="mt-3 px-1 text-[14px] text-secondary">{sync.data.imported ? `${sync.data.imported} nye posteringer hentet.` : 'Ingen nye posteringer.'}</p>}
      <p className="mt-4 px-1 text-[13px] text-secondary">Nye posteringer hentes automatisk hver nat. Efter 180 dage skal du godkende adgangen igen med MitID – det er et krav fra EU.</p>

      <BottomSheet open={picker} onClose={() => setPicker(false)} title="Vælg din bank">
        {picker && <BankPicker />}
      </BottomSheet>
      <BottomSheet open={remove !== null} onClose={() => setRemove(null)} title="Fjern forbindelsen?">
        <p className="text-[15px] text-secondary">Adgangen til banken lukkes, og posteringer, du ikke har godkendt endnu, fjernes. Godkendte udgifter og indtægter bliver.</p>
        {disconnect.isError && <p className="mt-3 text-[14px] text-danger">{bankErrorMessage(disconnect.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Annullér
          </Button>
          <Button variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate(remove!, { onSuccess: () => setRemove(null) })}>
            Fjern
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}

function BankPicker() {
  const banks = useBanks(true)
  const connect = useConnectBank()
  const [q, setQ] = useState('')
  const list = (banks.data ?? []).filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()))
  if (banks.isError) return <p className="text-[15px] text-secondary">{bankErrorMessage(banks.error)}</p>
  return (
    <>
      <div className="flex items-center gap-2 rounded-2xl bg-surface-primary px-4 shadow-card ring-1 ring-subtle focus-within:ring-2 focus-within:ring-accent">
        <Search className="size-4 shrink-0 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg efter bank" aria-label="Søg efter bank" className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
      </div>
      {connect.isError && <p role="alert" className="mt-3 text-[14px] text-danger">{bankErrorMessage(connect.error)}</p>}
      <div className="mt-3 max-h-[50dvh] overflow-y-auto">
        {banks.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ListGroup>
            {list.map((b) => (
              <ListRow key={b.name} icon={Landmark} title={b.name} onClick={() => !connect.isPending && connect.mutate(b.name)} />
            ))}
          </ListGroup>
        )}
      </div>
      <p className="mt-3 px-1 text-[13px] text-secondary">Du sendes videre til banken og logger ind med MitID. Bagefter kommer du tilbage hertil.</p>
    </>
  )
}
