import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import type { PaidByKind, Tables, UpcomingStatus } from '@/types/database'

export type Upcoming = Tables<'upcoming_expenses'>

const key = (hid: string) => ['finance', hid, 'upcoming'] as const

export function useUpcoming() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: key(hid),
    queryFn: async () => {
      const { data, error } = await supabase.from('upcoming_expenses').select('*').order('due_on').order('created_at')
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['finance'] })
}

export type UpcomingInput = { title: string; amountOre: number; dueOn: string; categoryId: string; note: string | null }

export function useSaveUpcoming() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: UpcomingInput }) => {
      const values = { title: input.title.trim(), amount_ore: input.amountOre, due_on: input.dueOn, category_id: input.categoryId, note: input.note?.trim() || null }
      if (id) {
        const { error } = await supabase.from('upcoming_expenses').update(values).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('upcoming_expenses').insert({ ...values, household_id: hid }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useDeleteUpcoming() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('upcoming_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetUpcomingStatus() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (i: {
      id: string
      status: UpcomingStatus
      register?: boolean
      amountOre?: number | null
      paidOn?: string | null
      paidBy?: { kind: PaidByKind; userId: string | null }
    }) => {
      const { data, error } = await supabase.rpc('set_upcoming_status', {
        p_id: i.id,
        p_status: i.status,
        p_register: i.register ?? false,
        p_amount_ore: i.amountOre ?? null,
        p_paid_on: i.paidOn ?? null,
        p_paid_by_kind: i.paidBy?.kind ?? 'shared',
        p_paid_by_user_id: i.paidBy?.kind === 'member' ? i.paidBy.userId : null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUndoPayment() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('undo_upcoming_payment', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function upcomingErrorMessage(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (msg.includes('Fortryd')) return 'Udgiften er registreret. Fortryd betalingen først.'
  if (msg.includes('arkiveret')) return 'Kategorien er arkiveret. Vælg en anden.'
  if (/fetch|network/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  return 'Noget gik galt. Prøv igen.'
}
