import { ArrowDown, ArrowUp, Check, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import {
  homeErrorMessage,
  useAddShoppingItem,
  useClearChecked,
  useDeleteShoppingItem,
  useShopping,
  useShoppingRealtime,
  useToggleShoppingItem,
  useUpdateShoppingItem,
  type ShoppingItem,
} from '@/features/home/api'
import { cn } from '@/lib/cn'

export function ShoppingPage() {
  useShoppingRealtime()
  const shopping = useShopping()
  const add = useAddShoppingItem()
  const clear = useClearChecked()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<ShoppingItem | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = shopping.data?.items ?? []
  const open = items.filter((i) => !i.is_checked)
  const checked = items.filter((i) => i.is_checked)

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const value = name.trim()
    if (!value || !shopping.data) return
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0)
    // Feltet tømmes med det samme, så man kan skrive næste vare, mens den første gemmes
    setName('')
    inputRef.current?.focus()
    try {
      await add.mutateAsync({ listId: shopping.data.listId, name: value, quantity: null, sortOrder: maxOrder + 1 })
    } catch {
      // Gendan teksten, så intet går tabt (fejlen vises nedenfor)
      setName((current) => current || value)
    }
  }

  return (
    <>
      <PageHeader title="Indkøb" eyebrow={shopping.isSuccess ? (open.length === 0 ? 'Alt er købt' : `${open.length} ${open.length === 1 ? 'vare' : 'varer'} tilbage`) : undefined} back="/hjemmet" />

      <form onSubmit={onAdd} className="flex gap-2">
        <TextInput
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tilføj vare, fx mælk"
          aria-label="Ny vare"
          maxLength={80}
          enterKeyHint="done"
          autoCapitalize="sentences"
          autoComplete="off"
          className="flex-1"
        />
        <button
          type="submit"
          aria-label="Tilføj vare"
          disabled={!name.trim() || !shopping.data}
          className="pressable flex size-13 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent disabled:bg-surface-tertiary disabled:text-muted"
        >
          <Plus className="size-6" strokeWidth={2.6} />
        </button>
      </form>
      {add.isError && <p className="mt-2 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{homeErrorMessage(add.error)}</p>}
      {shopping.isError && <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">Listen kunne ikke hentes. {homeErrorMessage(shopping.error)}</p>}

      {shopping.isPending ? (
        <Skeleton className="mt-5 h-56 rounded-card" />
      ) : items.length === 0 ? (
        <Card variant="tonal" className="mt-5">
          <EmptyState compact icon={ShoppingCart} title="Listen er tom" text="Det I tilføjer, kan I begge se med det samme – også mens I står i butikken." />
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <Card padded={false} className="mt-5 divide-y divide-subtle">
              {open.map((i) => (
                <ItemRow key={i.id} item={i} onEdit={() => setEditing(i)} />
              ))}
            </Card>
          )}
          {checked.length > 0 && (
            <>
              <SectionHeader
                title={`I kurven (${checked.length})`}
                action={
                  <Button size="sm" variant="secondary" onClick={() => setConfirmClear(true)}>
                    Ryd købte
                  </Button>
                }
              />
              <Card padded={false} className="divide-y divide-subtle">
                {checked.map((i) => (
                  <ItemRow key={i.id} item={i} onEdit={() => setEditing(i)} />
                ))}
              </Card>
            </>
          )}
        </>
      )}

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title="Ret vare">
        {editing && <EditItem item={editing} siblings={editing.is_checked ? checked : open} onDone={() => setEditing(null)} />}
      </BottomSheet>
      <BottomSheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Ryd købte varer?">
        <p className="text-[15px] text-secondary">
          {checked.length} {checked.length === 1 ? 'vare' : 'varer'} fjernes fra listen på begge telefoner.
        </p>
        {clear.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{homeErrorMessage(clear.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            Annullér
          </Button>
          <Button variant="danger" loading={clear.isPending} onClick={() => shopping.data && clear.mutate(shopping.data.listId, { onSuccess: () => setConfirmClear(false) })}>
            Ryd
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}

function ItemRow({ item, onEdit }: { item: ShoppingItem; onEdit: () => void }) {
  const { members } = useHousehold()
  const toggle = useToggleShoppingItem()
  const idx = members.findIndex((m) => m.userId === item.added_by)
  const by = members[idx]
  const checker = members.find((m) => m.userId === item.checked_by)
  const sub = [item.quantity, item.note].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-1 pr-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.is_checked}
        aria-label={item.is_checked ? `Fortryd ${item.name}` : `Køb ${item.name}`}
        onClick={() => toggle.mutate({ id: item.id, checked: !item.is_checked })}
        className="flex size-14 shrink-0 items-center justify-center"
      >
        <span className={cn('flex size-7 items-center justify-center rounded-full border-2 transition-colors', item.is_checked ? 'border-positive bg-positive text-on-accent' : 'border-strong')}>
          {item.is_checked && <Check className="size-4 [animation:pop_300ms_var(--ease-spring)]" strokeWidth={3} />}
        </span>
      </button>
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[16px] font-semibold', item.is_checked && 'text-secondary line-through')}>{item.name}</span>
          {(sub || (item.is_checked && checker)) && (
            <span className="block truncate text-[13px] text-secondary">{item.is_checked && checker ? `Købt af ${checker.displayName}${sub ? ` · ${sub}` : ''}` : sub}</span>
          )}
        </span>
        {by && !item.is_checked && <Avatar name={by.displayName} color={by.color} index={idx} className="size-7 text-[11px]" />}
      </button>
    </div>
  )
}

function EditItem({ item, siblings, onDone }: { item: ShoppingItem; siblings: ShoppingItem[]; onDone: () => void }) {
  const update = useUpdateShoppingItem()
  const del = useDeleteShoppingItem()
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const pos = siblings.findIndex((s) => s.id === item.id)

  // Flyt ved at bytte sorteringsplads med naboen
  function move(dir: -1 | 1) {
    const other = siblings[pos + dir]
    if (!other) return
    const a = item.sort_order === other.sort_order ? other.sort_order + dir : other.sort_order
    update.mutate({ id: item.id, values: { sort_order: a } })
    update.mutate({ id: other.id, values: { sort_order: item.sort_order } }, { onSuccess: onDone })
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await update.mutateAsync({ id: item.id, values: { name: name.trim(), quantity: quantity.trim() || null, note: note.trim() || null } })
      onDone()
    } catch {
      // vises nedenfor
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <Field label="Vare" error={name.trim() ? null : 'Skriv navnet på varen'}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoCapitalize="sentences" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mængde">
          <TextInput value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Fx 2 l" maxLength={30} />
        </Field>
        <Field label="Note">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fx økologisk" maxLength={200} />
        </Field>
      </div>
      {siblings.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" disabled={pos <= 0 || update.isPending} onClick={() => move(-1)}>
            <ArrowUp className="size-4.5" /> Flyt op
          </Button>
          <Button type="button" variant="secondary" disabled={pos >= siblings.length - 1 || update.isPending} onClick={() => move(1)}>
            <ArrowDown className="size-4.5" /> Flyt ned
          </Button>
        </div>
      )}
      {(update.isError || del.isError) && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{homeErrorMessage(update.error ?? del.error)}</p>}
      <Button type="submit" block disabled={!name.trim()} loading={update.isPending}>
        Gem
      </Button>
      <Button type="button" block variant="danger" loading={del.isPending} onClick={() => del.mutate(item.id, { onSuccess: onDone })}>
        <Trash2 className="size-4.5" /> Slet vare
      </Button>
    </form>
  )
}
