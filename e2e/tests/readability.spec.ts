import { expect, test } from '@playwright/test'
import { expectReadable } from './helpers'

// Alle centrale sider med demodata: ingen kontrastfejl (WCAG AA) i lyst og mørkt tema.
const PAGES: Array<[string, string, string?]> = [
  ['forside', '/', 'Hamza & Sumaya'],
  ['økonomi-overblik', '/okonomi', 'Månedens plan'],
  ['budgetter', '/okonomi/budgetter', 'Brugt af variable budgetter'],
  ['faste-poster', '/okonomi/faste', 'Tilbage efter faste udgifter'],
  ['transaktioner', '/okonomi/transaktioner', 'udgifter'],
  ['ny-udgift', '/okonomi/ny', 'Ny udgift'],
  ['kvitteringer', '/kvitteringer', 'Scan kvittering'],
  ['scan', '/kvitteringer/scan', 'Tag et billede af kvitteringen'],
  ['kommende', '/okonomi/kommende', 'De næste 30 dage'],
  ['opsparing', '/opsparing', 'Ferie til Marokko'],
  ['hjemmet', '/hjemmet', 'Støvsuge'],
  ['ny-opgave', '/hjemmet/ny', 'Prioritet'],
  ['indkøb', '/indkob', 'Rugbrød'],
  ['kalender', '/hjemmet/kalender', 'Kommende'],
  ['ny-aftale', '/hjemmet/kalender/ny', 'Hele dagen'],
  ['madplan', '/hjemmet/madplan', 'Kylling i karry'],
  ['opskrifter', '/hjemmet/madplan?vis=opskrifter', 'Linsesuppe'],
  ['ny-opskrift', '/hjemmet/madplan/opskrift/ny', 'Fremgangsmåde'],
  ['mere', '/mere', 'Mere'],
  ['indstillinger', '/indstillinger', 'Standardvalg'],
  ['login', '/login'],
  ['glemt-adgangskode', '/glemt-adgangskode', 'Nulstil adgangskode'],
]

for (const [name, path, waitFor] of PAGES) {
  test(`læsbar: ${name}`, async ({ page }, info) => {
    if (path === '/login') {
      await page.goto('/indstillinger')
      await page.getByRole('button', { name: 'Log ud' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Log ud' }).click()
    } else {
      await page.goto(path)
    }
    if (waitFor) await expect(page.getByText(waitFor).first()).toBeVisible()
    await expectReadable(page, name)
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
  })
}

test('læsbar: tilføj-ark og bottom sheet', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tilføj' })).toBeVisible()
  await expectReadable(page, 'tilføj-ark')
})

test('læsbar: kategori-detalje og fast post', async ({ page }) => {
  await page.goto('/okonomi/budgetter')
  await page.getByRole('link', { name: /Mad/ }).first().click()
  await expect(page.getByText('Standard pr. måned')).toBeVisible()
  await expectReadable(page, 'kategori')
  await page.goto('/okonomi/faste')
  await page.getByRole('link', { name: /Clever/ }).click()
  await expect(page.getByText('Beløb over tid')).toBeVisible()
  await expectReadable(page, 'fast-post')
})

test('læsbar: opskrift, ret-ark og indkøbsark', async ({ page }) => {
  await page.goto('/hjemmet/madplan?vis=opskrifter')
  await page.getByRole('link', { name: /Kylling i karry/ }).first().click()
  await expect(page.getByRole('list', { name: 'Ingredienser' })).toBeVisible()
  await expectReadable(page, 'opskrift')
  await page.goto('/hjemmet/madplan')
  await page.getByRole('button', { name: /Rester/ }).click()
  await expect(page.locator('dialog[open]').getByLabel('Dag')).toBeVisible()
  await expectReadable(page, 'ret-ark')
  await page.locator('dialog[open]').getByRole('button', { name: 'Luk' }).click()
  await page.getByRole('button', { name: 'Tilføj ugens ingredienser til indkøbslisten' }).click()
  await expect(page.locator('dialog[open]').getByRole('list', { name: 'Ingredienser' })).toBeVisible()
  await expectReadable(page, 'indkøbsark')
})
