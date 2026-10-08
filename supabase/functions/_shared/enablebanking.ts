// Enable Banking (PSD2-kontoinformation) uden SDK. Rene funktioner, så de kan unit-testes.
// API: https://api.enablebanking.com  ·  Autentificering: JWT (RS256) signeret med appens private nøgle.

export const EB_API = 'https://api.enablebanking.com'

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Kortlivet JWT til Enable Banking (højst 24 t; vi bruger 1 t) */
export async function ebJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const head = b64urlJson({ typ: 'JWT', alg: 'RS256', kid: appId })
  const body = b64urlJson({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: nowSeconds, exp: nowSeconds + 3600 })
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(sig)}`
}

/** "123.45" / "-12,5" → øre (heltal, uden kommatalsfejl) */
export function amountToOre(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null
  const m = /^\s*(-?)(\d+)(?:[.,](\d{1,2}))?\s*$/.exec(String(s))
  if (!m) return null
  const ore = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'))
  return m[1] ? -ore : ore
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type EbTransaction = {
  entry_reference?: string | null
  transaction_id?: string | null
  transaction_amount?: { amount?: string; currency?: string }
  credit_debit_indicator?: 'CRDT' | 'DBIT' | string
  status?: string
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  remittance_information?: string[] | null
  creditor?: { name?: string | null } | null
  debtor?: { name?: string | null } | null
  creditor_account?: { iban?: string | null } | null
  debtor_account?: { iban?: string | null } | null
}

export type IngestRow = {
  external_id: string
  booked_on: string
  amount_ore: number
  description: string
  counterparty: string | null
  counterparty_iban: string | null
  pending: boolean
}

/** Én bankpostering → det, vi gemmer. null = springes over (fx anden valuta eller ugyldig). */
export async function toIngestRow(t: EbTransaction, accountUid: string): Promise<IngestRow | null> {
  const currency = t.transaction_amount?.currency ?? 'DKK'
  if (currency !== 'DKK') return null
  const raw = amountToOre(t.transaction_amount?.amount)
  if (raw === null || raw === 0) return null
  const debit = t.credit_debit_indicator ? t.credit_debit_indicator === 'DBIT' : raw < 0
  const amount = debit ? -Math.abs(raw) : Math.abs(raw)
  const booked = t.booking_date ?? t.value_date ?? t.transaction_date
  if (!booked || !/^\d{4}-\d{2}-\d{2}/.test(booked)) return null
  const counterparty = (debit ? t.creditor?.name : t.debtor?.name)?.trim() || null
  const iban = (debit ? t.creditor_account?.iban : t.debtor_account?.iban)?.trim() || null
  const text = (t.remittance_information ?? []).join(' ').replace(/\s+/g, ' ').trim()
  const ref = t.entry_reference || t.transaction_id || `${booked}|${t.transaction_amount?.amount}|${t.credit_debit_indicator ?? ''}|${text}`
  return {
    external_id: await sha256Hex(`${accountUid}|${ref}`),
    booked_on: booked.slice(0, 10),
    amount_ore: amount,
    description: (text || counterparty || 'Postering').slice(0, 140),
    counterparty: counterparty?.slice(0, 140) ?? null,
    counterparty_iban: iban,
    pending: Boolean(t.status && t.status !== 'BOOK'),
  }
}

export type EbAccount = { uid: string; name?: string | null; product?: string | null; details?: string | null; currency?: string | null; account_id?: { iban?: string | null } | null }

export const accountForDb = (a: EbAccount) => ({
  uid: a.uid,
  name: (a.name || a.product || a.details || 'Konto').slice(0, 120),
  iban: a.account_id?.iban ?? null,
  currency: a.currency ?? 'DKK',
})
