// Temavalg pr. enhed: følg systemet, altid lyst eller altid mørkt.
export type ThemePreference = 'system' | 'light' | 'dark'
const KEY = 'hjem.theme'
const LIGHT_BG = '#f4f3ef'
const DARK_BG = '#09090b'

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
  // Statuslinjens farve følger appens baggrund. "System" bruger media queries,
  // så farven skifter automatisk med telefonens lyse/mørke tilstand.
  const metas = document.querySelectorAll('meta[name="theme-color"]')
  metas.forEach((m, i) => {
    const forDark = i === 1
    if (pref === 'system') {
      m.setAttribute('media', `(prefers-color-scheme: ${forDark ? 'dark' : 'light'})`)
      m.setAttribute('content', forDark ? DARK_BG : LIGHT_BG)
    } else {
      m.removeAttribute('media')
      m.setAttribute('content', pref === 'dark' ? DARK_BG : LIGHT_BG)
    }
  })
}
