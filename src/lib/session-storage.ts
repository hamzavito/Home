// "Husk mig": Supabase-sessionen gemmes i localStorage (overlever at appen
// lukkes) eller i sessionStorage (glemmes når appen/fanen lukkes).

const REMEMBER_KEY = 'hjem.remember'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function getRememberMe(): boolean {
  return safe(() => localStorage.getItem(REMEMBER_KEY) !== 'false', true)
}

export function setRememberMe(remember: boolean) {
  safe(() => localStorage.setItem(REMEMBER_KEY, String(remember)), undefined)
}

export const authStorage = {
  getItem(key: string): string | null {
    return safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null)
  },
  setItem(key: string, value: string) {
    safe(() => {
      if (getRememberMe()) {
        localStorage.setItem(key, value)
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, value)
        localStorage.removeItem(key)
      }
    }, undefined)
  },
  removeItem(key: string) {
    safe(() => {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }, undefined)
  },
}
