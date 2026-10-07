// Regler for barnelogin. Samme regler håndhæves i databasen (private.valid_pin m.fl.) –
// her bruges de kun til at afvise åbenlyst forkerte input tidligt.

export const USERNAME_RE = /^[a-z0-9æøå][a-z0-9æøå._-]{1,19}$/

export const normalizeCode = (s: string) => s.replace(/\s/g, '').toUpperCase()
export const normalizeUsername = (s: string) => s.trim().toLowerCase()

/** 4 eller 6 cifre og ikke let at gætte (fx 0000, 123456, 654321) */
export function isValidPin(pin: string, length: number): boolean {
  if (length !== 4 && length !== 6) return false
  if (!new RegExp(`^[0-9]{${length}}$`).test(pin)) return false
  if (/^(.)\1+$/.test(pin)) return false
  if ('01234567890123'.includes(pin) || '98765432109876'.includes(pin)) return false
  return true
}

export function isValidName(name: string): boolean {
  const n = name.trim()
  return n.length >= 1 && n.length <= 40
}
