// Notifikationer (Web Push) på denne enhed.
// iPhone: kræver iOS 16.4+ og at Hjem er føjet til hjemmeskærmen og åbnet derfra.
import { supabase } from '@/lib/supabase'

export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function pushSupport(): PushSupport {
  const api = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  // På iPhone findes push-API'et kun i den installerede app (ikke i Safari)
  if (isAppleMobile() && !isStandalone()) return 'needs-install'
  return api ? 'supported' : 'unsupported'
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

async function registration() {
  // Service workeren registreres af appen ved start; vent højst 10 sek.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Service worker er ikke klar')), 10_000)),
  ])
}

async function currentSubscription() {
  if (pushSupport() !== 'supported') return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Ufuldstændig tilmelding')
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth })
  if (error) throw error
}

export class PushSetupError extends Error {}

/**
 * Slår notifikationer til på denne enhed. Skal kaldes direkte fra et tryk
 * (iPhone viser kun tilladelsesdialogen ved en brugerhandling).
 */
export async function enablePush(): Promise<NotificationPermission> {
  const result = await Notification.requestPermission()
  if (result !== 'granted') return result
  const { data: key, error } = await supabase.rpc('push_public_key')
  if (error) throw error
  if (!key) throw new PushSetupError('Notifikationer er ikke sat op på serveren endnu.')
  const serverKey = urlBase64ToUint8Array(key)
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options.applicationServerKey, serverKey)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey })
  await saveSubscription(sub)
  return result
}

/** Slår notifikationer fra på denne enhed (også ved log ud). */
export async function disablePush() {
  if (permission() !== 'granted') return
  const sub = await currentSubscription()
  if (!sub) return
  try {
    await supabase.rpc('disable_push_subscription', { p_endpoint: sub.endpoint })
  } finally {
    await sub.unsubscribe().catch(() => false)
  }
}

/** Er denne enhed tilmeldt? (tilladelse givet + aktiv tilmelding i browseren) */
export async function isPushEnabled() {
  if (permission() !== 'granted') return false
  return (await currentSubscription().catch(() => null)) !== null
}

/**
 * Ved app-start: forny tilmeldingen på serveren (fx hvis Apple har givet en ny,
 * eller hvis telefonen blev afmeldt efter en fejl). Gør intet uden tilladelse.
 */
export async function refreshPushSubscription() {
  if (permission() !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await saveSubscription(sub)
}
