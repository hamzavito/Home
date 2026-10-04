import { Archive, ArchiveRestore, Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { fixedErrorMessage, useFixedGroups, useFixedItems, useSaveGroup } from './api'

/** Egne udgiftsgrupper: tilføj, omdøb, arkivér (sletning ville bryde historik). */
export function GroupsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Udgiftsgrupper">
      {open && <GroupsForm />}
    </BottomSheet>
  )
}

function GroupsForm() {
  const groups = useFixedGroups()
  const items = useFixedItems()
  const save = useSaveGroup()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const used = (id: string) => (items.data ?? []).some((i) => i.group_id === id && !i.archived_at && (!i.end_month || i.end_month >= new Date().toISOString().slice(0, 7) + '-01'))

  return (
    <>
      <ul className="divide-y divide-subtle overflow-hidden rounded-[20px] bg-surface-primary">
        {(groups.data ?? []).map((g) => (
          <li key={g.id} className="flex min-h-[54px] items-center gap-2 px-4">
            {editing?.id === g.id ? (
              <>
                <TextInput value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-10 flex-1" aria-label="Gruppenavn" autoFocus />
                <button
                  type="button"
                  aria-label="Gem navn"
                  className="pressable flex size-9 items-center justify-center rounded-full bg-accent text-on-accent"
                  onClick={() => editing.name.trim() && save.mutate({ id: g.id, name: editing.name.trim() }, { onSuccess: () => setEditing(null) })}
                >
                  <Check className="size-4" />
                </button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-[16px] font-medium ${g.archived_at ? 'text-muted line-through' : ''}`}>{g.name}</span>
                {!g.archived_at && (
                  <button type="button" aria-label={`Omdøb ${g.name}`} className="pressable flex size-9 items-center justify-center rounded-full bg-surface-secondary" onClick={() => setEditing({ id: g.id, name: g.name })}>
                    <Pencil className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={g.archived_at ? `Gendan ${g.name}` : `Arkivér ${g.name}`}
                  disabled={!g.archived_at && used(g.id)}
                  title={!g.archived_at && used(g.id) ? 'Gruppen bruges af aktive poster' : undefined}
                  className="pressable flex size-9 items-center justify-center rounded-full bg-surface-secondary disabled:text-muted"
                  onClick={() => save.mutate({ id: g.id, archived_at: g.archived_at ? null : new Date().toISOString() })}
                >
                  {g.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-[12px] text-secondary">Grupper der bruges af aktive poster kan ikke arkiveres.</p>
      <div className="mt-4 flex gap-2">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ny gruppe, fx Børn" maxLength={40} className="flex-1" aria-label="Ny gruppe" />
        <Button className="h-13" disabled={!name.trim()} loading={save.isPending && !editing} onClick={() => save.mutate({ name }, { onSuccess: () => setName('') })}>
          Tilføj
        </Button>
      </div>
      {save.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{fixedErrorMessage(save.error)}</p>}
    </>
  )
}
