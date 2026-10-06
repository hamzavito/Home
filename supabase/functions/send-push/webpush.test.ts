import { describe, expect, it, vi } from 'vitest'
import { b64urlDecode, b64urlEncode, encryptPayload, generateVapidKeys, sendPush, vapidAuthorization } from './webpush'

const enc = new TextEncoder()

/** Telefonens side: nøglepar + auth-hemmelighed, som en browser laver ved tilmelding */
async function makeSubscriber() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { pair, pub, auth, p256dh: b64urlEncode(pub), authB64: b64urlEncode(auth) }
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8))
}

/** Dekrypterer som browseren gør (RFC 8291/8188) – uafhængig af koden der testes */
async function decrypt(body: Uint8Array, sub: Awaited<ReturnType<typeof makeSubscriber>>) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]!
  const asPub = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  expect(rs).toBe(4096)
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, sub.pair.privateKey, 256))
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...sub.pub, ...asPub])
  const ikm = await hkdf(sub.auth, shared, info, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher))
  expect(plain[plain.length - 1]).toBe(2) // sidste post
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('Web Push', () => {
  it('base64url frem og tilbage', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1])
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/)
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes)
  })

  it('krypteret besked kan kun læses af telefonen (aes128gcm)', async () => {
    const sub = await makeSubscriber()
    const text = JSON.stringify({ title: 'Tandlæge', body: 'I dag kl. 14.00 – æøå 🦷' })
    const body = await encryptPayload(enc.encode(text), { p256dh: sub.p256dh, auth: sub.authB64 })
    expect(await decrypt(body, sub)).toBe(text)

    // En anden telefon kan ikke læse den
    const other = await makeSubscriber()
    await expect(decrypt(body, { ...other, pub: sub.pub, auth: sub.auth })).rejects.toThrow()
  })

  it('matcher testvektoren i RFC 8291, appendiks A', async () => {
    const asPublic = b64urlDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8')
    const jwk = { kty: 'EC', crv: 'P-256', x: b64urlEncode(asPublic.slice(1, 33)), y: b64urlEncode(asPublic.slice(33)), d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' }
    const localKeys = {
      privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    }
    const body = await encryptPayload(
      b64urlDecode('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), localKeys },
    )
    expect(b64urlEncode(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })

  it('afviser ugyldige nøgler', async () => {
    await expect(encryptPayload(enc.encode('x'), { p256dh: 'AAAA', auth: 'AAAA' })).rejects.toThrow(/Ugyldige/)
  })

  it('VAPID-JWT er signeret med den private nøgle og har korrekte claims', async () => {
    const keys = await generateVapidKeys()
    expect(b64urlDecode(keys.publicKey)).toHaveLength(65)
    expect(keys.privateJwk.d).toBeTruthy()

    const now = Date.UTC(2026, 9, 6, 12)
    const header = await vapidAuthorization('https://web.push.apple.com/QGx1Zm9v', keys, 'https://hjem.example', now)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
    expect(m).toBeTruthy()
    expect(m[4]).toBe(keys.publicKey)
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(m[1]!)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(m[2]!)))).toEqual({ aud: 'https://web.push.apple.com', exp: now / 1000 + 12 * 3600, sub: 'https://hjem.example' })

    const pub = await crypto.subtle.importKey('raw', b64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const sig = b64urlDecode(m[3]!)
    expect(sig).toHaveLength(64)
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, enc.encode(`${m[1]}.${m[2]}`))).toBe(true)
  })

  it('sender med de rigtige headers og genkender afmeldte telefoner', async () => {
    const keys = await generateVapidKeys()
    const sub = await makeSubscriber()
    const target = { endpoint: 'https://push.example/abc', p256dh: sub.p256dh, auth: sub.authB64 }
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    const ok = await sendPush(target, { title: 'Hej' }, { keys, subject: 'mailto:a@b.dk', ttl: 60, fetch: fetchMock as unknown as typeof fetch })
    expect(ok).toEqual({ ok: true, status: 201, gone: false })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://push.example/abc')
    const h = init.headers as Record<string, string>
    expect(h['Content-Encoding']).toBe('aes128gcm')
    expect(h.TTL).toBe('60')
    expect(h.Authorization).toMatch(/^vapid t=/)
    expect(JSON.parse(await decrypt(init.body as Uint8Array, sub))).toEqual({ title: 'Hej' })

    for (const status of [404, 410]) {
      const r = await sendPush(target, {}, { keys, subject: 'mailto:a@b.dk', fetch: (async () => new Response(null, { status })) as typeof fetch })
      expect(r).toEqual({ ok: false, status, gone: true })
    }
    const r = await sendPush(target, {}, { keys, subject: 'mailto:a@b.dk', fetch: (async () => new Response(null, { status: 429 })) as typeof fetch })
    expect(r.gone).toBe(false)
  })
})
