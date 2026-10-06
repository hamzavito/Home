import { describe, expect, it } from 'vitest'
import { decodeEntities, durationMinutes, extractRecipe, safeUrl, servingsFrom, stepsFrom } from './extract'

const page = (json: unknown, attrs = 'type="application/ld+json"') => `<!doctype html><html><head><title>X</title>
<script>window.dataLayer = []</script>
<script ${attrs}>${JSON.stringify(json)}</script></head><body><h1>Opskrift</h1></body></html>`

describe('opskrift fra webside (schema.org/Recipe)', () => {
  it('Arla-lignende: liste af objekter, "type" uden @, sektioner med trin, "4 personer"', () => {
    const html = page(
      [
        { '@type': 'BreadcrumbList', itemListElement: [] },
        {
          '@context': 'https://schema.org/',
          type: 'Recipe',
          '@type': 'Recipe',
          name: 'Kylling i karry',
          description: 'Mild og cremet &amp; familievenlig',
          totalTime: 'PT45M',
          cookTime: 'PT00M',
          recipeYield: '4 personer',
          recipeIngredient: ['25 g smør', '2 tsk karry', '3 finthakkede løg', '2½ dl grøntsagsbouillon', 'friskkværnet peber'],
          recipeInstructions: [
            {
              type: 'HowToSection',
              itemListElement: [
                { type: 'HowToStep', text: 'Smelt smørret og svits karry.' },
                { type: 'HowToStep', text: 'Tilsæt løg og kylling.' },
              ],
            },
          ],
        },
      ],
      "type='application/ld+json'",
    )
    expect(extractRecipe(html)).toEqual({
      name: 'Kylling i karry',
      description: 'Mild og cremet & familievenlig',
      servings: 4,
      prepMinutes: 45,
      ingredients: ['25 g smør', '2 tsk karry', '3 finthakkede løg', '2½ dl grøntsagsbouillon', 'friskkværnet peber'],
      steps: '1. Smelt smørret og svits karry.\n2. Tilsæt løg og kylling.',
    })
  })

  it('WordPress/Yoast-lignende: @graph, @type som liste, trin som tekst og tid som prep + cook', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Valdemarsro' },
        {
          '@type': ['Recipe'],
          name: 'Pasta bolognese',
          recipeYield: ['4', '4 portioner'],
          prepTime: 'PT15M',
          cookTime: 'PT1H',
          recipeIngredient: ['500 g hakket oksekød', '1 dåse hakkede tomater'],
          recipeInstructions: ['Brun kødet.', 'Tilsæt tomater og lad det simre.'],
        },
      ],
    })
    const r = extractRecipe(html)!
    expect(r.name).toBe('Pasta bolognese')
    expect(r.servings).toBe(4)
    expect(r.prepMinutes).toBe(75)
    expect(r.steps).toBe('1. Brun kødet.\n2. Tilsæt tomater og lad det simre.')
  })

  it('ingen opskrift på siden', () => {
    expect(extractRecipe(page({ '@type': 'WebPage', name: 'Forside' }))).toBeNull()
    expect(extractRecipe('<html><body>Hej</body></html>')).toBeNull()
    expect(extractRecipe('<script type="application/ld+json">{ ødelagt json Recipe</script>')).toBeNull()
  })

  it('hjælpere', () => {
    expect(durationMinutes('PT1H30M')).toBe(90)
    expect(durationMinutes('PT00M')).toBeNull()
    expect(durationMinutes('P1DT2H')).toBeNull() // over et døgn
    expect(servingsFrom('6-8 personer')).toBe(6)
    expect(servingsFrom(4)).toBe(4)
    expect(servingsFrom('mange')).toBeNull()
    expect(stepsFrom('1. Først\n2. Så')).toBe('1. Først\n2. Så')
    expect(stepsFrom('<p>Rør rundt</p><p>Server</p>')).toBe('1. Rør rundt Server')
    expect(decodeEntities('&#248;l &#x26; br&oslash;d')).toBe('øl & br&oslash;d')
  })
})

describe('kun sikre adresser hentes', () => {
  it.each(['https://www.arla.dk/opskrifter/kylling-i-karry/', 'http://valdemarsro.dk/x'])('tilladt: %s', (u) => {
    expect(safeUrl(u)).not.toBeNull()
  })
  it.each([
    'ftp://arla.dk/x',
    'file:///etc/passwd',
    'http://localhost:8000/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://intranet/',
    'http://db.internal/',
    'https://user:pass@arla.dk/',
    'https://arla.dk:8443/',
    'ikke en adresse',
    42,
  ])('afvist: %s', (u) => {
    expect(safeUrl(u)).toBeNull()
  })
})
