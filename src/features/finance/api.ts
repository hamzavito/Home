import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { fromIsoDate, monthKey, toIsoDate } from '@/lib/dates'
import { deleteTransactionWithReceipt } from '@/features/receipts/api'
import { supabase } from '@/lib/supabase'
import type { BudgetMode, CategoryKind, Database, PaidByKind, Tables } from '@/types/database'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type Category = Tables<'budget_categories'>
export type Transaction = Tables<'transactions'>
export type CategoryDefault = Tables<'budget_category_defaults'>
export type BudgetLine = Database['public']['Functions']['budget_month_summary']['Returns'][number]

// Alle økonomi-nøgler starter med 'finance', så én invalidering opdaterer
// budgetter, dashboard og lister efter enhver ændring.
const keys = {
  all: ['finance'] as const,
  categories: (hid: string) => ['finance', hid, 'categories'] as const,
  budgetMonth: (hid: string, month: string) => ['finance', hid, 'budget-month', month] as const,
  transactionsMonth: (hid: string, month: string) => ['finance', hid, 'transactions', month] as const,
  transactionsRecent: (hid: string) => ['finance', hid, 'transactions', 'recent'] as const,
  transaction: (id: string) => ['finance', 'transaction', id] as const,
  categoryDefaults: (categoryId: string) => ['finance', 'defaults', categoryId] as const,
}

function nextMonth(month: string) {
  const d = fromIsoDate(month)
  return monthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12))
}

// ---------------------------------------------------------------- queries

export function useCategories() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.categories(hid),
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_categories').select('*').order('sort_order').order('name')
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000,
  })
}

export function useBudgetMonth(month: string) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.budgetMonth(hid, month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('budget_month_summary', { p_month: month })
      if (error) throw error
      return data
    },
  })
}

export function useMonthTransactions(month: string) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.transactionsMonth(hid, month),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('occurred_on', month)
        .lt('occurred_on', nextMonth(month))
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useRecentTransactions(limit = 5) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: [...keys.transactionsRecent(hid), limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: keys.transaction(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useCategoryDefaults(categoryId: string | undefined) {
  return useQuery({
    queryKey: keys.categoryDefaults(categoryId ?? ''),
    enabled: Boolean(categoryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_category_defaults')
        .select('*')
        .eq('category_id', categoryId!)
        .order('valid_from', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// ---------------------------------------------------------------- mutations

function useInvalidateFinance() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.all })
}

export type TransactionInput = {
  categoryId: string
  amountOre: number
  occurredOn: string
  description: string
  note: string | null
  paidBy: { kind: PaidByKind; userId: string | null }
}

export function useSaveTransaction() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TransactionInput }) => {
      const values = {
        category_id: input.categoryId,
        amount_ore: input.amountOre,
        occurred_on: input.occurredOn,
        description: input.description.trim(),
        note: input.note?.trim() || null,
        paid_by_kind: input.paidBy.kind,
        paid_by_user_id: input.paidBy.kind === 'member' ? input.paidBy.userId : null,
      }
      if (id) {
        const { error } = await supabase.from('transactions').update(values).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...values, household_id: hid, source: 'manual' })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    // Via RPC, så en evt. kvittering (og dens billede) slettes sammen med udgiften
    mutationFn: (id: string) => deleteTransactionWithReceipt(id),
    onSuccess: invalidate,
  })
}

export function useCreateCategory() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (input: {
      name: string
      icon: string
      color: string
      kind: CategoryKind
      mode: BudgetMode
      defaultOre: number | null
      percentBp: number | null
    }) => {
      const { data, error } = await supabase.rpc('create_budget_category', {
        p_name: input.name.trim(),
        p_icon: input.icon,
        p_color: input.color,
        p_default_amount_ore: input.mode === 'amount' ? input.defaultOre : null,
        p_valid_from: null,
        p_kind: input.kind,
        p_mode: input.mode,
        p_percent_bp: input.mode === 'percent' ? input.percentBp : null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; icon?: string; color?: string; archived_at?: string | null; kind?: CategoryKind }) => {
      const { error } = await supabase.from('budget_categories').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetCategoryDefault() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (input: { categoryId: string; validFrom: string; mode: BudgetMode; amountOre: number | null; percentBp: number | null }) => {
      const { error } = await supabase.rpc('set_category_default', {
        p_category_id: input.categoryId,
        p_valid_from: input.validFrom,
        p_amount_ore: input.mode === 'amount' ? input.amountOre : null,
        p_mode: input.mode,
        p_percent_bp: input.mode === 'percent' ? input.percentBp : null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetMonthlyBudget() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (input: { categoryId: string; month: string; amountOre: number | null }) => {
      const { error } = await supabase.rpc('set_monthly_budget', {
        p_category_id: input.categoryId,
        p_month: input.month,
        p_amount_ore: input.amountOre,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Opret jeres foreslåede kategorier (uden budget) i ét hug. */
export function useCreateSuggestedCategories() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async (list: Array<{ name: string; icon: string; color: string }>) => {
      for (const c of list) {
        const { error } = await supabase.rpc('create_budget_category', { p_name: c.name, p_icon: c.icon, p_color: c.color })
        if (error && error.code !== '23505') throw error // 23505 = findes allerede
      }
    },
    onSuccess: invalidate,
  })
}

/** Dansk fejltekst ud fra Supabase/Postgres-fejl */
export function errorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const err = e as { code?: string; message?: string } | null
  if (err?.code === '23505') return 'Der findes allerede en kategori med det navn.'
  if (err?.message?.includes('arkiveret')) return 'Kategorien er arkiveret. Vælg en anden.'
  if (err?.message?.includes('indeværende måned')) return 'Standardbudgettet kan kun ændres fra denne måned og frem.'
  if (err?.message?.toLowerCase().includes('fetch')) return 'Ingen forbindelse. Prøv igen.'
  return 'Noget gik galt. Prøv igen.'
}

export const today = () => toIsoDate(new Date())
