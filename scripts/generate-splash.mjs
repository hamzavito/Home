// Genererer iOS-startskærme (apple-touch-startup-image) i lyst og mørkt tema
// og skriver <link>-tags ind i index.html mellem markørerne.
// Kør kun når ikon eller baggrundsfarver ændres (npm run icons); filerne committes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

// CSS-bredde × højde @ skaleringsfaktor (portræt)
const devices = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 14/15 Pro Max, 15/16 Plus
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 14 Pro, 15, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE 2./3. gen., 8
]
const themes = { light: '#f4f3ef', dark: '#09090b' }

mkdirSync('public/splash', { recursive: true })
const links = []
for (const [w, h, r] of devices) {
  const [pw, ph] = [w * r, h * r]
  const icon = Math.round(pw * 0.26)
  // Afrundede hjørner som et app-ikon
  const mask = Buffer.from(`<svg width="${icon}" height="${icon}"><rect width="${icon}" height="${icon}" rx="${Math.round(icon * 0.225)}" fill="#fff"/></svg>`)
  const png = await sharp('public/icons/icon.svg', { density: 512 })
    .resize(icon, icon)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
  for (const [theme, bg] of Object.entries(themes)) {
    const name = `splash-${pw}x${ph}-${theme}.png`
    await sharp({ create: { width: pw, height: ph, channels: 4, background: bg } })
      .composite([{ input: png, top: Math.round((ph - icon) / 2), left: Math.round((pw - icon) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(`public/splash/${name}`)
    const media = `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${theme})`
    links.push(`    <link rel="apple-touch-startup-image" media="${media}" href="/splash/${name}" />`)
  }
}

const html = readFileSync('index.html', 'utf8')
const start = '<!-- splash:start -->'
const end = '<!-- splash:end -->'
const block = `${start}\n${links.join('\n')}\n    ${end}`
const out = html.includes(start)
  ? html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block)
  : html.replace('    <script>', `    ${block}\n    <script>`)
writeFileSync('index.html', out)
console.log(`✓ ${links.length} startskærme`)
