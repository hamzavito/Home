import { describe, expect, it } from 'vitest'
import { findReceiptRect, otsuThreshold } from './receipt-crop'

/** Gråtonebillede: mørk baggrund med et lyst "papir" og lidt mørk "tekst" på */
function photo(w: number, h: number, paper: { x: number; y: number; width: number; height: number } | null, bg = 90) {
  const g = new Uint8Array(w * h).fill(bg)
  if (paper)
    for (let y = paper.y; y < paper.y + paper.height; y++)
      for (let x = paper.x; x < paper.x + paper.width; x++) g[y * w + x] = (y % 7 === 0 && x % 3 === 0) ? 40 : 235
  return g
}

describe('beskæring til kvitteringen', () => {
  it('Otsu skiller papir fra baggrund', () => {
    const t = otsuThreshold(photo(100, 100, { x: 30, y: 10, width: 40, height: 80 }))
    expect(t).toBeGreaterThanOrEqual(90)
    expect(t).toBeLessThan(235)
  })

  it('finder papiret med lidt luft omkring', () => {
    const r = findReceiptRect(photo(200, 300, { x: 60, y: 40, width: 80, height: 220 }), 200, 300)!
    expect(r).not.toBeNull()
    expect(r.x).toBeLessThanOrEqual(60)
    expect(r.x).toBeGreaterThan(45)
    expect(r.x + r.width).toBeGreaterThanOrEqual(140)
    expect(r.y).toBeLessThanOrEqual(40)
    expect(r.y + r.height).toBeGreaterThanOrEqual(260)
  })

  it('beskærer ikke, når papiret fylder hele billedet eller der ikke er noget papir', () => {
    expect(findReceiptRect(photo(100, 100, { x: 0, y: 0, width: 100, height: 100 }), 100, 100)).toBeNull()
    expect(findReceiptRect(photo(100, 100, null), 100, 100)).toBeNull()
    // Lille lys plet (fx en lampe) er ikke en kvittering
    expect(findReceiptRect(photo(200, 200, { x: 10, y: 10, width: 15, height: 15 }), 200, 200)).toBeNull()
  })

  it('finder hvidt papir på en lys baggrund (fx denim) ved siden af mørke områder', () => {
    // Venstre: mørkt sæde (50). Resten: lys denim (165). Papiret (235) ligger på denimen.
    const w = 240
    const h = 320
    const g = photo(w, h, { x: 90, y: 60, width: 90, height: 240 }, 165)
    for (let y = 0; y < h; y++) for (let x = 0; x < 50; x++) g[y * w + x] = 50
    const r = findReceiptRect(g, w, h)!
    expect(r).not.toBeNull()
    expect(r.x).toBeGreaterThan(75)
    expect(r.x + r.width).toBeLessThan(200)
    expect(r.y).toBeGreaterThan(45)
  })
})
