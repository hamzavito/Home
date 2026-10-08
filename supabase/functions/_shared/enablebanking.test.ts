import { describe, expect, it } from 'vitest'
import { accountForDb, amountToOre, ebJwt, toIngestRow } from './enablebanking'

describe('Enable Banking', () => {
  it('beløb til øre uden kommatalsfejl', () => {
    expect(amountToOre('123.45')).toBe(12345)
    expect(amountToOre('0.1')).toBe(10)
    expect(amountToOre('-12,5')).toBe(-1250)
    expect(amountToOre('1000')).toBe(100000)
    expect(amountToOre('abc')).toBeNull()
    expect(amountToOre('1.234')).toBeNull()
  })

  it('udgift, indtægt, reservation og anden valuta', async () => {
    const out = await toIngestRow(
      { entry_reference: 'r1', transaction_amount: { amount: '50.00', currency: 'DKK' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-10-05', remittance_information: ['NETTO 1234', ' AARHUS'], creditor: { name: 'Netto' }, creditor_account: { iban: 'DK11' } },
      'acc-1',
    )
    expect(out).toMatchObject({ amount_ore: -5000, booked_on: '2026-10-05', description: 'NETTO 1234 AARHUS', counterparty: 'Netto', counterparty_iban: 'DK11', pending: false })
    expect(out!.external_id).toMatch(/^[0-9a-f]{64}$/)
    const ind = await toIngestRow({ transaction_amount: { amount: '25000', currency: 'DKK' }, credit_debit_indicator: 'CRDT', booking_date: '2026-09-30', debtor: { name: 'Arbejdsgiver' } }, 'acc-1')
    expect(ind).toMatchObject({ amount_ore: 2500000, description: 'Arbejdsgiver', counterparty: 'Arbejdsgiver' })
    expect((await toIngestRow({ transaction_amount: { amount: '30', currency: 'DKK' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: '2026-10-05' }, 'a'))!.pending).toBe(true)
    expect(await toIngestRow({ transaction_amount: { amount: '30', currency: 'EUR' }, booking_date: '2026-10-05' }, 'a')).toBeNull()
  })

  it('samme postering giver samme id; forskellige konti forskellige', async () => {
    const t = { entry_reference: 'x', transaction_amount: { amount: '1', currency: 'DKK' }, credit_debit_indicator: 'DBIT', booking_date: '2026-10-01' }
    expect((await toIngestRow(t, 'a'))!.external_id).toBe((await toIngestRow(t, 'a'))!.external_id)
    expect((await toIngestRow(t, 'a'))!.external_id).not.toBe((await toIngestRow(t, 'b'))!.external_id)
  })

  it('kontonavn', () => {
    expect(accountForDb({ uid: 'u', product: 'Lønkonto', account_id: { iban: 'DK1' } })).toEqual({ uid: 'u', name: 'Lønkonto', iban: 'DK1', currency: 'DKK' })
  })

  it('signerer JWT med RS256', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`
    const jwt = await ebJwt('app-123', pem, 1_800_000_000)
    const [h, b, s] = jwt.split('.')
    const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/')))
    expect(dec(h!)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-123' })
    expect(dec(b!)).toEqual({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_800_000_000, exp: 1_800_003_600 })
    const sig = Uint8Array.from(atob(s!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, sig, new TextEncoder().encode(`${h}.${b}`))).toBe(true)
  })
})
