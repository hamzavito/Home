// Finder kvitteringspapiret i et foto (lyst papir på mørkere baggrund: hånd, bord, gulv),
// så OCR kun læser selve kvitteringen. Ren funktion over gråtonepixels – testbar uden browser.

export type Rect = { x: number; y: number; width: number; height: number }

/** Otsu-tærskel: deler histogrammet i "papir" og "baggrund" */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of gray) hist[v]!++
  const total = gray.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]!
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]!
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/** Længste sammenhængende række af indeks, hvor profilen er over grænsen (små huller tolereres) */
function longestRun(profile: number[], min: number, maxGap: number): [number, number] | null {
  let best: [number, number] | null = null
  let start = -1
  let lastHit = -1
  for (let i = 0; i <= profile.length; i++) {
    const hit = i < profile.length && profile[i]! >= min
    if (hit) {
      if (start < 0) start = i
      lastHit = i
    } else if (start >= 0 && (i - lastHit > maxGap || i === profile.length)) {
      if (!best || lastHit - start > best[1] - best[0]) best = [start, lastHit]
      start = -1
    }
  }
  return best
}

/**
 * Kvitteringens område i billedet, eller null hvis der ikke er en tydelig kvittering
 * (fx et billede taget helt tæt på, hvor papiret fylder det hele).
 */
export function findReceiptRect(gray: Uint8Array, width: number, height: number): Rect | null {
  if (width < 20 || height < 20 || gray.length !== width * height) return null
  const t1 = otsuThreshold(gray)
  const first = rectAt(gray, width, height, t1)
  // Lys baggrund (fx denim, lyst bord) kan havne på "papir-siden". Del derfor de lyse
  // pixels én gang til: er der et klart hvidere område, er det kvitteringen.
  const brightPixels = gray.filter((v) => v > t1)
  if (brightPixels.length > 0) {
    const t2 = otsuThreshold(brightPixels)
    const second = t2 > t1 + 15 ? rectAt(gray, width, height, t2) : null
    if (second && (!first || second.width * second.height < 0.8 * first.width * first.height)) return second
  }
  return first
}

function rectAt(gray: Uint8Array, width: number, height: number, t: number): Rect | null {
  // Ingen reel kontrast mellem papir og baggrund
  let bright = 0
  for (const v of gray) if (v > t) bright++
  if (t > 235 || bright / gray.length > 0.85) return null

  // Kolonner: andel lyse pixels (tekst gør papiret lidt mørkere, derfor en lav grænse)
  const cols = new Array<number>(width).fill(0)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (gray[y * width + x]! > t) cols[x]!++
  const colRun = longestRun(cols.map((c) => c / height), 0.35, Math.round(width * 0.02))
  if (!colRun) return null
  const [x0, x1] = colRun

  // Rækker inden for papirets kolonner
  const rows = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) for (let x = x0; x <= x1; x++) if (gray[y * width + x]! > t) rows[y]!++
  const rowRun = longestRun(rows.map((r) => r / (x1 - x0 + 1)), 0.5, Math.round(height * 0.03))
  if (!rowRun) return null
  const [y0, y1] = rowRun

  // Lidt luft omkring, så tal i kanten ikke klippes
  const mx = Math.round(width * 0.02)
  const my = Math.round(height * 0.015)
  const rect = {
    x: Math.max(0, x0 - mx),
    y: Math.max(0, y0 - my),
    width: Math.min(width, x1 + mx + 1) - Math.max(0, x0 - mx),
    height: Math.min(height, y1 + my + 1) - Math.max(0, y0 - my),
  }
  const share = (rect.width * rect.height) / (width * height)
  // For lille (nok ikke kvitteringen) eller næsten hele billedet (beskæring giver intet)
  if (share < 0.08 || share > 0.85 || rect.width < width * 0.15) return null
  return rect
}

/** Beskær et foto til kvitteringen (til OCR). Returnerer originalen, hvis intet findes. */
export async function cropToReceipt(image: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(image)
  try {
    // Analysér en lille udgave (hurtigt), beskær den fulde
    const scale = Math.min(1, 360 / bmp.width)
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const small = document.createElement('canvas')
    small.width = w
    small.height = h
    const sctx = small.getContext('2d', { willReadFrequently: true })
    if (!sctx) return image
    sctx.drawImage(bmp, 0, 0, w, h)
    const { data } = sctx.getImageData(0, 0, w, h)
    const gray = new Uint8Array(w * h)
    // Den mørkeste farvekanal: hvidt papir er lyst i alle kanaler, farvet baggrund (fx blå denim) ikke
    for (let i = 0, j = 0; i < data.length; i += 4, j++) gray[j] = Math.min(data[i]!, data[i + 1]!, data[i + 2]!)
    small.width = 0
    const r = findReceiptRect(gray, w, h)
    if (!r) return image

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(r.width / scale)
    canvas.height = Math.round(r.height / scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return image
    ctx.drawImage(bmp, r.x / scale, r.y / scale, r.width / scale, r.height / scale, 0, 0, canvas.width, canvas.height)
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    canvas.width = 0
    return out ?? image
  } finally {
    bmp.close()
  }
}
