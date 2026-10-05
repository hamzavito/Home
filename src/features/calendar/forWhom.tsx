import { Avatar } from '@/components/ui/Avatar'
import type { HouseholdMember } from '@/features/household/HouseholdProvider'

/** "Begge" i en husstand med to, ellers "Fælles" */
export const sharedLabel = (members: HouseholdMember[]) => (members.length === 2 ? 'Begge' : 'Fælles')

/** Hvem aftalen gælder for. NULL eller et tidligere medlem = fælles. */
export function forWhom(forUserId: string | null, members: HouseholdMember[]) {
  const index = members.findIndex((m) => m.userId === forUserId)
  const member = index >= 0 ? members[index] : undefined
  return { member, index, label: member ? member.displayName : sharedLabel(members) }
}

/** Lille avatar for personen (eller fælles-ikon), så man hurtigt kan skelne. */
export function ForWhomBadge({ forUserId, members, className }: { forUserId: string | null; members: HouseholdMember[]; className?: string }) {
  const { member, index } = forWhom(forUserId, members)
  return member ? (
    <Avatar name={member.displayName} color={member.color} index={index} className={className} />
  ) : (
    <Avatar name="" shared className={className} />
  )
}
