import { describe, expect, it } from 'vitest'
import { formatAmount, formatQuantity, isoWeek, mergeIngredients, parseAmount, scaleMilli, weekDays, weekLabel, weekStart, withSuggestions } from './recipes'

describe('mængder', () => {
  it.each([
    ['700', 700000],
    ['1,5', 1500],
    ['1.5', 1500],
    ['½', 500],
    ['1 ½', 1500],
    ['1/2', 500],
    ['2 1/4', 2250],
  ])('"%s" → %i', (input, milli) => expect(parseAmount(input)).toBe(milli))

  it('tom og ugyldig', () => {
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount('abc')).toBeUndefined()
    expect(parseAmount('0')).toBeUndefined()
    expect(parseAmount('-2')).toBeUndefined()
  })

  it('formatering', () => {
    expect(formatAmount(1500)).toBe('1,5')
    expect(formatAmount(333)).toBe('0,33')
    expect(formatAmount(700000)).toBe('700')
    expect(formatQuantity(700000, 'g')).toBe('700 g')
    expect(formatQuantity(1050000, 'g')).toBe('1,05 kg')
    expect(formatQuantity(1500, 'kg')).toBe('1,5 kg')
    expect(formatQuantity(2000, 'dl')).toBe('2 dl')
    expect(formatQuantity(1500, 'l')).toBe('1,5 l')
    expect(formatQuantity(5000, 'stk')).toBe('5 stk')
    expect(formatQuantity(null, null)).toBe('')
  })
})

describe('skalering af portioner', () => {
  it('4 → 6 personer', () => {
    expect(scaleMilli(700000, 4, 6)).toBe(1050000)
    expect(formatQuantity(scaleMilli(700000, 4, 6), 'g')).toBe('1,05 kg')
    expect(formatQuantity(scaleMilli(2000, 4, 6), 'stk')).toBe('3 stk')
    expect(formatQuantity(scaleMilli(1000, 4, 2), 'spsk')).toBe('0,5 spsk')
  })
})

describe('sammenlægning til indkøbslisten', () => {
  it('2 løg + 3 løg = 5 løg', () => {
    const m = mergeIngredients([
      { name: 'Løg', amount_milli: 2000, unit: 'stk', from: 'A' },
      { name: 'løg ', amount_milli: 3000, unit: 'stk', from: 'B' },
    ])
    expect(m).toEqual([{ key: 'løg|stk', name: 'Løg', quantity: '5 stk', from: ['A', 'B'] }])
  })

  it('omregner sikkert mellem g/kg og ml/dl/l', () => {
    const m = mergeIngredients([
      { name: 'Ris', amount_milli: 500000, unit: 'g' },
      { name: 'Ris', amount_milli: 1000, unit: 'kg' },
      { name: 'Mælk', amount_milli: 5000, unit: 'dl' },
      { name: 'Mælk', amount_milli: 1000, unit: 'l' },
    ])
    expect(m.map((x) => [x.name, x.quantity])).toEqual([
      ['Ris', '1,5 kg'],
      ['Mælk', '1,5 l'],
    ])
  })

  it('enheder der ikke kan kombineres sikkert bliver separate linjer', () => {
    const m = mergeIngredients([
      { name: 'Tomater', amount_milli: 1000, unit: 'dåse' },
      { name: 'Tomater', amount_milli: 4000, unit: 'stk' },
      { name: 'Smør', amount_milli: 2000, unit: 'spsk' },
      { name: 'Smør', amount_milli: 50000, unit: 'g' },
    ])
    expect(m.map((x) => [x.name, x.quantity])).toEqual([
      ['Tomater', '1 dåse'],
      ['Tomater', '4 stk'],
      ['Smør', '2 spsk'],
      ['Smør', '50 g'],
    ])
    expect(new Set(m.map((x) => x.key)).size).toBe(4)
  })

  it('uden mængde: én linje, og den forsvinder hvis samme vare har en mængde', () => {
    const m = mergeIngredients([
      { name: 'Salt', amount_milli: null, unit: null },
      { name: 'salt', amount_milli: null, unit: null },
      { name: 'Persille', amount_milli: null, unit: null },
      { name: 'Persille', amount_milli: 1000, unit: 'bundt' },
    ])
    expect(m.map((x) => [x.name, x.quantity])).toEqual([
      ['Salt', ''],
      ['Persille', '1 bundt'],
    ])
  })

  it('nøglen er stabil, så samme uge altid rammer samme linje', () => {
    const a = mergeIngredients([{ name: 'Kyllingebryst', amount_milli: 700000, unit: 'g' }])
    const b = mergeIngredients([{ name: 'kyllingebryst', amount_milli: 1, unit: 'kg' }])
    expect(a[0]!.key).toBe(b[0]!.key)
  })
})

describe('uger', () => {
  it('mandag, ugenummer og dage', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05')
    expect(weekStart('2026-10-11')).toBe('2026-10-05')
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
    expect(isoWeek('2026-10-05')).toBe(41)
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(isoWeek('2027-01-01')).toBe(53)
    expect(weekDays('2026-10-05')).toHaveLength(7)
    expect(weekDays('2026-10-05')[6]).toBe('2026-10-11')
    expect(weekLabel('2026-10-05')).toBe('Uge 41 · 5.–11. okt.')
    expect(weekLabel('2026-09-28')).toMatch(/^Uge 40 · 28\. sep\.? – 4\. okt\.?$/)
  })

  it('forslag + egne værdier uden dubletter', () => {
    expect(withSuggestions(['Kylling', 'Fisk'], ['fisk', 'Tapas', ' '])).toEqual(['Kylling', 'Fisk', 'Tapas'])
  })
})

import { parseIngredientLine } from './recipes'

describe('ingrediens fra tekstlinje (opskrift fra link)', () => {
  it.each([
    ['700 g kyllingebryst', { name: 'Kyllingebryst', amount_milli: 700000, unit: 'g', note: null }],
    ['500g hakket oksekød', { name: 'Hakket oksekød', amount_milli: 500000, unit: 'g', note: null }],
    ['2 løg, hakket', { name: 'Løg', amount_milli: 2000, unit: 'stk', note: 'hakket' }],
    ['½ tsk salt', { name: 'Salt', amount_milli: 500, unit: 'tsk', note: null }],
    ['1,5 dl fløde', { name: 'Fløde', amount_milli: 1500, unit: 'dl', note: null }],
    ['2-3 fed hvidløg', { name: 'Hvidløg', amount_milli: 2000, unit: 'fed', note: null }],
    ['1 dåse hakkede tomater (400 g)', { name: 'Hakkede tomater', amount_milli: 1000, unit: 'dåse', note: '400 g' }],
    ['2 spiseskeer olie', { name: 'Olie', amount_milli: 2000, unit: 'spsk', note: null }],
    ['1 kilo kartofler', { name: 'Kartofler', amount_milli: 1000, unit: 'kg', note: null }],
    ['ca. 1 liter vand', { name: 'Vand', amount_milli: 1000, unit: 'l', note: null }],
    ['1 ½ dl ris', { name: 'Ris', amount_milli: 1500, unit: 'dl', note: null }],
    ['4 æg', { name: 'Æg', amount_milli: 4000, unit: 'stk', note: null }],
    ['salt og peber', { name: 'Salt og peber', amount_milli: null, unit: null, note: null }],
    ['- 1 bundt persille', { name: 'Persille', amount_milli: 1000, unit: 'bundt', note: null }],
  ])('"%s"', (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected)
  })
})

describe('rigtige ingredienslinjer (Arla, Kylling i karry)', () => {
  it('fortolkes til mængde, enhed, navn og note', () => {
    const lines = ['25 g smør', '2 tsk karry', '3 finthakkede løg', '400 g grøntsager i mindre stykker, fx blomkål, gulerødder og forårsløg', '2½ dl grøntsagsbouillon', '1½ tsk groft salt', 'friskkværnet peber', '4 dl løse ris, parboiled - koges']
    expect(lines.map(parseIngredientLine)).toEqual([
      { name: 'Smør', amount_milli: 25000, unit: 'g', note: null },
      { name: 'Karry', amount_milli: 2000, unit: 'tsk', note: null },
      { name: 'Finthakkede løg', amount_milli: 3000, unit: 'stk', note: null },
      { name: 'Grøntsager i mindre stykker', amount_milli: 400000, unit: 'g', note: 'fx blomkål, gulerødder og forårsløg' },
      { name: 'Grøntsagsbouillon', amount_milli: 2500, unit: 'dl', note: null },
      { name: 'Groft salt', amount_milli: 1500, unit: 'tsk', note: null },
      { name: 'Friskkværnet peber', amount_milli: null, unit: null, note: null },
      { name: 'Løse ris', amount_milli: 4000, unit: 'dl', note: 'parboiled - koges' },
    ])
  })
})
