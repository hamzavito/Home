// Kopierer Tesseract-filer (worker, WASM-motor og dansk sprogmodel) fra
// node_modules til public/ocr, så OCR kører helt fra vores eget domæne –
// ingen kald til eksterne CDN'er. Køres automatisk før dev og build.
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/ocr'
mkdirSync(out, { recursive: true })

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // Kun LSTM-motoren (mindst og bedst til tekst). Browseren vælger variant efter SIMD-understøttelse.
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  // Dansk sprogmodel (best_int, ~1,8 MB komprimeret)
  ['node_modules/@tesseract.js-data/dan/4.0.0_best_int/dan.traineddata.gz', 'dan.traineddata.gz'],
]

for (const [from, to] of files) copyFileSync(from, join(out, to))
console.log(`✓ OCR-filer kopieret til ${out}`)
