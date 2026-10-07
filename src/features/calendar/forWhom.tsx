import { Avatar } from '@/components/ui/Avatar'
import type { HouseholdMember } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'

/** Tom deltagerliste = hele familien. "Begge" i en husstand med to. */
export const familyLabel = (members: HouseholdMember[]) => (members.length === 2 ? 'Begge' : 'Hele familien')

/** Deltagere i husstandens rækkefølge (tidligere medlemmer udelades) */
export function participantsOf(ids: readonly string[] | null | undefined, members: HouseholdMember[]) {
  const set = new Set(ids ?? [])
  return members.map((m, index) => ({ member: m, index })).filter(({ member }) => set.has(member.userId))
}

/** "Noah" · "Noah & Far" · "Noah, Emma & Far" · "Hele familien" */
export function whoLabel(ids: readonly string[] | null | undefined, members: HouseholdMember[]) {
  const list = participantsOf(ids, members)
  if (list.length === 0 || (list.length === members.length && members.length > 1)) return familyLabel(members)
  const names = list.map((p) => p.member.displayName)
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

/** Avatar(er) for hvem aftalen gælder for – eller fælles-ikon for hele familien */
export function ForWhomBadge({ participantIds, members, className }: { participantIds: readonly string[] | null | undefined; members: HouseholdMember[]; className?: string }) {
  const list = participantsOf(participantIds, members)
  if (list.length === 0 || (list.length === members.length && members.length > 1)) return <Avatar name="" shared className={className} />
  const shown = list.slice(0, 2)
  return (
    <span className="flex shrink-0 -space-x-2">
      {shown.map(({ member, index }) => (
        <Avatar key={member.userId} name={member.displayName} color={member.color} index={index} className={cn('ring-2 ring-[var(--surface-primary)]', className)} />
      ))}
      {list.length > 2 && (
        <span className={cn('inline-flex items-center justify-center rounded-full bg-surface-tertiary font-semibold text-secondary ring-2 ring-[var(--surface-primary)]', className)}>+{list.length - 2}</span>
      )}
    </span>
  )
}
