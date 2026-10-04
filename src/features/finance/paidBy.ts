import type { HouseholdMember } from '@/features/household/HouseholdProvider'
import type { PaidByKind } from '@/types/database'

export function paidByLabel(kind: PaidByKind, userId: string | null, members: HouseholdMember[]): string {
  if (kind === 'shared') return 'Fælles'
  return members.find((m) => m.userId === userId)?.displayName ?? 'Tidligere medlem'
}

/** Valgmuligheder for "Betalt af": husstandens medlemmer + Fælles */
export function paidByOptions(members: HouseholdMember[]) {
  return [
    ...members.map((m) => ({ value: `member:${m.userId}`, label: m.displayName })),
    { value: 'shared', label: 'Fælles' },
  ]
}

export function encodePaidBy(kind: PaidByKind, userId: string | null) {
  return kind === 'shared' ? 'shared' : `member:${userId}`
}

export function decodePaidBy(value: string): { kind: PaidByKind; userId: string | null } {
  return value.startsWith('member:') ? { kind: 'member', userId: value.slice(7) } : { kind: 'shared', userId: null }
}
