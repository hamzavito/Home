// Temavalg pr. enhed: følg systemet, altid lyst eller altid mørkt.
export type ThemePreference = 'system' | 'light' | 'dark'
const KEY = 'hjem.theme'

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Ingen lagring (fx privat tilstand) – temaet gælder blot denne session.
  }
  // Statuslinjens farve følger appens baggrund.
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', dark ? '#09090b' : '#f4f3ef')
    if (pref !== 'system') m.removeAttribute('media')
  })
}
