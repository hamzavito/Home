// Invitationer til husstanden: 8 letlæselige tegn (ingen 0/O, 1/I/L), vises som ABCD-EFGH.
// Koden sendes som link (…/invitation/ABCDEFGH) eller skrives i appen.

export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const INVITE_RE = new RegExp(`^[${INVITE_ALPHABET}]{8}$`)
const PENDING_KEY = 'hjem.invite'

/** Store bogstaver uden mellemrum og bindestreger. Tager også et helt link. */
export function normalizeInviteCode(input: string): string {
  const fromLink = input.match(/invitation\/([A-Za-z0-9-]+)/)?.[1] ?? input
  return fromLink.toUpperCase().replace(/[\s-]/g, '')
}

export const isValidInviteCode = (code: string) => INVITE_RE.test(normalizeInviteCode(code))

export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code)
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

export const inviteLink = (code: string, origin = window.location.origin) => `${origin}/invitation/${normalizeInviteCode(code)}`

/** En invitation, man har åbnet før login, huskes til efter login */
export function savePendingInvite(code: string) {
  try {
    localStorage.setItem(PENDING_KEY, normalizeInviteCode(code))
  } catch {
    /* ingen lagring – koden kan skrives igen */
  }
}
export function readPendingInvite(): string | null {
  try {
    const c = localStorage.getItem(PENDING_KEY)
    return c && isValidInviteCode(c) ? c : null
  } catch {
    return null
  }
}
export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignorér */
  }
}
