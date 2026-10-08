import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import type { MovementKind, Tables } from '@/types/database'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type Goal = Tables<'savings_goals'>
export type GoalMovement = Tables<'savings_movements'>
export type GoalWithProgress = Goal & { currentOre: number; movementCount: number }

const keys = {
  goals: (hid: string) => ['savings', hid, 'goals'] as const,
  movements: (goalId: string) => ['savings', 'movements', goalId] as const,
  all: (hid: string) => ['savings', hid, 'all-movements'] as const,
}

export function useGoals() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.goals(hid),
    queryFn: async (): Promise<GoalWithProgress[]> => {
      const [goals, progress] = await Promise.all([
        supabase.from('savings_goals').select('*').order('created_at'),
        supabase.rpc('savings_goal_progress'),
      ])
      if (goals.error) throw goals.error
      if (progress.error) throw progress.error
      const p = new Map(progress.data.map((x) => [x.goal_id, x]))
      return goals.data.map((g) => ({ ...g, currentOre: p.get(g.id)?.current_ore ?? 0, movementCount: p.get(g.id)?.movement_count ?? 0 }))
    },
  })
}

export function useMovements(goalId: string | undefined) {
  return useQuery({
    queryKey: keys.movements(goalId ?? ''),
    enabled: Boolean(goalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings_movements')
        .select('*')
        .eq('goal_id', goalId!)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['savings'] })
}

export function useSaveGoal() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, ...v }: { id?: string; name?: string; target_ore?: number; target_date?: string | null; note?: string | null; color?: string; archived_at?: string | null }) => {
      if (id) {
        const { error } = await supabase.from('savings_goals').update(v).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase
        .from('savings_goals')
        .insert({ household_id: hid, name: v.name!.trim(), target_ore: v.target_ore!, target_date: v.target_date ?? null, note: v.note ?? null, color: v.color })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useAddMovement() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (m: { goalId: string; kind: MovementKind; amountOre: number; occurredOn: string; note: string | null }) => {
      const { error } = await supabase
        .from('savings_movements')
        .insert({ household_id: hid, goal_id: m.goalId, kind: m.kind, amount_ore: m.amountOre, occurred_on: m.occurredOn, note: m.note?.trim() || null })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteMovement() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_movements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function savingsErrorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (msg.includes('negativ')) return 'Der er ikke så meget sparet op. Saldoen kan ikke blive negativ.'
  if (/fetch|network/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  return 'Noget gik galt. Prøv igen.'
}
