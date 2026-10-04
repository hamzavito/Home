import { useQuery } from '@tanstack/react-query'
import { createContext, use, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { HouseholdRole } from '@/types/database'

export type HouseholdMember = {
  userId: string
  role: HouseholdRole
  displayName: string
  color: string | null
  isMe: boolean
}

export type Household = {
  id: string
  name: string
  members: HouseholdMember[]
  me: HouseholdMember
}

async function fetchHousehold(userId: string): Promise<Household | null> {
  const { data: membership, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!membership) return null

  const [{ data: household, error: hErr }, { data: members, error: mErr }] = await Promise.all([
    supabase.from('households').select('id, name').eq('id', membership.household_id).single(),
    supabase
      .from('household_members')
      .select('user_id, role, created_at, profiles ( display_name, color )')
      .eq('household_id', membership.household_id)
      .order('created_at'),
  ])
  if (hErr) throw hErr
  if (mErr) throw mErr

  const mapped: HouseholdMember[] = members.map((m) => ({
    userId: m.user_id,
    role: m.role,
    displayName: m.profiles?.display_name ?? 'Ukendt',
    color: m.profiles?.color ?? null,
    isMe: m.user_id === userId,
  }))
  const me = mapped.find((m) => m.isMe)
  if (!me) return null
  return { id: household.id, name: household.name, members: mapped, me }
}

export const householdQueryKey = (userId: string | undefined) => ['household', userId] as const

export function useHouseholdQuery() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: householdQueryKey(userId),
    queryFn: () => fetchHousehold(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  })
}

const HouseholdContext = createContext<Household | null>(null)

export function HouseholdProvider({ household, children }: { household: Household; children: ReactNode }) {
  return <HouseholdContext value={household}>{children}</HouseholdContext>
}

/** Den indloggede brugers husstand. Kan kun bruges inde i den beskyttede app. */
export function useHousehold(): Household {
  const ctx = use(HouseholdContext)
  if (!ctx) throw new Error('useHousehold skal bruges inden for HouseholdProvider')
  return ctx
}
