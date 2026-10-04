// Genererer PNG-ikoner ud fra public/icons/icon.svg.
// Kør kun når ikonet ændres (npm run icons); PNG-filerne committes.
import sharp from 'sharp'

const src = 'public/icons/icon.svg'
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]

for (const [name, size] of targets) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(`public/icons/${name}`)
  console.log('✓', name)
}
