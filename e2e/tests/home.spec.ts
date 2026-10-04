import { expect, test } from '@playwright/test'
import { startEmpty } from './helpers'

test('gentagende opgave: udført opretter næste gang præcis én gang, genåbn fjerner den', async ({ page }) => {
  await startEmpty(page, '/hjemmet/ny')
  await page.getByPlaceholder('Fx Støvsuge stuen').fill('Støvsuge')
  await page.getByRole('radiogroup', { name: 'Gentag' }).getByRole('radio', { name: 'Uge' }).click()
  await page.getByRole('button', { name: 'Oftere' }).click()
  await expect(page.getByText('Hver 2. uge')).toBeVisible()
  await page.getByRole('button', { name: 'Opret opgave' }).click()

  await expect(page.getByRole('heading', { name: 'I dag' })).toBeVisible()
  // Dobbelttryk må ikke give to nye forekomster
  await page.getByRole('checkbox', { name: 'Markér Støvsuge som udført' }).evaluate((b: HTMLButtonElement) => {
    b.click()
    b.click()
  })
  await expect(page.getByText('Om 14 dage')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Markér Støvsuge som udført' })).toHaveCount(1)

  await page.getByRole('button', { name: /Udført for nylig/ }).click()
  await page.getByRole('checkbox', { name: 'Genåbn Støvsuge' }).click()
  await expect(page.getByText('Om 14 dage')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'Markér Støvsuge som udført' })).toHaveCount(1)
})

test('opgave: status, ansvarlig og sletning', async ({ page }) => {
  await startEmpty(page, '/hjemmet/ny')
  await page.getByPlaceholder('Fx Støvsuge stuen').fill('Rengøre ovn')
  await page.getByRole('radiogroup', { name: 'Hvem' }).getByRole('radio', { name: 'Mig' }).click()
  await page.getByRole('radiogroup', { name: 'Prioritet' }).getByRole('radio', { name: 'Høj' }).click()
  await page.getByRole('button', { name: 'Opret opgave' }).click()
  await expect(page.getByText('Uden dato')).toBeVisible()
  await expect(page.getByLabel('Høj prioritet')).toBeVisible()

  await page.getByRole('link', { name: /Rengøre ovn/ }).click()
  await page.getByRole('radiogroup', { name: 'Status' }).getByRole('radio', { name: 'I gang' }).click()
  await expect(page.getByText('I gang', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await expect(page.getByText(/I gang · Hamza/)).toBeVisible()

  await page.getByRole('link', { name: /Rengøre ovn/ }).click()
  await page.getByRole('button', { name: 'Slet opgave' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Slet' }).click()
  await expect(page.getByText('Ingen åbne opgaver')).toBeVisible()
})

test('indkøb: tilføj, kryds af, ret og ryd købte', async ({ page }) => {
  await startEmpty(page, '/indkob')
  await expect(page.getByText('Listen er tom')).toBeVisible()
  const input = page.getByLabel('Ny vare')
  await input.fill('Mælk')
  await input.press('Enter')
  await input.fill('Rugbrød')
  await page.getByRole('button', { name: 'Tilføj vare' }).click()
  await expect(page.getByText('2 varer tilbage')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Køb Mælk' }).click()
  await expect(page.getByText('1 vare tilbage')).toBeVisible()
  await expect(page.getByText('I kurven (1)')).toBeVisible()
  await expect(page.getByText('Købt af Hamza')).toBeVisible()

  await page.getByRole('button', { name: /^Rugbrød/ }).click()
  await page.locator('dialog[open]').getByLabel('Mængde').fill('1 stk.')
  await page.locator('dialog[open]').getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByText('1 stk.')).toBeVisible()

  await page.getByRole('button', { name: 'Ryd købte' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Ryd' }).click()
  await expect(page.getByText('I kurven')).toHaveCount(0)
  await expect(page.getByText('Mælk')).toHaveCount(0)
})

test('kalender: opret heldags- og tidsaftale, se i måned og på forsiden, slet', async ({ page }) => {
  await startEmpty(page, '/hjemmet/kalender')
  await expect(page.getByText('Ingen aftaler')).toBeVisible()
  await page.getByRole('button', { name: 'Aftale', exact: true }).click()
  await page.getByPlaceholder('Fx Lægetid').fill('Lægetid')
  await page.getByRole('radio', { name: 'Læge' }).click()
  await page.getByLabel('Start').fill('09:30')
  await page.getByLabel('Slut (valgfri)').fill('09:00')
  await page.getByRole('button', { name: 'Opret aftale' }).click()
  await expect(page.getByText('Sluttid skal være efter starttid')).toBeVisible()
  await page.getByLabel('Slut (valgfri)').fill('10:00')
  await page.getByRole('button', { name: 'Opret aftale' }).click()

  await expect(page.getByRole('link', { name: /Lægetid/ }).first()).toBeVisible()
  await expect(page.getByText(/09\.30–10\.00/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /i dag, 1 aftale/ })).toBeVisible()

  await page.goto('/hjemmet/kalender/ny')
  await page.getByPlaceholder('Fx Lægetid').fill('Efterårsferie')
  await page.getByRole('switch', { name: 'Hele dagen' }).click()
  await page.getByRole('switch', { name: 'Flere dage' }).click()
  await page.getByRole('button', { name: 'Opret aftale' }).click()
  await expect(page.getByText(/\d+\. \w+\. – \d+\. \w+\. · Familie/).first()).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: /Lægetid/ })).toBeVisible()

  await page.getByRole('link', { name: /Lægetid/ }).click()
  await expect(page.getByText(/Oprettet af Hamza/)).toBeVisible()
  await page.getByRole('button', { name: 'Slet aftale' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Slet' }).click()
  await expect(page.getByRole('link', { name: /Lægetid/ })).toHaveCount(0)
})

test('+-menuen: alle handlinger virker', async ({ page }) => {
  await startEmpty(page, '/')
  const nav = page.getByRole('navigation', { name: 'Hovednavigation' })
  for (const name of ['Hjem', 'Økonomi', 'Hjemmet', 'Mere']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
  for (const [name, heading] of [
    ['Ny opgave', 'Ny opgave'],
    ['Kalenderaftale', 'Ny aftale'],
    ['Kommende udgift', 'Ny kommende udgift'],
  ]) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Tilføj', exact: true }).click()
    await page.locator('dialog[open]').getByRole('button', { name }).click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
})
