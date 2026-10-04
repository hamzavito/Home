// Kontrol af designsystemets kontrast (WCAG 2.1). Kør: node scripts/check-contrast.mjs
// Læser tokens fra src/index.css for lyst og mørkt tema og tester alle tekst/flade-par,
// som UI'et faktisk bruger. Fejler (exit 1) hvis et par er under kravet.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

function block(selector) {
  const i = css.indexOf(selector)
  if (i < 0) throw new Error(`Mangler ${selector}`)
  const start = css.indexOf('{', i)
  let depth = 0
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++
    if (css[j] === '}') depth--
    if (depth === 0) return css.slice(start + 1, j)
  }
}
function tokens(body) {
  const out = {}
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
const light = tokens(block(':root {'))
const dark = { ...light, ...tokens(block(":root[data-theme='dark']")) }

function parse(c) {
  c = c.trim()
  let m = c.match(/^#([0-9a-f]{6})$/i)
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1]
  m = c.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/)
  if (m) return [+m[1], +m[2], +m[3], m[4] ? +m[4] : 1]
  throw new Error(`Kan ikke læse farve: ${c}`)
}
const over = (fg, bg) => {
  const [r, g, b, a] = fg
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a), 1]
}
const lum = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// Flader: [navn, lag fra bund til top]
const surfaces = {
  bg: ['bg'],
  'surface-primary': ['bg', 'surface-primary'],
  'surface-secondary': ['bg', 'surface-secondary'],
  'surface-tertiary': ['bg', 'surface-tertiary'],
  'surface-elevated': ['bg', 'surface-elevated'],
  sheet: ['bg', 'surface-sheet'],
  'surface-accent': ['bg', 'surface-primary', 'surface-accent'],
  nav: ['bg', 'nav-bg'],
  'positive-soft': ['bg', 'surface-primary', 'positive-soft'],
  'notice-soft': ['bg', 'surface-primary', 'notice-soft'],
  'warning-soft': ['bg', 'surface-primary', 'warning-soft'],
  'danger-soft': ['bg', 'surface-primary', 'danger-soft'],
  accent: ['bg', 'accent'],
  inverse: ['bg', 'surface-inverse'],
  hero: ['hero-base'],
  'hero-glow': ['hero-base', 'hero-glow'],
}
const text = ['text-primary', 'text-secondary', 'text-muted']
const checks = [
  ...['bg', 'surface-primary', 'surface-secondary', 'surface-tertiary', 'surface-elevated', 'sheet', 'nav'].flatMap((s) => text.map((t) => [t, s, 4.5])),
  ...['bg', 'surface-primary', 'surface-secondary', 'surface-elevated', 'surface-accent'].map((s) => ['accent-text', s, 4.5]),
  ['text-on-accent', 'accent', 4.5],
  ['text-on-inverse', 'inverse', 4.5],
  ...['positive', 'notice', 'warning', 'danger'].flatMap((k) => [
    [k, 'surface-primary', 4.5],
    [k, 'surface-secondary', 4.5],
    [k, 'bg', 4.5],
    [k, `${k}-soft`, 4.5],
  ]),
  ['hero-text', 'hero', 4.5],
  ['hero-text', 'hero-glow', 4.5],
  ['hero-text-secondary', 'hero', 4.5],
  ['hero-text-secondary', 'hero-glow', 4.5],
  ['hero-danger', 'hero', 4.5],
  // Ikke-tekst (ikoner, kanter, bars): 3:1
  ['border-strong', 'surface-primary', 3],
  ['accent', 'track-on-primary', 3],
]

let failed = 0
for (const [name, t] of [['Lyst', light], ['Mørkt', dark]]) {
  console.log(`\n${name} tema`)
  const flat = (layers) => layers.reduce((acc, k) => over(parse(t[k]), acc), [255, 255, 255, 1])
  const S = Object.fromEntries(Object.entries(surfaces).map(([k, v]) => [k, flat(v)]))
  S['track-on-primary'] = flat(['bg', 'surface-primary', 'track'])
  for (const [fg, bgName, min] of checks) {
    const fgc = over(parse(t[fg]), S[bgName])
    const r = ratio(fgc, S[bgName])
    const ok = r >= min
    if (!ok) failed++
    console.log(`${ok ? '  ✓' : '  ✗'} ${fg.padEnd(20)} på ${bgName.padEnd(18)} ${r.toFixed(2)} (krav ${min})`)
  }
}
if (failed) {
  console.log(`\n✗ ${failed} par under kravet`)
  process.exit(1)
}
console.log('\n✓ Alle kontrastpar opfylder WCAG AA')
