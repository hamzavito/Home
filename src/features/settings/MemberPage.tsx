import { Eye, EyeOff, KeyRound, LayoutDashboard, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useChildPin, useSetMemberRole } from '@/features/child/api'
import { useHousehold, type HouseholdMember } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { ChildLoginControls } from './ChildLogin'
import { RemoveMember } from './HouseholdAccess'

/** Ejefald: "Noahs", men "Jonas'" */
export const genitive = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`)

export const roleLabels: Record<string, string> = { owner: 'Ejer', adult: 'Voksen', member: 'Voksen', child: 'Barn' }

/** Et medlem af husstanden. Ejere kan skifte rolle; for børn styres lommepenge, mål, opgaver og aftaler. */
export function MemberPage() {
  const { id } = useParams()
  const household = useHousehold()
  const member = household.members.find((m) => m.userId === id)
  if (!member)
    return (
      <>
        <PageHeader title="Medlem" back="/indstillinger" />
        <EmptyState icon={UserRound} title="Medlemmet findes ikke" />
      </>
    )
  const index = household.members.indexOf(member)
  return (
    <>
      <PageHeader title={member.displayName} eyebrow={roleLabels[member.role]} back="/indstillinger" />
      <div className="flex items-center gap-3 rounded-card bg-surface-primary p-4 shadow-card">
        <Avatar name={member.displayName} color={member.color} index={index} className="size-12 text-[17px]" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">
            {member.displayName}
            {member.isMe && <span className="text-secondary"> (dig)</span>}
          </p>
          <p className="text-[14px] text-secondary">
            {roleLabels[member.role]}
            {member.username && ` · brugernavn ${member.username}`}
            {member.disabled && ' · login slået fra'}
          </p>
        </div>
      </div>
      {household.me.role === 'owner' && !member.isMe && !member.username && <RoleEditor member={member} />}
      {household.me.role === 'owner' && member.username && <ChildLoginControls child={member} />}
      {member.isChild && (
        <ListGroup className="mt-3">
          <ListRow icon={LayoutDashboard} title={`Åbn ${genitive(member.displayName)} overblik`} subtitle="Opgaver, godkendelser, lommepenge og mål" to={`/hjemmet/barn/${member.userId}`} />
        </ListGroup>
      )}
      {member.username && !household.me.isChild && <ChildPinRow child={member} />}
      {household.me.role === 'owner' && !member.isMe && !member.isChild && <RemoveMember member={member} />}
    </>
  )
}

const roleOptions = [
  { value: 'adult', label: 'Voksen', hint: 'Ser og styrer hele husstanden, også økonomien.' },
  { value: 'owner', label: 'Ejer', hint: 'Som voksen, og kan også ændre andres roller.' },
  { value: 'child', label: 'Barn', hint: 'Ser kun aftensmad, egne opgaver, egne og fælles aftaler og egne lommepenge.' },
] as const

function RoleEditor({ member }: { member: HouseholdMember }) {
  const setRole = useSetMemberRole()
  const current = member.role === 'member' ? 'adult' : member.role
  const [role, setLocalRole] = useState<(typeof roleOptions)[number]['value']>(current)
  return (
    <>
      <SectionHeader title="Rolle" />
      <div className="rounded-card bg-surface-primary p-5 shadow-card">
        <div role="radiogroup" aria-label="Rolle" className="flex flex-wrap gap-2">
          {roleOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={role === o.value}
              onClick={() => setLocalRole(o.value)}
              className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', role === o.value ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[13px] text-secondary">{roleOptions.find((o) => o.value === role)?.hint}</p>
        <Button className="mt-4" block disabled={role === current} loading={setRole.isPending} onClick={() => setRole.mutate({ userId: member.userId, role })}>
          Gem rolle
        </Button>
        {setRole.isError && <p className="mt-2 px-1 text-[13px] text-danger">Rollen kunne ikke ændres. Prøv igen.</p>}
        {setRole.isSuccess && role === current && <p className="mt-2 px-1 text-[13px] font-semibold text-positive">Gemt</p>}
      </div>
    </>
  )
}

/** Barnets PIN – synlig for forældrene (hentes først, når man trykker "Vis") */
function ChildPinRow({ child }: { child: HouseholdMember }) {
  const [shown, setShown] = useState(false)
  const pin = useChildPin(child.userId, shown)
  return (
    <>
      <SectionHeader title="PIN" />
      <div className="flex items-center gap-3 rounded-card bg-surface-primary p-4 shadow-card">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-surface-accent text-accent-text">
          <KeyRound className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-secondary">{genitive(child.displayName)} PIN</span>
          <span className="tabular block font-mono text-[22px] font-bold tracking-[0.2em]" aria-label="PIN" aria-live="polite">
            {!shown ? '••••••' : pin.isPending ? '…' : pin.isError ? '–' : (pin.data ?? 'Ukendt')}
          </span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Skjul PIN' : 'Vis PIN'}>
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {shown ? 'Skjul' : 'Vis'}
        </Button>
      </div>
      {shown && pin.data === null && (
        <p className="mt-2 px-1 text-[13px] text-secondary">PIN'en blev valgt, før den kunne vises. Vælg en ny PIN under Login, så kan I se den her fremover.</p>
      )}
    </>
  )
}
