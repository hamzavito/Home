// Bankforbindelse: vælg bank, forbind (MitID hos banken), hent posteringer, fjern.
// Al kommunikation med Enable Banking sker her; appen ser kun resultatet.
import { accountForDb, toIngestRow, type EbAccount, type EbTransaction, type IngestRow } from '../_shared/enablebanking.ts'

export type SyncTarget = { connection_id: string; user_id: string; session_id: string; account_id: string; account_uid: string; since: string }

export type BankDeps = {
  caller: () => Promise<string | null>
  /** Kaldet fra det daglige job (hemmelighed i header) */
  isCron: () => Promise<boolean>
  configured: boolean
  eb: (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => Promise<Record<string, unknown>>
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>
  randomState: () => string
  appUrl: string
  log?: (msg: string) => void
}

type Err = 'unauthorized' | 'not_configured' | 'bad_request' | 'not_allowed' | 'read_only' | 'not_found' | 'bank_error' | 'server'
export type BankResponse = { status: number; body: Record<string, unknown> & { ok: boolean; error?: Err } }

const fail = (status: number, error: Err): BankResponse => ({ status, body: { ok: false, error } })
const MAX_PAGES = 20

function dbError(e: unknown): BankResponse {
  const code = (e as { code?: string } | null)?.code
  if (code === 'PT402') return fail(402, 'read_only')
  if (code === '42501') return fail(403, 'not_allowed')
  if (code === 'P0002') return fail(404, 'not_found')
  return fail(500, 'server')
}

async function syncTargets(deps: BankDeps, targets: SyncTarget[]): Promise<{ imported: number; failed: number; pending: number }> {
  let imported = 0
  let failed = 0
  let pending = 0
  const errors = new Map<string, string | null>()
  for (const t of targets) {
    try {
      let key: string | undefined
      const reserved: IngestRow[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const q = new URLSearchParams({ date_from: t.since })
        if (key) q.set('continuation_key', key)
        const res = await deps.eb('GET', `/accounts/${encodeURIComponent(t.account_uid)}/transactions?${q}`)
        const rows = (await Promise.all(((res.transactions ?? []) as EbTransaction[]).map((x) => toIngestRow(x, t.account_uid)))).filter((r): r is IngestRow => r !== null)
        reserved.push(...rows.filter((r) => r.pending))
        const booked = rows.filter((r) => !r.pending)
        if (booked.length) imported += Number(await deps.rpc('bank_ingest', { p_account_id: t.account_id, p_rows: booked })) || 0
        key = typeof res.continuation_key === 'string' && res.continuation_key ? res.continuation_key : undefined
        if (!key) break
      }
      // Reservationer (kortkøb, der ikke er bogført endnu) vises med det samme – listen erstattes hver gang
      try {
        pending += Number(await deps.rpc('bank_set_pending', { p_account_id: t.account_id, p_rows: reserved })) || 0
      } catch (e) {
        deps.log?.(`reservationer ${t.account_id}: ${(e as Error)?.message}`)
      }
      if (!errors.has(t.connection_id)) errors.set(t.connection_id, null)
    } catch (e) {
      failed++
      errors.set(t.connection_id, String((e as Error)?.message ?? 'fejl').slice(0, 300))
      deps.log?.(`sync ${t.account_id}: ${(e as Error)?.message}`)
    }
  }
  for (const [id, err] of errors) await deps.rpc('bank_mark_synced', { p_connection: id, p_error: err }).catch(() => {})
  return { imported, failed, pending }
}

/** Indtægter godkendes automatisk – efter at ALLE konti er hentet, så overførsler mellem egne konti er parret først */
async function autoIncome(deps: BankDeps, user: string | null): Promise<number> {
  try {
    return Number(await deps.rpc('bank_auto_income', { p_user: user })) || 0
  } catch (e) {
    deps.log?.(`indtægter: ${(e as Error)?.message}`)
    return 0
  }
}

export async function handleBank(body: unknown, deps: BankDeps): Promise<BankResponse> {
  const b = (body ?? {}) as Record<string, unknown>
  if (!deps.configured) return fail(503, 'not_configured')

  if (b.action === 'sync-all') {
    if (!(await deps.isCron().catch(() => false))) return fail(401, 'unauthorized')
    const targets = (await deps.rpc('bank_sync_targets', { p_user: null })) as SyncTarget[]
    const r = await syncTargets(deps, targets ?? [])
    const income = await autoIncome(deps, null)
    return { status: 200, body: { ok: true, ...r, income } }
  }

  const user = await deps.caller().catch(() => null)
  if (!user) return fail(401, 'unauthorized')
  const back = deps.appUrl.replace(/\/$/, '')

  try {
    switch (b.action) {
      case 'banks': {
        const res = await deps.eb('GET', '/aspsps?country=DK&psu_type=personal')
        const banks = ((res.aspsps ?? []) as Array<{ name: string; logo?: string }>).map((a) => ({ name: a.name, logo: a.logo ?? null }))
        return { status: 200, body: { ok: true, banks } }
      }
      case 'connect': {
        const name = typeof b.aspsp === 'string' ? b.aspsp.trim() : ''
        if (!name || name.length > 120) return fail(400, 'bad_request')
        const state = deps.randomState()
        try {
          await deps.rpc('bank_connection_start', { p_user: user, p_aspsp: name, p_country: 'DK', p_state: state })
        } catch (e) {
          return dbError(e)
        }
        const validUntil = new Date(Date.now() + 179 * 86_400_000).toISOString()
        const res = await deps.eb('POST', '/auth', {
          access: { valid_until: validUntil },
          aspsp: { name, country: 'DK' },
          state,
          redirect_url: `${back}/bank/callback`,
          psu_type: 'personal',
        })
        return { status: 200, body: { ok: true, url: String(res.url) } }
      }
      case 'callback': {
        const code = typeof b.code === 'string' ? b.code : ''
        const state = typeof b.state === 'string' ? b.state : ''
        if (!code || !state) return fail(400, 'bad_request')
        const session = await deps.eb('POST', '/sessions', { code })
        const accounts = ((session.accounts ?? []) as EbAccount[]).map(accountForDb)
        const validUntil = (session.access as { valid_until?: string } | undefined)?.valid_until ?? new Date(Date.now() + 179 * 86_400_000).toISOString()
        try {
          await deps.rpc('bank_connection_activate', { p_user: user, p_state: state, p_session: String(session.session_id), p_valid_until: validUntil, p_accounts: accounts })
        } catch (e) {
          return dbError(e)
        }
        const targets = (await deps.rpc('bank_sync_targets', { p_user: user })) as SyncTarget[]
        const r = await syncTargets(deps, targets ?? [])
        const income = await autoIncome(deps, user)
        return { status: 200, body: { ok: true, accounts: accounts.length, ...r, income } }
      }
      case 'sync': {
        const targets = (await deps.rpc('bank_sync_targets', { p_user: user })) as SyncTarget[]
        const r = await syncTargets(deps, targets ?? [])
        const income = await autoIncome(deps, user)
        return { status: 200, body: { ok: true, ...r, income } }
      }
      case 'disconnect': {
        if (typeof b.id !== 'string') return fail(400, 'bad_request')
        let session: unknown
        try {
          session = await deps.rpc('bank_connection_revoke', { p_user: user, p_id: b.id })
        } catch (e) {
          return dbError(e)
        }
        // Luk også adgangen hos banken (fejler det, udløber den selv)
        if (typeof session === 'string' && session) await deps.eb('DELETE', `/sessions/${encodeURIComponent(session)}`).catch(() => {})
        return { status: 200, body: { ok: true } }
      }
    }
  } catch (e) {
    deps.log?.(`bank: ${(e as Error)?.message}`)
    return fail(502, 'bank_error')
  }
  return fail(400, 'bad_request')
}
