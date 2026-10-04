import { expect, test } from '@playwright/test'
import { norm, startEmpty } from './helpers'

// Husstandens rigtige tal: 30.000 − 23.822,13 = 6.177,87 − buffer 2.000 = 4.177,87 → 65/35 %
const EXPENSES: Array<[string, string, string, boolean?]> = [
  ['Husleje', '8913', 'Bolig'],
  ['El, vand og varme', '2464', 'Bolig'],
  ['Cupra Tavascan', '2703,50', 'Transport'],
  ['Bilafbetaling', '3798', 'Transport'],
  ['Clever', '511', 'Transport', true],
  ['Forsikringer', '611,50', 'Forsikring'],
  ['Canva', '95,88', 'Abonnementer'],
  ['Apple', '25', 'Abonnementer'],
  ['Mobilabonnement', '478', 'Abonnementer'],
  ['Legeland', '105,25', 'Abonnementer'],
  ['Bankabonnement', '79', 'Abonnementer'],
  ['Fagforening', '560', 'Andet'],
  ['Afbetaling', '2000', 'Gæld'],
  ['Opsparing', '1500', 'Opsparing'],
  ['Rejsegruppe', '1000', 'Opsparing'],
]

test('fast økonomi, fordeling og historik med husstandens tal', async ({ page }) => {
  await startEmpty(page, '/okonomi/faste')

  // Indtægt
  await page.getByRole('button', { name: 'Tilføj indtægt' }).click()
  await page.getByLabel('Beløb i kroner').fill('30000')
  await page.getByPlaceholder('Fx Min løn').fill('Nettoindkomst')
  await page.getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByRole('heading', { name: 'Nettoindkomst' })).toBeVisible()

  // Faste udgifter
  for (const [name, amount, group, negative] of EXPENSES) {
    await page.goto('/okonomi/faste/ny?type=expense')
    await page.getByLabel('Beløb i kroner').fill(amount)
    if (negative) await page.getByRole('radio', { name: 'Modregning (−)' }).click()
    await page.getByPlaceholder('Fx Husleje').fill(name)
    await page.getByRole('radio', { name: group, exact: true }).click()
    await page.getByRole('button', { name: 'Gem' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }

  await page.goto('/okonomi/faste')
  await expect(page.getByText('Tilbage efter faste udgifter')).toBeVisible()
  const hero = norm(await page.locator('main').textContent())
  expect(hero).toContain('30.000,00 kr.')
  expect(hero).toContain('−23.822,13 kr.')
  expect(hero).toContain('6.177,87')

  // Variable budgetter: Buffer (reserve, 2.000), Mad 65 %, Hygge 35 %
  const newCategory = async (name: string, rule: { amount?: string; percent?: string }, reserve = false) => {
    await page.goto('/okonomi/budgetter/ny')
    if (rule.percent) {
      await page.getByRole('radio', { name: 'Procent' }).click()
      await page.getByLabel('Procent af til fordeling').fill(rule.percent)
    } else {
      await page.getByLabel('Beløb pr. måned i kroner').fill(rule.amount!)
    }
    await page.getByPlaceholder('Fx Dagligvarer').fill(name)
    if (reserve) await page.getByRole('radio', { name: 'Reserve / buffer' }).click()
    await page.getByRole('button', { name: 'Opret kategori' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }
  await newCategory('Buffer', { amount: '2000' }, true)
  await newCategory('Mad', { percent: '65' })
  await newCategory('Hygge', { percent: '35' })

  // Vandfaldet i Overblik
  await page.goto('/okonomi')
  await expect(page.getByText('Månedens plan')).toBeVisible()
  const waterfall = norm(await page.locator('main').textContent())
  for (const v of ['30.000,00 kr.', '23.822,13 kr.', '6.177,87 kr.', '2.000,00 kr.', '4.177,87 kr.', '2.715,62 kr.', '1.462,25 kr.', 'Ufordelt0,00 kr.']) {
    expect(waterfall, v).toContain(v)
  }
  await page.screenshot({ path: test.info().outputPath('overblik.png'), fullPage: true })

  // Historik: mobil 478 → 499 fra næste måned; denne måned uændret
  await page.goto('/okonomi/faste')
  await page.getByRole('link', { name: /Mobilabonnement/ }).click()
  await page.getByRole('button', { name: 'Ændr beløb' }).click()
  await page.getByLabel('Nyt beløb i kroner').fill('499')
  await page.getByRole('button', { name: 'Senere måned' }).click()
  await page.getByRole('button', { name: 'Gem nyt beløb' }).click()
  await expect(page.getByText('Planlagt')).toBeVisible()

  await page.goto('/okonomi')
  await expect(page.getByText('Månedens plan')).toBeVisible()
  expect(norm(await page.locator('main').textContent())).toContain('23.822,13 kr.')
  await page.getByRole('button', { name: 'Næste måned' }).click()
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('23.843,13 kr.')

  // Dashboard viser planen
  await page.goto('/')
  await expect(page.getByText('Månedens plan')).toBeVisible()
  expect(norm(await page.locator('main').textContent())).toContain('6.178 kr.')
})

test('udgift: opret, redigér, slet – budgettet følger med', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()

  await page.goto('/okonomi/ny')
  await page.getByLabel('Beløb i kroner').fill('638,75')
  await page.getByPlaceholder('Fx Bilka').fill('Bilka')
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByText('Dagligvarer').click()
  await page.getByRole('radiogroup', { name: 'Betalt af' }).getByText('Fælles').click()
  await page.getByRole('button', { name: 'Gem udgift' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/ny'))

  await page.goto('/okonomi/transaktioner')
  await expect(page.getByText('Bilka')).toBeVisible()
  expect(norm(await page.locator('main').textContent())).toContain('638,75 kr.')

  await page.getByRole('link', { name: /Bilka/ }).click()
  await page.getByLabel('Beløb i kroner').fill('700')
  await page.getByRole('button', { name: 'Gem ændringer' }).click()
  await page.waitForURL((u) => !u.pathname.includes('/udgift/'))
  await page.goto('/okonomi/transaktioner')
  expect(norm(await page.locator('main').textContent())).toContain('700 kr.')

  await page.getByRole('link', { name: /Bilka/ }).click()
  await page.getByRole('button', { name: 'Slet udgift' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Slet' }).click()
  await page.waitForURL((u) => !u.pathname.includes('/udgift/'))
  await page.goto('/okonomi/transaktioner')
  await expect(page.getByText('Ingen udgifter')).toBeVisible()
})
