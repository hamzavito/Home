import { Copy, DoorOpen, Send, Share, Trash2, UserMinus, X } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useHousehold, type HouseholdMember } from '@/features/household/HouseholdProvider'
import { formatLongDate } from '@/lib/dates'
import { formatInviteCode, inviteLink } from '@/lib/invite'
import { memberError, useCreateInvite, useDeleteAccount, useExportData, useInvites, useLeaveHousehold, useRemoveMember, useRevokeInvite } from './api'

/** "Inviter voksen" + aktive invitationer. Alle voksne må invitere. */
export function InviteRows() {
  const household = useHousehold()
  const invites = useInvites()
  const revoke = useRevokeInvite()
  const [open, setOpen] = useState(false)
  return (
    <>
      <ListRow icon={Send} title="Inviter voksen" subtitle="Send et link eller en kode" onClick={() => setOpen(true)} />
      {(invites.data ?? []).map((i) => (
        <div key={i.invite_id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-medium">Invitation sendt</span>
            <span className="text-[13px] text-secondary">
              Af {household.members.find((m) => m.userId === i.created_by)?.displayName ?? 'et tidligere medlem'} · gælder til {formatLongDate(new Date(i.expires_at))}
            </span>
          </span>
          <Button size="sm" variant="secondary" loading={revoke.isPending && revoke.variables === i.invite_id} onClick={() => revoke.mutate(i.invite_id)} aria-label="Tilbagekald invitation">
            <X className="size-4" /> Tilbagekald
          </Button>
        </div>
      ))}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Inviter voksen">
        {open && <InviteSheet />}
      </BottomSheet>
    </>
  )
}

function InviteSheet() {
  const household = useHousehold()
  const create = useCreateInvite()
  const [copied, setCopied] = useState(false)
  const invite = create.data

  if (!invite)
    return (
      <>
        <p className="text-[15px] text-secondary">
          Den inviterede bliver voksen i {household.name} og kan se og styre det hele, også økonomien. Invitationen kan bruges én gang og gælder i 7 dage.
        </p>
        {create.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{memberError(create.error)}</p>}
        <Button block className="mt-5" loading={create.isPending} onClick={() => create.mutate()}>
          Lav invitation
        </Button>
      </>
    )

  const link = inviteLink(invite.code)
  const text = `${household.me.displayName} inviterer dig til ${household.name} i Hjem. Åbn linket og log ind eller opret dig. Du kan også skrive koden ${formatInviteCode(invite.code)} i appen. Invitationen gælder i 7 dage.`
  const canShare = typeof navigator.share === 'function'
  return (
    <>
      <p className="text-[15px] text-secondary">Send linket til den, du vil invitere. Koden kan også skrives direkte i appen.</p>
      <div className="mt-4 rounded-2xl bg-surface-secondary p-4 text-center">
        <p className="text-[13px] font-semibold text-secondary">Invitationskode</p>
        <p className="mt-1 font-mono text-[28px] font-bold tracking-[0.12em]" aria-label={`Invitationskode ${formatInviteCode(invite.code).split('').join(' ')}`}>
          {formatInviteCode(invite.code)}
        </p>
        <p className="mt-1 text-[13px] text-secondary">Gælder til {formatLongDate(new Date(invite.expires_at))}</p>
      </div>
      <div className="mt-4 grid gap-3">
        {canShare && (
          <Button
            onClick={() => {
              navigator.share({ title: `Invitation til ${household.name}`, text, url: link }).catch(() => {})
            }}
          >
            <Share className="size-5" /> Del invitation
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard
              ?.writeText(`${text}\n${link}`)
              .then(() => setCopied(true))
              .catch(() => {})
          }}
        >
          <Copy className="size-5" /> {copied ? 'Kopieret' : 'Kopiér link'}
        </Button>
      </div>
    </>
  )
}

/** Ejeren fjerner en anden voksen. Historikken bevares. */
export function RemoveMember({ member }: { member: HouseholdMember }) {
  const remove = useRemoveMember()
  const [open, setOpen] = useState(false)
  return (
    <>
      <ListGroup className="mt-6">
        <ListRow icon={UserMinus} iconColor="var(--danger)" tone="danger" title="Fjern fra husstanden" onClick={() => setOpen(true)} />
      </ListGroup>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Fjern ${member.displayName}?`}>
        <p className="text-[15px] text-secondary">
          {member.displayName} mister adgangen til husstanden med det samme. Udgifter og andet, {member.displayName} har registreret, bliver i husstanden.
        </p>
        {remove.isError && <p className="mt-3 text-[14px] text-danger">{memberError(remove.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Annullér
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(member.userId, { onSuccess: () => history.back() })}>
            Fjern
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}

/** Forlad husstanden og slet kontoen */
export function AccountDanger() {
  const household = useHousehold()
  const leave = useLeaveHousehold()
  const del = useDeleteAccount()
  const exportData = useExportData()
  const [sheet, setSheet] = useState<'leave' | 'delete' | null>(null)
  const [confirm, setConfirm] = useState('')
  const otherAdults = household.adults.filter((m) => !m.isMe && !m.disabled).length
  const last = otherAdults === 0

  return (
    <>
      <ListGroup>
        {!last && <ListRow icon={DoorOpen} iconColor="var(--danger)" tone="danger" title="Forlad husstanden" onClick={() => setSheet('leave')} />}
        <ListRow icon={Trash2} iconColor="var(--danger)" tone="danger" title="Slet min konto" onClick={() => setSheet('delete')} />
      </ListGroup>

      <BottomSheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Forlad husstanden?">
        <p className="text-[15px] text-secondary">
          Du mister adgangen til {household.name}. Det, du har registreret, bliver i husstanden. Bagefter kan du oprette en ny husstand eller tage imod en invitation.
          {household.me.role === 'owner' && ' En anden voksen bliver ejer.'}
        </p>
        {leave.isError && <p className="mt-3 text-[14px] text-danger">{memberError(leave.error)}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            Annullér
          </Button>
          <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutate()}>
            Forlad
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Slet din konto?">
        <p className="text-[15px] text-secondary">
          {last
            ? `Du er den eneste voksne, så hele ${household.name} slettes: udgifter, budgetter, kvitteringer, kalender, opgaver${household.children.length ? ' og børnenes logins' : ''}. Det kan ikke fortrydes.`
            : `Din konto slettes, og du forlader ${household.name}. Det, du har registreret, bliver i husstanden som "Tidligere medlem". Det kan ikke fortrydes.`}
        </p>
        {last && (
          <Button variant="secondary" block className="mt-4" loading={exportData.isPending} onClick={() => exportData.mutate()}>
            Eksportér data først
          </Button>
        )}
        <div className="mt-4">
          <Field label='Skriv "SLET" for at bekræfte'>
            <TextInput value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} autoCapitalize="characters" autoCorrect="off" autoComplete="off" />
          </Field>
        </div>
        {del.isError && <p className="mt-3 text-[14px] text-danger">Kontoen kunne ikke slettes. Prøv igen.</p>}
        <Button variant="danger" block className="mt-5" disabled={confirm.trim() !== 'SLET'} loading={del.isPending} onClick={() => del.mutate()}>
          Slet konto
        </Button>
      </BottomSheet>
    </>
  )
}
