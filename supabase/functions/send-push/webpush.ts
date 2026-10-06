// Web Push uden eksterne biblioteker – kun WebCrypto (virker i Deno/Edge Functions og Node).
//   RFC 8291: kryptering af beskeden (aes128gcm) til telefonens nøgler
//   RFC 8292: VAPID – serveren identificerer sig over for Apple/Google med en signeret JWT

export type VapidKeys = {
  /** Offentlig nøgle, ukomprimeret P-256-punkt (65 byte) som base64url – bruges også af appen */
  publicKey: string
  /** Privat nøgle som JWK (gemmes i Supabase Vault) */
  privateJwk: JsonWebKey
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string }

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey, privateJwk: { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, y: privateJwk.y, d: privateJwk.d } }
}

/** RFC 8291: krypterer beskeden, så kun den telefon, der har de private nøgler, kan læse den. */
export async function encryptPayload(
  payload: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  // Kun til test (RFC 8291's testvektor) – ellers nyt tilfældigt salt og nøglepar hver gang
  fixed?: { salt: Uint8Array<ArrayBuffer>; localKeys: CryptoKeyPair },
) {
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const uaPublic = b64urlDecode(target.p256dh)
  const authSecret = b64urlDecode(target.auth)
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Ugyldige nøgler i tilmeldingen')

  const local = fixed?.localKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // Én post: indhold + afgrænser 0x02 (sidste post), ingen udfyldning
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))

  const rs = 4096
  if (payload.length + 1 + 16 > rs) throw new Error('Beskeden er for lang')
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, cipher)
}

/** RFC 8292: kortlivet, signeret JWT til push-tjenesten (Apple/Google/Mozilla). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()) {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', { ...keys.privateJwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto giver signaturen som r||s (64 byte) – præcis det format JWT kræver
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64urlEncode(sig)}, k=${keys.publicKey}`
}

export type PushResult = { ok: boolean; status: number; gone: boolean }

/** Sender én besked. gone = telefonen er afmeldt (404/410) og skal fjernes. */
export async function sendPush(
  target: PushTarget,
  payload: unknown,
  opts: { keys: VapidKeys; subject: string; ttl?: number; urgency?: 'normal' | 'high'; fetch?: typeof fetch },
): Promise<PushResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), target)
  const res = await (opts.fetch ?? fetch)(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, opts.keys, opts.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 3600),
      Urgency: opts.urgency ?? 'high',
    },
    body,
  })
  await res.body?.cancel()
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 }
}
