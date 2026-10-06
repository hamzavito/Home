import { expect, test, type Page } from '@playwright/test'
import { startEmpty } from './helpers'

type Ing = [name: string, amount: string, unit: string]

/** Opret en opskrift via formularen */
async function createRecipe(page: Page, name: string, ingredients: Ing[], opts: { category?: string; servings?: number } = {}) {
  await page.goto('/hjemmet/madplan/opskrift/ny')
  await page.getByPlaceholder('Fx Kylling i karry').fill(name)
  if (opts.category) await page.getByRole('radiogroup', { name: 'Kategori' }).getByRole('radio', { name: opts.category, exact: true }).click()
  for (let i = 3; i < ingredients.length; i++) await page.getByRole('button', { name: 'Tilføj ingrediens' }).click()
  for (const [i, [n, a, u]] of ingredients.entries()) {
    await page.getByLabel(`Ingrediens ${i + 1}`, { exact: true }).fill(n)
    if (a) await page.getByLabel(`Mængde ${i + 1}`).fill(a)
    if (u) await page.getByLabel(`Enhed ${i + 1}`).selectOption(u)
  }
  await page.getByRole('button', { name: 'Gem opskrift' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

const sheet = (page: Page) => page.locator('dialog[open]')
const day = (page: Page, i: number) => page.getByRole('list', { name: 'Ugeplan' }).locator(':scope > li').nth(i)

/** Planlæg en ret på en dag (0 = mandag) i den viste uge */
async function planRecipe(page: Page, dayIndex: number, recipe: string) {
  const names = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']
  await page.getByRole('button', { name: `Tilføj ret ${names[dayIndex]}` }).click()
  await sheet(page).getByRole('radio', { name: new RegExp(recipe) }).click()
  await sheet(page).getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(day(page, dayIndex)).toContainText(recipe)
}

async function planFree(page: Page, dayIndex: number, title: string) {
  const names = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']
  await page.getByRole('button', { name: `Tilføj ret ${names[dayIndex]}` }).click()
  await sheet(page).getByRole('radio', { name: 'Uden opskrift' }).click()
  await sheet(page).getByPlaceholder('Fx Pasta bolognese').fill(title)
  await sheet(page).getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(day(page, dayIndex)).toContainText(title)
}

test('opskrift: ingredienser, kategori, tags, portioner skaleres og favorit', async ({ page }) => {
  await startEmpty(page, '/hjemmet')
  await page.getByRole('link', { name: /Madplan/ }).click()
  await expect(page.getByRole('heading', { name: 'Madplan' })).toBeVisible()
  await page.getByRole('radio', { name: 'Opskrifter' }).click()
  await expect(page.getByText('Ingen opskrifter endnu')).toBeVisible()
  await page.getByRole('button', { name: 'Ny opskrift' }).click()

  await page.getByPlaceholder('Fx Kylling i karry').fill('Kylling i karry')
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByRole('radio', { name: 'Kylling', exact: true }).click()
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: 'Børnevenlig' }).click()
  await page.getByPlaceholder('Nyt tag, fx Weekend').fill('Weekend')
  await page.getByRole('button', { name: 'Tilføj tag' }).click()
  await expect(page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: 'Weekend' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Tid (minutter)').fill('40')
  const ings: Ing[] = [
    ['Kyllingebryst', '700', 'g'],
    ['Løg', '2', 'stk'],
    ['Karry', '1,5', 'tsk'],
  ]
  for (const [i, [n, a, u]] of ings.entries()) {
    await page.getByLabel(`Ingrediens ${i + 1}`, { exact: true }).fill(n)
    await page.getByLabel(`Mængde ${i + 1}`).fill(a)
    await page.getByLabel(`Enhed ${i + 1}`).selectOption(u)
  }
  await page.getByLabel('Fremgangsmåde').fill('1. Steg kyllingen\n2. Tilsæt karry')
  await page.getByRole('button', { name: 'Gem opskrift' }).click()

  // Opskriftssiden: 4 personer → 6 personer
  await expect(page.getByRole('heading', { name: 'Kylling i karry' })).toBeVisible()
  const list = page.getByRole('list', { name: 'Ingredienser' })
  await expect(list).toContainText('700 g')
  await expect(list).toContainText('2 stk')
  await page.getByRole('button', { name: 'Flere portioner' }).click()
  await page.getByRole('button', { name: 'Flere portioner' }).click()
  await expect(page.getByText('Omregnet fra 4 til 6 personer')).toBeVisible()
  await expect(list).toContainText('1,05 kg')
  await expect(list).toContainText('3 stk')
  await expect(list).toContainText('2,25 tsk')
  await expect(page.getByText('Oprettet af Hamza')).toBeVisible()

  // Favorit
  await page.getByRole('button', { name: 'Gør til favorit' }).click()
  await expect(page.getByRole('button', { name: 'Fjern fra favoritter' })).toBeVisible()
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await page.getByRole('radio', { name: 'Favoritter' }).click()
  await expect(page.getByRole('link', { name: /Kylling i karry/ })).toBeVisible()
  await expect(page.getByText(/Børnevenlig · Weekend/)).toBeVisible()

  // Redigér: ugyldig mængde afvises med en forklaring
  await page.getByRole('link', { name: /Kylling i karry/ }).click()
  await page.getByRole('button', { name: 'Redigér opskrift' }).click()
  await page.getByLabel('Mængde 1').fill('abc')
  await page.getByRole('button', { name: 'Gem ændringer' }).click()
  await expect(page.getByText(/Ugyldig mængde/)).toBeVisible()
  await page.getByLabel('Mængde 1').fill('800')
  await page.getByRole('button', { name: 'Gem ændringer' }).click()
  await expect(page.getByRole('list', { name: 'Ingredienser' })).toContainText('800 g')
})

test('ugeplan: vælg opskrift, skriv ret, flyt, fjern og kopiér til næste uge', async ({ page }) => {
  await startEmpty(page, '/hjemmet')
  await createRecipe(page, 'Kylling i karry', [['Kyllingebryst', '700', 'g']])
  await page.goto('/hjemmet/madplan')

  await planRecipe(page, 0, 'Kylling i karry')
  await expect(day(page, 0)).toContainText('4 pers.')
  await planFree(page, 1, 'Pasta bolognese')
  // Hurtigvalg "Rester"
  await page.getByRole('button', { name: 'Tilføj ret onsdag' }).click()
  await sheet(page).getByRole('radio', { name: 'Uden opskrift' }).click()
  await sheet(page).getByRole('button', { name: 'Rester' }).click()
  await sheet(page).getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(day(page, 2)).toContainText('Rester')

  // Flyt Rester fra onsdag til torsdag
  await day(page, 2).getByRole('button', { name: /Rester/ }).click()
  await sheet(page).getByLabel('Dag').selectOption({ index: 3 })
  await sheet(page).getByRole('button', { name: 'Gem', exact: true }).click()
  await expect(day(page, 3)).toContainText('Rester')
  await expect(day(page, 2)).not.toContainText('Rester')

  // Fjern tirsdag
  await day(page, 1).getByRole('button', { name: /Pasta bolognese/ }).click()
  await sheet(page).getByRole('button', { name: 'Fjern ret' }).click()
  await expect(day(page, 1)).not.toContainText('Pasta bolognese')

  // Næste uge er tom → kopiér
  await page.getByRole('button', { name: 'Næste uge' }).click()
  await expect(page.getByText('Ugen er tom. Vil I spise det samme som ugen før?')).toBeVisible()
  await page.getByRole('button', { name: 'Kopiér' }).click()
  await expect(day(page, 0)).toContainText('Kylling i karry')
  await expect(day(page, 3)).toContainText('Rester')
  // Tidligere uger kan genbruges – dage med en ret overskrives ikke
  await page.getByRole('button', { name: 'Tidligere uger' }).click()
  await sheet(page).getByRole('button', { name: /^Genbrug/ }).first().click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Ugeplan' }).getByText('Kylling i karry')).toHaveCount(1)

  // Nyligt brugt vises under opskrifter
  await page.goto('/hjemmet/madplan?vis=opskrifter')
  await expect(page.getByRole('heading', { name: 'Nyligt brugt' })).toBeVisible()
})

test('ugens ingredienser → indkøbslisten: lagt sammen, "har vi" og ingen dubletter', async ({ page }) => {
  await startEmpty(page, '/hjemmet')
  await createRecipe(page, 'Karry', [
    ['Løg', '2', 'stk'],
    ['Ris', '500', 'g'],
    ['Salt', '', ''],
    ['Tomater', '1', 'dåse'],
  ])
  await createRecipe(page, 'Risotto', [
    ['løg', '3', 'stk'],
    ['Ris', '1', 'kg'],
    ['Tomater', '4', 'stk'],
  ])
  await page.goto('/hjemmet/madplan')
  await planRecipe(page, 0, 'Karry')
  await planRecipe(page, 1, 'Risotto')

  await page.getByRole('button', { name: 'Tilføj ugens ingredienser til indkøbslisten' }).click()
  const items = sheet(page).getByRole('list', { name: 'Ingredienser' })
  await expect(items.getByRole('checkbox', { name: /Løg · 5 stk/ })).toHaveAttribute('aria-checked', 'true')
  await expect(items.getByRole('checkbox', { name: /Ris · 1,5 kg/ })).toBeVisible()
  // Kan ikke lægges sikkert sammen → to linjer
  await expect(items.getByRole('checkbox', { name: /Tomater · 1 dåse/ })).toBeVisible()
  await expect(items.getByRole('checkbox', { name: /Tomater · 4 stk/ })).toBeVisible()
  // Salt er foreslået som "har vi"
  await expect(items.getByRole('checkbox', { name: /Salt/ })).toHaveAttribute('aria-checked', 'false')
  // Vi har ris
  await items.getByRole('checkbox', { name: /^Ris ·/ }).click()
  await sheet(page).getByRole('button', { name: 'Tilføj 3 varer' }).click()
  await expect(sheet(page).getByText('3 varer på indkøbslisten')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Luk' }).last().click()

  // Igen: det der er sendt, står som "På listen" og giver ingen dubletter
  await page.getByRole('button', { name: 'Tilføj ugens ingredienser til indkøbslisten' }).click()
  await expect(items.getByRole('checkbox', { name: /Løg · 5 stk/ })).toContainText('På listen')
  await sheet(page).getByRole('button', { name: 'Tilføj 4 varer' }).click()
  await expect(sheet(page).getByText('4 varer på indkøbslisten')).toBeVisible()
  await sheet(page).getByRole('link', { name: 'Se listen' }).click()

  await expect(page.getByRole('heading', { name: 'Indkøb' })).toBeVisible()
  const main = page.locator('main')
  await expect(main.getByText('Løg', { exact: true })).toHaveCount(1)
  await expect(main.getByText('Ris', { exact: true })).toHaveCount(1)
  await expect(main.getByText('Tomater', { exact: true })).toHaveCount(2)
  await expect(main).toContainText('5 stk')
  await expect(main).toContainText('1,5 kg')
})

test('madbudget: vælg kategori og se hvad der er tilbage; madplan på Hjemmet', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()

  await page.goto('/hjemmet/madplan')
  await page.getByRole('button', { name: /Vælg madbudget/ }).click()
  await sheet(page).getByRole('radio', { name: 'Dagligvarer' }).click()
  await expect(page.getByText(/Madbudget tilbage i/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Madbudget tilbage i/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Dagligvarer/ })).toBeVisible()

  // I aften på Hjemmet
  const names = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']
  const todayIndex = (new Date().getDay() + 6) % 7
  await page.getByRole('button', { name: `Tilføj ret ${names[todayIndex]}` }).click()
  await sheet(page).getByRole('radio', { name: 'Uden opskrift' }).click()
  await sheet(page).getByPlaceholder('Fx Pasta bolognese').fill('Fiskefrikadeller')
  await sheet(page).getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(day(page, todayIndex)).toContainText('Fiskefrikadeller')
  await page.goto('/hjemmet')
  await expect(page.getByRole('link', { name: /Madplan/ })).toContainText('I aften: Fiskefrikadeller')
})

test('opskrift fra link: udfylder formularen, ingredienser fortolkes, kilde vises', async ({ page }) => {
  await startEmpty(page, '/hjemmet/madplan/opskrift/ny')
  const link = page.getByLabel('Link til opskrift')
  await link.fill('ikke et link')
  await page.getByRole('button', { name: 'Hent', exact: true }).click()
  await expect(page.getByText(/Det ligner ikke et gyldigt link/)).toBeVisible()
  await link.fill('https://www.example.dk/om-os')
  await page.getByRole('button', { name: 'Hent', exact: true }).click()
  await expect(page.getByText(/Vi kunne ikke finde en opskrift på siden/)).toBeVisible()

  await link.fill('https://www.arla.dk/opskrifter/kylling-i-karry/')
  await page.getByRole('button', { name: 'Hent', exact: true }).click()
  await expect(page.getByText('Hentet fra arla.dk. Tjek ingredienserne og gem.')).toBeVisible()
  await expect(page.getByPlaceholder('Fx Kylling i karry')).toHaveValue('Kylling i karry')
  await expect(page.getByLabel('Tid (minutter)')).toHaveValue('45')
  await expect(page.getByLabel('Ingrediens 1', { exact: true })).toHaveValue('Smør')
  await expect(page.getByLabel('Mængde 1')).toHaveValue('25')
  await expect(page.getByLabel('Enhed 1')).toHaveValue('g')
  await expect(page.getByLabel('Mængde 5')).toHaveValue('2,5')
  await expect(page.getByLabel('Ingrediens 6', { exact: true })).toHaveValue('Friskkværnet peber')
  await expect(page.getByLabel('Mængde 6')).toHaveValue('')
  await expect(page.getByLabel('Note 7')).toHaveValue('parboiled - koges')
  await page.getByRole('button', { name: 'Gem opskrift' }).click()

  await expect(page.getByRole('heading', { name: 'Kylling i karry' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Ingredienser' })).toContainText('300 g')
  await expect(page.getByRole('link', { name: 'arla.dk' })).toHaveAttribute('href', 'https://www.arla.dk/opskrifter/kylling-i-karry/')
})
