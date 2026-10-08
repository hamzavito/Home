import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import type { Database, FixedKind, Frequency, PaidByKind, Tables } from '@/types/database'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type FixedGroup = Tables<'fixed_groups'>
export type FixedItem = Tables<'fixed_items'>
export type FixedVersion = Tables<'fixed_item_versions'>
export type FixedMonthRow = Database['public']['Functions']['fixed_items_month']['Returns'][number]
export type MonthPlan = Database['public']['Functions']['month_plan']['Returns'][number]

// Under 'finance', så alle økonomital opdateres samlet efter en ændring
const keys = {
  groups: (hid: string) => ['finance', hid, 'fixed-groups'] as const,
  items: (hid: string) => ['finance', hid, 'fixed-items'] as const,
  month: (hid: string, month: string) => ['finance', hid, 'fixed-month', month] as const,
  plan: (hid: string, month: string) => ['finance', hid, 'plan', month] as const,
  versions: (itemId: string) => ['finance', 'fixed-versions', itemId] as const,
}

export function useFixedGroups() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.groups(hid),
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_groups').select('*').order('sort_order').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useFixedItems() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.items(hid),
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_items').select('*').order('sort_order').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useFixedMonth(month: string) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.month(hid, month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fixed_items_month', { p_month: month })
      if (error) throw error
      return data
    },
  })
}

export function useMonthPlan(month: string) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.plan(hid, month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('month_plan', { p_month: month })
      if (error) throw error
      return data[0] ?? null
    },
  })
}

export function useFixedVersions(itemId: string | undefined) {
  return useQuery({
    queryKey: keys.versions(itemId ?? ''),
    enabled: Boolean(itemId),
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_item_versions').select('*').eq('item_id', itemId!).order('valid_from', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['finance'] })
}

export type NewFixedItem = {
  kind: FixedKind
  name: string
  amountOre: number
  frequency: Frequency
  dueMonth: number | null
  groupId: string | null
  owner: { kind: PaidByKind; userId: string | null } | null
  paymentDay: number | null
  note: string | null
  startMonth: string
}

export function useCreateFixedItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (i: NewFixedItem) => {
      const { data, error } = await supabase.rpc('create_fixed_item', {
        p_kind: i.kind,
        p_name: i.name.trim(),
        p_amount_ore: i.amountOre,
        p_frequency: i.frequency,
        p_due_month: i.frequency === 'monthly' ? null : i.dueMonth,
        p_group_id: i.kind === 'expense' ? i.groupId : null,
        p_owner_kind: i.kind === 'income' ? (i.owner?.kind ?? 'shared') : null,
        p_owner_user_id: i.kind === 'income' && i.owner?.kind === 'member' ? i.owner.userId : null,
        p_payment_day: i.paymentDay,
        p_note: i.note?.trim() || null,
        p_start_month: i.startMonth,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSetFixedAmount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (i: { itemId: string; validFrom: string; amountOre: number; frequency: Frequency; dueMonth: number | null }) => {
      const { error } = await supabase.rpc('set_fixed_item_amount', {
        p_item_id: i.itemId,
        p_valid_from: i.validFrom,
        p_amount_ore: i.amountOre,
        p_frequency: i.frequency,
        p_due_month: i.frequency === 'monthly' ? null : i.dueMonth,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateFixedItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Database['public']['Tables']['fixed_items']['Update']) => {
      const { error } = await supabase.from('fixed_items').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteFixedItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('fixed_items').delete({ count: 'exact' }).eq('id', id)
      if (error) throw error
      if (count === 0) throw new Error('har historik')
    },
    onSuccess: invalidate,
  })
}

export function useEnsureDefaultGroups() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_default_fixed_groups')
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveGroup() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (g: { id?: string; name?: string; archived_at?: string | null; sort_order?: number }) => {
      if (g.id) {
        const { id, ...values } = g
        const { error } = await supabase.from('fixed_groups').update(values).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fixed_groups').insert({ household_id: hid, name: (g.name ?? '').trim(), sort_order: g.sort_order ?? 99 })
        if (error) throw error
      }
    },
    onSuccess: invalidate,
  })
}

export function fixedErrorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const err = e as { code?: string; message?: string } | null
  const msg = err?.message ?? ''
  if (err?.code === '23505') return 'Der findes allerede en gruppe med det navn.'
  if (msg.includes('har historik')) return 'Posten har historik og kan ikke slettes. Stop eller arkivér den i stedet.'
  if (msg.includes('denne måned')) return 'Ændringer kan kun gælde fra denne måned og frem – tidligere måneder bevares.'
  if (/fetch|network/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  return 'Noget gik galt. Prøv igen.'
}

export const frequencyLabel: Record<Frequency, string> = { monthly: 'Månedligt', quarterly: 'Kvartalsvis', yearly: 'Årligt' }
export const frequencyShort: Record<Frequency, string> = { monthly: '/md.', quarterly: '/kvartal', yearly: '/år' }
