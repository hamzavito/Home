import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { compressReceiptImage, rotateImage } from '@/lib/image'
import { toDkIsoDate } from '@/lib/retention'
import { supabase } from '@/lib/supabase'
import type { PaidByKind, ReceiptRetention, Tables } from '@/types/database'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type Receipt = Tables<'receipts'>
export type Transaction = Tables<'transactions'>
export type ReceiptWithTransaction = Receipt & { transaction: Transaction | null }

const BUCKET = 'receipts'
/** Signerede URL'er lever kort – billederne er aldrig offentlige */
export const SIGNED_URL_SECONDS = 300

const keys = {
  list: (hid: string) => ['finance', hid, 'receipts', 'list'] as const,
  one: (id: string) => ['finance', 'receipts', 'one', id] as const,
  byTransaction: (txId: string) => ['finance', 'receipts', 'by-tx', txId] as const,
  signed: (paths: string[]) => ['receipt-images', ...paths] as const,
}

async function attachTransactions(receipts: Receipt[]): Promise<ReceiptWithTransaction[]> {
  const ids = receipts.map((r) => r.transaction_id).filter((x): x is string => Boolean(x))
  if (ids.length === 0) return receipts.map((r) => ({ ...r, transaction: null }))
  const { data, error } = await supabase.from('transactions').select('*').in('id', ids)
  if (error) throw error
  const byId = new Map(data.map((t) => [t.id, t]))
  return receipts.map((r) => ({ ...r, transaction: (r.transaction_id && byId.get(r.transaction_id)) || null }))
}

// ---------------------------------------------------------------- queries

export function useReceipts() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.list(hid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return attachTransactions(data)
    },
  })
}

export function useReceipt(id: string | undefined) {
  return useQuery({
    queryKey: keys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('receipts').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      if (!data) return null
      return (await attachTransactions([data]))[0]!
    },
  })
}

export function useReceiptForTransaction(txId: string | undefined) {
  return useQuery({
    queryKey: keys.byTransaction(txId ?? ''),
    enabled: Boolean(txId),
    queryFn: async () => {
      const { data, error } = await supabase.from('receipts').select('*').eq('transaction_id', txId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Korttidsgyldige signerede URL'er til billeder (én forespørgsel for mange billeder). */
export function useSignedUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort()
  return useQuery({
    queryKey: keys.signed(sorted),
    enabled: sorted.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 60) * 1000,
    gcTime: (SIGNED_URL_SECONDS - 30) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(sorted, SIGNED_URL_SECONDS)
      if (error) throw error
      const map = new Map<string, string>()
      for (const item of data) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl)
      return map
    },
  })
}

// ---------------------------------------------------------------- scan-flowet

export async function createPendingReceipt(): Promise<{ receiptId: string; path: string }> {
  const { data, error } = await supabase.rpc('create_pending_receipt')
  if (error) throw error
  const row = data[0]
  if (!row) throw new Error('Kunne ikke oprette kvittering')
  return { receiptId: row.receipt_id, path: row.storage_path }
}

export async function uploadReceiptImage(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
    cacheControl: '3600',
  })
  // "Duplicate"/409: billedet er allerede uploadet (genforsøg) – det er fint
  if (error && !/exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) throw error
}

/**
 * Annullér en ventende kvittering: slet først billedet, derefter rækken.
 * Fejler noget, rydder den daglige oprydning op efter 24 timer.
 */
export async function discardPendingReceipt(receiptId: string, path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
  await supabase.from('receipts').delete().eq('id', receiptId).eq('status', 'pending')
}

export async function suggestCategory(merchant: string): Promise<string | null> {
  if (!merchant.trim()) return null
  const { data, error } = await supabase.rpc('suggest_category', { p_merchant: merchant.trim() })
  if (error) return null
  return data ?? null
}

export type ApproveInput = {
  receiptId: string
  categoryId: string
  amountOre: number
  occurredOn: string
  description: string
  note: string | null
  paidBy: { kind: PaidByKind; userId: string | null }
  retention: ReceiptRetention
  customDate: string | null
}

export function useApproveReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ApproveInput) => {
      const { data, error } = await supabase.rpc('approve_receipt', {
        p_receipt_id: input.receiptId,
        p_category_id: input.categoryId,
        p_amount_ore: input.amountOre,
        p_occurred_on: input.occurredOn,
        p_description: input.description.trim(),
        p_note: input.note?.trim() || null,
        p_paid_by_kind: input.paidBy.kind,
        p_paid_by_user_id: input.paidBy.kind === 'member' ? input.paidBy.userId : null,
        p_retention: input.retention,
        p_custom_date: input.retention === 'custom' ? input.customDate : null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  })
}

export function useSetRetention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { receiptId: string; retention: ReceiptRetention; customDate: string | null }) => {
      const { error } = await supabase.rpc('set_receipt_retention', {
        p_receipt_id: input.receiptId,
        p_retention: input.retention,
        p_custom_date: input.retention === 'custom' ? input.customDate : null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  })
}

// ---------------------------------------------------------------- billede på en eksisterende udgift

/** Upload et nyt billede og knyt det til udgiften. En eventuel tidligere kvittering erstattes. */
async function attachImage(transactionId: string, blob: Blob, retention: ReceiptRetention, customDate: string | null): Promise<void> {
  const { receiptId, path } = await createPendingReceipt()
  try {
    await uploadReceiptImage(path, blob)
    const { data: oldPath, error } = await supabase.rpc('attach_receipt', {
      p_receipt_id: receiptId,
      p_transaction_id: transactionId,
      p_retention: retention,
      p_custom_date: retention === 'custom' ? customDate : null,
    })
    if (error) throw error
    // Fejler dette, er filen forældreløs og fjernes af den daglige oprydning
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {})
  } catch (e) {
    await discardPendingReceipt(receiptId, path).catch(() => {})
    throw e
  }
}

/** Behold den nuværende opbevaring ved udskiftning; ellers husstandens standard. */
function retentionFor(current: Receipt | null | undefined, fallback: ReceiptRetention): { retention: ReceiptRetention; customDate: string | null } {
  if (!current?.retention) return { retention: fallback, customDate: null }
  if (current.retention !== 'custom') return { retention: current.retention, customDate: null }
  const d = current.delete_at ? toDkIsoDate(current.delete_at) : null
  const today = toDkIsoDate(new Date().toISOString())
  return d && d > today ? { retention: 'custom', customDate: d } : { retention: fallback, customDate: null }
}

function invalidateReceipts(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([qc.invalidateQueries({ queryKey: ['finance'] }), qc.invalidateQueries({ queryKey: ['receipt-images'] })])
}

/** Tilføj eller udskift kvitteringsbilledet på en udgift. */
export function useAttachReceiptImage() {
  const qc = useQueryClient()
  const { defaultRetention } = useHousehold()
  return useMutation({
    mutationFn: async (input: { transactionId: string; file: Blob; current?: Receipt | null }) => {
      const { blob } = await compressReceiptImage(input.file)
      const r = retentionFor(input.current, defaultRetention)
      await attachImage(input.transactionId, blob, r.retention, r.customDate)
    },
    onSettled: () => invalidateReceipts(qc),
  })
}

/** Drej billedet 90° med uret og gem det som erstatning for det gamle. */
export function useRotateReceiptImage() {
  const qc = useQueryClient()
  const { defaultRetention } = useHousehold()
  return useMutation({
    mutationFn: async (receipt: Receipt) => {
      if (!receipt.storage_path || !receipt.transaction_id) throw new Error('Billedet er allerede slettet')
      const { data, error } = await supabase.storage.from(BUCKET).download(receipt.storage_path)
      if (error) throw error
      const rotated = await rotateImage(data)
      const r = retentionFor(receipt, defaultRetention)
      await attachImage(receipt.transaction_id, rotated, r.retention, r.customDate)
    },
    onSettled: () => invalidateReceipts(qc),
  })
}

/** Fjern billedet. Udgiften bevares. */
export function useRemoveReceiptImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { data: path, error } = await supabase.rpc('remove_receipt_image', { p_receipt_id: receiptId })
      if (error) throw error
      if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    },
    onSettled: () => invalidateReceipts(qc),
  })
}

/** Slet en udgift – og dens kvittering + billede, hvis der er en. */
export async function deleteTransactionWithReceipt(transactionId: string): Promise<void> {
  const { data: path, error } = await supabase.rpc('delete_transaction', { p_transaction_id: transactionId })
  if (error) throw error
  if (path) {
    // Fejler dette, er filen forældreløs og fjernes af den daglige oprydning
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
  }
}

export function receiptErrorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const err = e as { code?: string; message?: string } | null
  const msg = err?.message ?? ''
  if (msg.includes('ikke uploadet')) return 'Billedet er ikke færdig med at uploade. Vent et øjeblik og prøv igen.'
  if (msg.includes('arkiveret')) return 'Kategorien er arkiveret. Vælg en anden.'
  if (msg.includes('efter i dag')) return 'Vælg en sletningsdato efter i dag.'
  if (msg.includes('For mange')) return msg
  if (msg.includes('allerede slettet')) return 'Billedet er allerede slettet.'
  if (msg.includes('kunne ikke læses')) return msg
  if (/fetch|network|Failed/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  return 'Noget gik galt. Prøv igen.'
}
