import { expect, test, type Page } from '@playwright/test'
import { expectReadable, norm, startEmpty } from './helpers'

const sheet = (page: Page) => page.locator('dialog[open]')
const mainText = async (page: Page) => norm(await page.locator('main').textContent())

async function setupBudgets(page: Page) {
  // Faste udgifter 23.822,13 kr. (standardgrupperne oprettes, når siden åbnes)
  await page.goto('/okonomi/faste/ny?type=expense')
  await page.getByLabel('Beløb i kroner').fill('23822,13')
  await page.getByPlaceholder('Fx Husleje').fill('Faste udgifter')
  await page.getByRole('radio', { name: 'Bolig', exact: true }).click()
  await page.getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByRole('heading', { name: 'Faste udgifter' })).toBeVisible()
  // Buffer 2.000 fast, Mad 65 %, Hygge 35 %
  const cat = async (name: string, rule: { amount?: string; percent?: string }, reserve = false) => {
    await page.goto('/okonomi/budgetter/ny')
    if (rule.percent) {
      await page.getByRole('radio', { name: 'Procent' }).click()
      await page.getByLabel('Procent af til fordeling').fill(rule.percent)
    } else await page.getByLabel('Beløb pr. måned i kroner').fill(rule.amount!)
    await page.getByPlaceholder('Fx Dagligvarer').fill(name)
    if (reserve) await page.getByRole('radio', { name: 'Reserve / buffer' }).click()
    await page.getByRole('button', { name: 'Opret kategori' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }
  await cat('Buffer', { amount: '2000' }, true)
  await cat('Mad', { percent: '65' })
  await cat('Hygge', { percent: '35' })
}

test('indtægtskilde med varierende løn → månedens plan fordeler præcist; manuel måned; over 100 % afvises', async ({ page }) => {
  await startEmpty(page, '/okonomi/indtaegter')
  // Indtægtskilde: Løn – Hamza (ingen forventet beløb)
  await page.getByRole('button', { name: 'Ny kilde' }).click()
  await sheet(page).getByLabel('Navn').fill('Løn – Hamza')
  await sheet(page).getByRole('radio', { name: 'Løn' }).click()
  await sheet(page).getByRole('button', { name: 'Opret kilde' }).click()
  await expect(sheet(page)).toHaveCount(0)

  // Manuel løn uden bank: 29.000 kr. den sidste i måneden
  await page.getByRole('button', { name: 'Indtægt', exact: true }).click()
  await sheet(page).getByLabel('Beløb i kroner').fill('29000')
  await sheet(page).getByLabel('Indtægtskilde').selectOption({ label: 'Løn – Hamza' })
  await expect(sheet(page).getByRole('radio', { name: 'Løn' })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet(page).getByLabel('Beskrivelse')).toHaveValue('Løn – Hamza')
  await sheet(page).getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByRole('button', { name: /Løn – Hamza.*29\.000/ }).first()).toBeVisible()
  await expectReadable(page, 'indtægter')

  await setupBudgets(page)

  // Månedens plan
  await page.goto('/okonomi/plan')
  await expect.poll(() => mainText(page)).toContain('Til fordeling')
  const text = await mainText(page)
  for (const v of ['29.000,00 kr.', '23.822,13 kr.', '5.177,87 kr.', '2.000,00 kr.', '3.177,87 kr.', '2.065,62 kr.', '1.112,25 kr.', 'Automatisk: 65 %', 'Automatisk: 35 %', 'Faktisk']) {
    expect(text, v).toContain(v)
  }
  expect(text).toContain('Alt er fordelt')
  await expectReadable(page, 'månedens plan')
  await page.screenshot({ path: test.info().outputPath('maanedens-plan.png'), fullPage: true })

  // Manuel overstyring kun denne måned
  await page.getByRole('button', { name: /^Mad/ }).click()
  await sheet(page).getByLabel('Beløb denne måned').fill('3500')
  await sheet(page).getByRole('button', { name: /^Gem for/ }).click()
  await expect(page.getByText(/Manuel for .*: 3\.500,00 kr\./)).toBeVisible()
  await expect.poll(() => mainText(page)).toContain('1.112,25 kr.')
  await expect(page.getByText('Overfordelt', { exact: true })).toBeVisible()
  // Næste måned: tilbage til automatisk (og ingen løn endnu)
  await page.getByRole('button', { name: 'Næste måned' }).click()
  await expect(page.getByText('Automatisk: 65 %')).toBeVisible()
  // Tilbage og fjern overstyringen
  await page.getByRole('button', { name: 'Forrige måned' }).click()
  await page.getByRole('button', { name: /^Mad/ }).click()
  await sheet(page).getByRole('button', { name: 'Brug automatisk igen' }).click()
  await expect(page.getByText('Automatisk: 65 %')).toBeVisible()

  // Over 100 % kan ikke gemmes
  await page.goto('/okonomi/budgetter')
  await page.getByRole('link', { name: /Hygge/ }).click()
  await page.getByRole('button', { name: 'Ændr standard' }).click()
  await sheet(page).getByLabel('Procent af til fordeling').fill('50')
  await sheet(page).getByRole('button', { name: 'Gem standardbudget' }).click()
  await expect(page.getByText(/højst være 100 %/)).toBeVisible()
})

test('bank: løn fra samme afsender genkendes som samme kilde, selv om beløbet varierer', async ({ page }) => {
  await startEmpty(page, '/okonomi/indtaegter')
  // Kilde med forventet beløb (fast indtægt): forslaget kan bygge på ejer og beløb
  await page.getByRole('button', { name: 'Ny kilde' }).click()
  await sheet(page).getByLabel('Navn').fill('Løn – Hamza')
  await sheet(page).getByRole('radio', { name: 'Løn' }).click()
  await sheet(page).getByLabel('Forventet beløb pr. måned (valgfrit)').fill('29000')
  await sheet(page).getByRole('button', { name: 'Opret kilde' }).click()
  await expect(page.getByRole('button', { name: /Løn – Hamza.*Forventet/ })).toBeVisible()

  // Forbind bank: lønnen (28.500 kr.) kommer automatisk med og foreslås som Løn – Hamza
  await page.goto('/indstillinger/bank')
  await page.getByRole('button', { name: 'Forbind bank' }).click()
  await sheet(page).getByRole('button', { name: /Lunar/ }).click()
  await expect(page.getByText('Banken er forbundet')).toBeVisible()
  await page.goto('/okonomi/indtaegter')
  const row = page.getByRole('button', { name: /^Arbejdsgiver A\/S/ })
  await expect(row).toContainText('Løn – Hamza')
  await expect(row).toContainText('Forslag')
  await expect(page.getByRole('button', { name: /Løn – Hamza.*Forslag venter/ })).toBeVisible()
  // Planen bruger det faktiske beløb
  await page.goto('/okonomi/plan')
  await expect(page.getByText(/indtægt.* fra banken venter på, at du bekræfter kilden/)).toBeVisible()
  await expect.poll(() => mainText(page)).toContain('28.500,00 kr.')
  // Bekræft forslaget
  await page.goto('/okonomi/indtaegter')
  await page.getByRole('button', { name: /Bekræft Løn – Hamza/ }).click()
  await expect(page.getByRole('button', { name: /^Arbejdsgiver A\/S/ })).not.toContainText('Forslag')
  // Samme banktransaktion tæller kun én gang, selv efter ny hentning
  await page.goto('/okonomi/bank')
  await page.getByRole('button', { name: 'Hent nye posteringer' }).click()
  await page.goto('/okonomi/indtaegter')
  await expect(page.getByRole('button', { name: /^Arbejdsgiver A\/S/ })).toHaveCount(1)
})
