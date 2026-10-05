import { describe, expect, it } from 'vitest'
import { amountsInLine, parseReceiptText } from './receipt-parser'
import { parseKr } from './money'

const today = new Date(2026, 9, 5, 12)

const BILKA = `
BILKA
Bilka Tilst
Tilst Skolevej 2, 8381 Tilst
CVR 35954716   Tlf 89 30 63 00
SALG
MÆLK LETMÆLK 1L        11,95
RUGBRØD                22,00
KAFFE 400G             54,95
BANANER 1,234 KG       24,68
SUBTOTAL              638,75
HERAF MOMS 25%        127,75
TOTAL                 638,75
DANKORT
BELØB DKK             638,75
04.10.2026  14:32   KASSE 7
`

const NETTO_OCR_NOISE = `
netto
Holmevej 12
8000 Aarhus C
ÆBLER                   1O,OO
BRØD                    18,5O
I ALT                  2O3,5O
Kontant modtaget       500,00
Byttepenge             296,50
Dato: 03-10-26 Kl. 09:12
`

const UNKNOWN_SHOP = `
Café Solsikken
Strandvejen 4, 3000 Helsingør
Cappuccino x2           90,00
Kage                    45,00
AT BETALE              135,00
Moms                    27,00
3. okt. 2026
`

const NO_KEYWORD = `
SOME SHOP
VARE 1    12,00
VARE 2    48,50
VARE 3    9,95
`

describe('parseReceiptText', () => {
  it('Bilka: butik, dato og total med høj sikkerhed', () => {
    const r = parseReceiptText(BILKA, today)
    expect(r.merchant).toEqual({ value: 'Bilka', confidence: 'high' })
    expect(r.date).toEqual({ value: '2026-10-04', confidence: 'high' })
    expect(r.total).toEqual({ ore: 63875, confidence: 'high' })
  })

  it('ignorerer SUBTOTAL og MOMS som total', () => {
    const r = parseReceiptText('SUBTOTAL 100,00\nMOMS 20,00\nTOTAL 125,00', today)
    expect(r.total?.ore).toBe(12500)
  })

  it('Netto med OCR-støj (O i stedet for 0, små bogstaver, kort år)', () => {
    const r = parseReceiptText(NETTO_OCR_NOISE, today)
    expect(r.merchant?.value).toBe('Netto')
    expect(r.total?.ore).toBe(20350)
    expect(r.date?.value).toBe('2026-10-03')
  })

  it('ukendt butik: intet butiksnavn, men et forslag', () => {
    const r = parseReceiptText(UNKNOWN_SHOP, today)
    expect(r.merchant).toBeNull()
    expect(r.merchantHint).toBe('Café Solsikken')
    expect(r.total?.ore).toBe(13500)
    expect(r.date?.value).toBe('2026-10-03')
  })

  it('uden nøgleord: største beløb med lav sikkerhed', () => {
    const r = parseReceiptText(NO_KEYWORD, today)
    expect(r.total).toEqual({ ore: 4850, confidence: 'low' })
  })

  it('beløb på linjen efter nøgleordet', () => {
    const r = parseReceiptText('TOTALT\n249,00\n', today)
    expect(r.total?.ore).toBe(24900)
  })

  it.each([
    ['TOTAL 1.234,50', 123450],
    ['I ALT 99,95', 9995],
    ['IALT 12,00', 1200],
    ['AT BETALE 638.75', 63875],
    ['BELOB 50,00', 5000],
    ['TOTAL 638, 75', 63875],
  ])('total i "%s" → %i øre', (line, ore) => {
    expect(parseReceiptText(line, today).total?.ore).toBe(ore)
  })

  it('AT BETALE vinder over BELØB', () => {
    const r = parseReceiptText('BELØB 10,00\nAT BETALE 120,00\nBELØB 120,00', today)
    expect(r.total).toEqual({ ore: 12000, confidence: 'high' })
  })

  it('ingen tekst', () => {
    expect(parseReceiptText('', today)).toEqual({ merchant: null, merchantHint: null, date: null, total: null })
  })
})

describe('datoer', () => {
  it.each([
    ['04.10.2026', '2026-10-04'],
    ['4/10/2026', '2026-10-04'],
    ['04-10-26', '2026-10-04'],
    ['2026-10-04', '2026-10-04'],
    ['4. okt 2026', '2026-10-04'],
    ['04 OKT. 26', '2026-10-04'],
  ])('%s → %s', (input, iso) => {
    expect(parseReceiptText(input, today).date?.value).toBe(iso)
  })

  it('afviser umulige og fremtidige datoer', () => {
    expect(parseReceiptText('31.02.2026', today).date).toBeNull()
    expect(parseReceiptText('01.12.2026', today).date).toBeNull()
    expect(parseReceiptText('01.01.2019', today).date).toBeNull()
  })

  it('flere forskellige datoer giver mellem sikkerhed', () => {
    const r = parseReceiptText('04.10.2026\nByttes til 04.11.2025\n04.10.2026', today)
    expect(r.date).toEqual({ value: '2026-10-04', confidence: 'medium' })
  })
})

describe('amountsInLine', () => {
  it('finder beløb, men ikke datoer, procenter eller klokkeslæt', () => {
    expect(amountsInLine('04.10.2026 14:32')).toEqual([])
    expect(amountsInLine('MOMS 25,00 %')).toEqual([])
    expect(amountsInLine('2 X 12,95   25,90')).toEqual([1295, 2590])
    expect(amountsInLine('1 499,95')).toEqual([49995])
  })
})

describe('decimaler og komma', () => {
  it('638,75 kr. → 63875 øre (parseKr og parser er enige)', () => {
    expect(parseKr('638,75')).toBe(63875)
    expect(parseKr('638,75 kr.')).toBe(63875)
    expect(amountsInLine('638,75')).toEqual([63875])
  })
  it('heltal og tusinder', () => {
    expect(parseKr('1.000')).toBe(100000)
    expect(amountsInLine('1.000,00')).toEqual([100000])
  })
})
