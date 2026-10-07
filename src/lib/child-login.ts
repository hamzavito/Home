// Regler for barnelogin i appen. Samme regler som supabase/functions/_shared/child-rules.ts
// og databasen (som er den endelige kontrol).

export const USERNAME_RE = /^[a-z0-9æøå][a-z0-9æøå._-]{1,19}$/

export const normalizeUsername = (s: string) => s.trim().toLowerCase()

/** Hvorfor en PIN ikke kan bruges (null = OK) */
export function pinProblem(pin: string, length: 4 | 6): string | null {
  if (!new RegExp(`^[0-9]{${length}}$`).test(pin)) return `PIN skal være ${length} cifre`
  return null
}

/** Skjulte systemidentiteter for børn vises aldrig i appen */
export const isHiddenEmail = (email: string | null | undefined) => Boolean(email?.endsWith('@internal.home'))
