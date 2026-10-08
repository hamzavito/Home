import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type BankTransaction = Tables<'bank_transactions'>
export type IncomeEntry = Tables<'income_entries'>

type FnResult = { ok: boolean; error?: string; url?: string; banks?: Array<{ name: string; logo: string | null }>; imported?: number; accounts?: number; failed?: number }

/** Kald Edge Function "bank". Fejlkoden fra funktionen kastes som Error(message = kode). */
async function bank(body: Record<string, unknown>): Promise<FnResult> {
  const { data, error } = await supabase.functions.invoke<FnResult>('bank', { body })
  if (data?.ok) return data
  let code = data?.error
  if (!code && error) {
    const ctx = (error as { context?: Response }).context
    code = ctx ? ((await ctx.json().catch(() => ({}))) as FnResult).error : undefined
  }
  throw new Error(code ?? 'server')
}

export function bankErrorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  switch ((e as Error | null)?.message) {
    case 'not_configured':
      return 'Bankforbindelse er ikke sat op endnu.'
    case 'read_only':
      return READ_ONLY_MESSAGE
    case 'not_found':
      return 'Forbindelsen blev ikke fundet eller er udløbet. Prøv at forbinde igen.'
    case 'bank_error':
      return 'Banken svarer ikke lige nu. Prøv igen om lidt.'
    default: {
      const msg = (e as { message?: string } | null)?.message ?? ''
      if (msg.includes('Vælg en kategori')) return 'Vælg en kategori.'
      return 'Noget gik galt. Prøv igen.'
    }
  }
}

const keys = {
  connections: (hid: string) => ['bank', hid, 'connections'] as const,
  inbox: (hid: string) => ['bank', hid, 'inbox'] as const,
  banks: ['bank', 'aspsps'] as const,
}

export function useBankConnections() {
  const { id } = useHousehold()
  return useQuery({
    queryKey: keys.connections(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bank_connection_list')
      if (error) throw error
      return data
    },
  })
}

/** Egne bankposteringer, der ikke er godkendt endnu */
export function useBankInbox() {
  const { id } = useHousehold()
  return useQuery({
    queryKey: keys.inbox(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .in('state', ['new', 'transfer', 'ignored'])
        .order('booked_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data
    },
  })
}

export function useBanks(enabled: boolean) {
  return useQuery({
    queryKey: keys.banks,
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
    queryFn: async () => (await bank({ action: 'banks' })).banks ?? [],
  })
}

/** Videre til bankens login (MitID). Kommer tilbage til /bank/callback. */
export function useConnectBank() {
  return useMutation({
    mutationFn: async (aspsp: string) => {
      const r = await bank({ action: 'connect', aspsp })
      window.location.assign(r.url!)
    },
  })
}

export function useBankCallback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; state: string }) => bank({ action: 'callback', ...input }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['bank'] }),
  })
}

export function useSyncBank() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => bank({ action: 'sync' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['bank'] }),
  })
}

export function useDisconnectBank() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bank({ action: 'disconnect', id }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['bank'] }),
  })
}

function useRefresh() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['bank'] }), qc.invalidateQueries({ queryKey: ['finance'] }), qc.invalidateQueries({ queryKey: ['income'] })])
}

export function useImportBankTransaction() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (input: { id: string; categoryId: string | null; description: string }) => {
      const { data, error } = await supabase.rpc('bank_import', { p_id: input.id, p_category_id: input.categoryId, p_description: input.description.trim() || null })
      if (error) throw error
      return data
    },
    onSuccess: refresh,
  })
}

export function useLinkBankTransaction() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (input: { id: string; transactionId: string }) => {
      const { error } = await supabase.rpc('bank_link_existing', { p_id: input.id, p_transaction_id: input.transactionId })
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

export function useSetIgnored() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (input: { id: string; ignored: boolean }) => {
      const { error } = await supabase.rpc('bank_set_ignored', { p_id: input.id, p_ignored: input.ignored })
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

/** Ignorér alle nye posteringer på én gang (kan tages med enkeltvis bagefter) */
export function useIgnoreAll() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('bank_ignore_all')
      if (error) throw error
      return data
    },
    onSuccess: refresh,
  })
}

// ---------------------------------------------------------------- indtægter

export function useMonthIncome(month: string, next: string) {
  const { id } = useHousehold()
  return useQuery({
    queryKey: ['income', id, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_entries')
        .select('*')
        .gte('received_on', month)
        .lt('received_on', next)
        .order('received_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSaveIncome() {
  const { id: hid } = useHousehold()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; amountOre: number; receivedOn: string; description: string; paidBy: { kind: 'member' | 'shared'; userId: string | null } }) => {
      const values = {
        amount_ore: input.amountOre,
        received_on: input.receivedOn,
        description: input.description.trim(),
        received_by_kind: input.paidBy.kind,
        received_by_user_id: input.paidBy.kind === 'member' ? input.paidBy.userId : null,
      }
      const { error } = input.id
        ? await supabase.from('income_entries').update(values).eq('id', input.id)
        : await supabase.from('income_entries').insert({ household_id: hid, ...values })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['income'] }),
  })
}

export function useDeleteIncome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('income_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['income'] }),
  })
}
