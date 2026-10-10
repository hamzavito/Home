import { describe, expect, it, vi } from 'vitest'
import { handleBank, type BankDeps } from './handler'

function deps(over: Partial<BankDeps> = {}) {
  const rpcCalls: Array<[string, Record<string, unknown>]> = []
  const ebCalls: Array<[string, string, unknown]> = []
  const d: BankDeps = {
    configured: true,
    caller: async () => 'u1',
    isCron: async () => false,
    eb: async (method, path, body) => {
      ebCalls.push([method, path, body])
      if (path.startsWith('/aspsps')) return { aspsps: [{ name: 'Danske Bank', logo: 'x' }, { name: 'Nordea' }] }
      if (path === '/auth') return { url: 'https://tilisy.example/auth' }
      if (path === '/sessions') return { session_id: 'sess-1', accounts: [{ uid: 'acc-1', product: 'Lønkonto', account_id: { iban: 'DK1' } }], access: { valid_until: '2027-04-01T00:00:00Z' } }
      if (path.includes('/transactions')) {
        const first = !path.includes('continuation_key')
        return first
          ? { transactions: [{ entry_reference: 'a', transaction_amount: { amount: '10.00', currency: 'DKK' }, credit_debit_indicator: 'DBIT', booking_date: '2026-10-01' }], continuation_key: 'k2' }
          : { transactions: [
              { entry_reference: 'b', transaction_amount: { amount: '20.00', currency: 'DKK' }, credit_debit_indicator: 'CRDT', booking_date: '2026-10-02' },
              { transaction_amount: { amount: '45.00', currency: 'DKK' }, credit_debit_indicator: 'DBIT', status: 'PDNG', transaction_date: '2026-10-09', creditor: { name: 'Shell' } },
            ] }
      }
      return {}
    },
    rpc: async (fn, args) => {
      rpcCalls.push([fn, args])
      if (fn === 'bank_sync_targets') return [{ connection_id: 'c1', user_id: 'u1', session_id: 's', account_id: 'a1', account_uid: 'acc-1', since: '2026-07-10' }]
      if (fn === 'bank_ingest') return (args.p_rows as unknown[]).length
      if (fn === 'bank_set_pending') return (args.p_rows as unknown[]).length
      if (fn === 'bank_connection_revoke') return 'sess-1'
      if (fn === 'bank_auto_income') return 1
      return null
    },
    randomState: () => 'state-123',
    appUrl: 'https://hjem.test/',
    ...over,
  }
  return { d, rpcCalls, ebCalls }
}

describe('bank', () => {
  it('kræver opsætning og login', async () => {
    expect((await handleBank({ action: 'banks' }, deps({ configured: false }).d)).body.error).toBe('not_configured')
    expect((await handleBank({ action: 'banks' }, deps({ caller: async () => null }).d)).status).toBe(401)
    expect((await handleBank({ action: 'sync-all' }, deps().d)).status).toBe(401)
  })

  it('liste over banker', async () => {
    const r = await handleBank({ action: 'banks' }, deps().d)
    expect(r.body).toEqual({ ok: true, banks: [{ name: 'Danske Bank', logo: 'x' }, { name: 'Nordea', logo: null }] })
  })

  it('forbind: state gemmes først, og banken sender tilbage til appen', async () => {
    const { d, rpcCalls, ebCalls } = deps()
    const r = await handleBank({ action: 'connect', aspsp: 'Danske Bank' }, d)
    expect(r.body).toEqual({ ok: true, url: 'https://tilisy.example/auth' })
    expect(rpcCalls[0]).toEqual(['bank_connection_start', { p_user: 'u1', p_aspsp: 'Danske Bank', p_country: 'DK', p_state: 'state-123' }])
    expect(ebCalls[0]![2]).toMatchObject({ aspsp: { name: 'Danske Bank', country: 'DK' }, state: 'state-123', redirect_url: 'https://hjem.test/bank/callback', psu_type: 'personal' })
  })

  it('skrivebeskyttet abonnement: kan ikke forbinde', async () => {
    const r = await handleBank({ action: 'connect', aspsp: 'Nordea' }, deps({ rpc: async () => Promise.reject({ code: 'PT402' }) }).d)
    expect(r).toEqual({ status: 402, body: { ok: false, error: 'read_only' } })
  })

  it('tilbagekald: session → konti → første hentning (alle sider)', async () => {
    const { d, rpcCalls } = deps()
    const r = await handleBank({ action: 'callback', code: 'c', state: 'state-123' }, d)
    expect(r.body).toMatchObject({ ok: true, accounts: 1, imported: 2, failed: 0, income: 1, pending: 1 })
    // Indtægter godkendes efter alle konti (sidste kald)
    expect(rpcCalls.at(-1)).toEqual(['bank_auto_income', { p_user: 'u1' }])
    const act = rpcCalls.find(([f]) => f === 'bank_connection_activate')![1]
    expect(act).toMatchObject({ p_session: 'sess-1', p_valid_until: '2027-04-01T00:00:00Z', p_accounts: [{ uid: 'acc-1', name: 'Lønkonto', iban: 'DK1', currency: 'DKK' }] })
    expect(rpcCalls.filter(([f]) => f === 'bank_ingest')).toHaveLength(2)
    // Reservationen indlæses ikke som postering, men gemmes som reservation
    expect(rpcCalls.flatMap(([f, a]) => (f === 'bank_ingest' ? (a.p_rows as Array<{ pending: boolean }>) : [])).every((x) => !x.pending)).toBe(true)
    const pend = rpcCalls.find(([f]) => f === 'bank_set_pending')![1]
    expect(pend).toMatchObject({ p_account_id: 'a1', p_rows: [{ amount_ore: -4500, counterparty: 'Shell', booked_on: '2026-10-09', pending: true }] })
    expect(rpcCalls.find(([f]) => f === 'bank_mark_synced')![1]).toEqual({ p_connection: 'c1', p_error: null })
  })

  it('tilbagekald uden konti: ikke forbundet, sessionen lukkes', async () => {
    const base = deps()
    const eb = vi.fn(async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => (path === '/sessions' ? { session_id: 'sess-0', accounts: [] } : base.d.eb(method, path, body)))
    const { d, rpcCalls } = deps({ eb })
    const r = await handleBank({ action: 'callback', code: 'c', state: 'state-123' }, d)
    expect(r).toEqual({ status: 409, body: { ok: false, error: 'no_accounts' } })
    expect(rpcCalls.find(([f]) => f === 'bank_connection_activate')).toBeUndefined()
    expect(eb).toHaveBeenCalledWith('DELETE', '/sessions/sess-0')
  })

  it('fejl hos banken gemmes på forbindelsen', async () => {
    const { d, rpcCalls } = deps({ eb: async () => Promise.reject(new Error('Enable Banking 429: limit')) })
    const r = await handleBank({ action: 'sync' }, d)
    expect(r.body).toMatchObject({ ok: true, imported: 0, failed: 1 })
    expect(rpcCalls.find(([f]) => f === 'bank_mark_synced')![1]).toEqual({ p_connection: 'c1', p_error: 'Enable Banking 429: limit' })
  })

  it('reservationer: fejl ved gemning stopper ikke hentningen', async () => {
    const base = deps()
    const { d } = deps({ rpc: async (fn, args) => (fn === 'bank_set_pending' ? Promise.reject(new Error('mangler')) : base.d.rpc(fn, args)) })
    const r = await handleBank({ action: 'sync' }, d)
    expect(r.body).toMatchObject({ ok: true, imported: 2, failed: 0, pending: 0 })
  })

  it('dagligt job med hemmelighed', async () => {
    const r = await handleBank({ action: 'sync-all' }, deps({ isCron: async () => true, caller: async () => null }).d)
    expect(r.body).toMatchObject({ ok: true, imported: 2, income: 1 })
  })

  it('fjern: lukker også sessionen hos banken', async () => {
    const del = vi.fn(async () => ({}))
    const { d } = deps({ eb: del })
    expect((await handleBank({ action: 'disconnect', id: 'c1' }, d)).body).toEqual({ ok: true })
    expect(del).toHaveBeenCalledWith('DELETE', '/sessions/sess-1')
  })
})
