import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import type { Tables, WalletKind } from '@/types/database'

export type WalletTransaction = Tables<'child_wallet_transactions'>
export type ChildGoal = Tables<'child_savings_goals'>
export type Wallet = { transactions: WalletTransaction[]; goals: ChildGoal[] }

const walletKey = (hid: string, childId: string) => ['wallet', hid, childId] as const

/** Et barns lommepenge og mål. Databasen viser kun barnets egne data til barnet. */
export function useWallet(childId: string | undefined) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: walletKey(hid, childId ?? ''),
    enabled: Boolean(childId),
    queryFn: async (): Promise<Wallet> => {
      const [tx, goals] = await Promise.all([
        supabase.from('child_wallet_transactions').select('*').eq('child_id', childId!).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(500),
        supabase.from('child_savings_goals').select('*').eq('child_id', childId!).order('created_at'),
      ])
      if (tx.error) throw tx.error
      if (goals.error) throw goals.error
      return { transactions: tx.data, goals: goals.data }
    },
  })
}

function useInvalidateWallet() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['wallet'] })
}

export function walletErrorMessage(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (/fetch|network/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  for (const known of ['Der er ikke penge nok på saldoen', 'Der er ikke så mange penge på målet', 'Målet er afsluttet', 'Højst 20 aktive mål', 'Pengene er allerede taget fra målet', 'Ugyldig dato'])
    if (msg.includes(known)) return `${known}.`
  if (msg.includes('Ikke tilladt')) return 'Det har du ikke adgang til.'
  return 'Noget gik galt. Prøv igen.'
}

export type WalletInput = { childId: string; kind: WalletKind; amountOre: number; note?: string | null; goalId?: string | null; occurredOn?: string | null }

export function useAddWalletTx() {
  const invalidate = useInvalidateWallet()
  return useMutation({
    mutationFn: async (i: WalletInput) => {
      const { error } = await supabase.rpc('child_wallet_add', {
        p_child: i.childId,
        p_kind: i.kind,
        p_amount_ore: i.amountOre,
        p_note: i.note?.trim() || null,
        p_goal: i.goalId ?? null,
        p_occurred_on: i.occurredOn ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useVoidWalletTx() {
  const invalidate = useInvalidateWallet()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('child_wallet_void', { p_tx: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCreateChildGoal() {
  const invalidate = useInvalidateWallet()
  return useMutation({
    mutationFn: async (i: { childId: string; name: string; targetOre: number }) => {
      const { error } = await supabase.rpc('child_goal_create', { p_child: i.childId, p_name: i.name.trim(), p_target_ore: i.targetOre })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateChildGoal() {
  const invalidate = useInvalidateWallet()
  return useMutation({
    mutationFn: async (i: { goalId: string; name?: string | null; targetOre?: number | null; archive?: boolean }) => {
      const { error } = await supabase.rpc('child_goal_update', { p_goal: i.goalId, p_name: i.name ?? null, p_target_ore: i.targetOre ?? null, p_archive: i.archive ?? false })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Kun ejere: skift et andet medlems rolle */
export function useSetMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: { userId: string; role: 'owner' | 'adult' | 'child' }) => {
      const { error } = await supabase.rpc('set_member_role', { p_user: i.userId, p_role: i.role })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household'] }),
  })
}
