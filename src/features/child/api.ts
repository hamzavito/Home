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

// ---------------------------------------------------------------- barnelogin (kun ejere)
export type ChildAdminError = 'unauthorized' | 'not_owner' | 'invalid_name' | 'invalid_username' | 'username_taken' | 'invalid_pin' | 'not_found' | 'bad_request' | 'server' | 'network'

export function childAdminMessage(e: unknown): string {
  const code = (e as { code?: ChildAdminError } | null)?.code ?? 'server'
  const messages: Record<ChildAdminError, string> = {
    unauthorized: 'Du er ikke logget ind. Log ind igen.',
    not_owner: 'Kun ejere kan administrere børns login.',
    invalid_name: 'Skriv barnets navn (højst 40 tegn).',
    invalid_username: 'Brugernavnet skal være 2–20 tegn: bogstaver, tal, punktum, - eller _.',
    username_taken: 'Brugernavnet er allerede i brug i husstanden.',
    invalid_pin: 'PIN er for let at gætte. Undgå fx 123456 og 000000.',
    not_found: 'Barnet findes ikke længere.',
    bad_request: 'Noget gik galt. Prøv igen.',
    server: 'Noget gik galt. Prøv igen.',
    network: 'Ingen forbindelse. Prøv igen.',
  }
  return messages[code] ?? messages.server
}

async function callChildAdmin(body: Record<string, unknown>): Promise<{ userId?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; userId?: string; error?: ChildAdminError }>('child-admin', { body })
  if (!error && data?.ok) return { userId: data.userId }
  let code: ChildAdminError = error && !(error as { context?: Response }).context ? 'network' : 'server'
  try {
    const res = (error as { context?: Response } | null)?.context
    if (res) code = ((await res.json()) as { error?: ChildAdminError }).error ?? 'server'
  } catch {
    /* ukendt fejl */
  }
  throw Object.assign(new Error(code), { code })
}

/** Husstandskoden (kun ejere kan se den) */
export function useLoginCode(enabled: boolean) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: ['login-code', hid],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('household_login_code')
      if (error) throw error
      return data
    },
  })
}

export function useCreateChild() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (i: { name: string; username: string; pin: string; pinLength: 4 | 6 }) => callChildAdmin({ action: 'create', ...i }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household'] }),
  })
}

export function useSetChildDisabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (i: { childId: string; disabled: boolean }) => callChildAdmin({ action: i.disabled ? 'disable' : 'enable', childId: i.childId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household'] }),
  })
}

function pinError(e: { code?: string; message?: string }): Error {
  const code: ChildAdminError = e.code === '23505' ? 'username_taken' : e.code === '23514' ? (e.message?.includes('PIN') ? 'invalid_pin' : 'invalid_username') : e.code === '42501' ? 'not_owner' : 'server'
  return Object.assign(new Error(code), { code })
}

export function useSetChildPin() {
  return useMutation({
    mutationFn: async (i: { childId: string; pin: string; pinLength: 4 | 6 }) => {
      const { error } = await supabase.rpc('child_set_pin', { p_child: i.childId, p_pin: i.pin, p_pin_length: i.pinLength })
      if (error) throw pinError(error)
    },
  })
}

export function useSetChildUsername() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: { childId: string; username: string }) => {
      const { error } = await supabase.rpc('child_set_username', { p_child: i.childId, p_username: i.username })
      if (error) throw pinError(error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household'] }),
  })
}
