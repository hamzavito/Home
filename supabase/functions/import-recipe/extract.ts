// Finder en opskrift i en websides HTML via schema.org/Recipe (JSON-LD), som de fleste
// opskriftssider bruger (Arla, Valdemarsro, Mummum …). Ren funktion – testbar uden netværk.

export type ImportedRecipe = {
  name: string
  description: string | null
  servings: number | null
  prepMinutes: number | null
  /** Ingredienslinjer som tekst, fx "700 g kyllingebryst" (fortolkes i appen) */
  ingredients: string[]
  steps: string | null
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Tekst uden HTML-tags og med pæne mellemrum */
function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = decodeEntities(v.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
  return s ? s.slice(0, max) : null
}

function isRecipe(o: Json): o is { [k: string]: Json } {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const t = o['@type'] ?? o['type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

/** Gennemsøg JSON (inkl. @graph og lister) efter et Recipe-objekt */
function findRecipe(o: Json, depth = 0): { [k: string]: Json } | null {
  if (depth > 8 || o === null || typeof o !== 'object') return null
  if (isRecipe(o)) return o
  const children: Json[] = Array.isArray(o) ? o : (Object.values(o) as Json[])
  for (const c of children) {
    const r = findRecipe(c, depth + 1)
    if (r) return r
  }
  return null
}

/** ISO 8601-varighed → minutter: "PT1H30M" → 90 */
export function durationMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim())
  if (!m) return null
  const min = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60)
  return min > 0 && min <= 1440 ? min : null
}

/** "4 personer" · 4 · ["4", "4 portioner"] → 4 */
export function servingsFrom(v: unknown): number | null {
  const first = Array.isArray(v) ? v[0] : v
  const n = typeof first === 'number' ? first : typeof first === 'string' ? Number(/\d+/.exec(first)?.[0]) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}

/** Fremgangsmåde: tekst, liste af tekster, HowToStep og HowToSection → nummererede linjer */
export function stepsFrom(v: Json): string | null {
  const out: string[] = []
  const walk = (x: Json, depth: number) => {
    if (depth > 5 || x === null) return
    if (typeof x === 'string') {
      for (const line of (clean(x, 5000) ?? '').split('\n')) if (line.trim()) out.push(line.trim())
      return
    }
    if (Array.isArray(x)) return x.forEach((y) => walk(y, depth + 1))
    if (typeof x === 'object') {
      if (x.itemListElement) return walk(x.itemListElement, depth + 1)
      const t = clean(x.text ?? x.name ?? null, 5000)
      if (t) out.push(t)
    }
  }
  walk(v, 0)
  if (out.length === 0) return null
  // Allerede nummereret? Ellers nummerér
  const text = out.every((l) => /^\d+[.)]/.test(l)) ? out.join('\n') : out.map((l, i) => `${i + 1}. ${l}`).join('\n')
  return text.slice(0, 10000)
}

/** Opskriften på siden, eller null hvis siden ikke beskriver en opskrift i et format vi kan læse */
export function extractRecipe(html: string): ImportedRecipe | null {
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1]!.trim()
    if (!body.includes('Recipe') || !/^[[{]/.test(body)) continue
    let data: Json
    try {
      data = JSON.parse(body)
    } catch {
      continue
    }
    const r = findRecipe(data)
    if (!r) continue
    const name = clean(r.name ?? r.headline ?? null, 100)
    if (!name) continue
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
      .map((x) => clean(x, 200))
      .filter((x): x is string => Boolean(x))
      .slice(0, 100)
    const total = durationMinutes(r.totalTime)
    const parts = (durationMinutes(r.prepTime) ?? 0) + (durationMinutes(r.cookTime) ?? 0)
    return {
      name,
      description: clean(r.description ?? null, 1000),
      servings: servingsFrom(r.recipeYield),
      prepMinutes: total ?? (parts > 0 ? parts : null),
      ingredients,
      steps: stepsFrom(r.recipeInstructions ?? null),
    }
  }
  return null
}

// ------------------------------------------------------------------ sikker adresse
/** Kun almindelige web-adresser – aldrig lokale/interne adresser (beskytter serveren) */
export function safeUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length > 2000) return null
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  if (u.port && u.port !== '80' && u.port !== '443') return null
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|arpa|svc|cluster)$/.test(host)) return null
  // IP-adresser (v4 og v6) afvises helt – opskriftssider har domænenavne
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':')) return null
  return u
}
