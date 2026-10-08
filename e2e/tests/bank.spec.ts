import { expect, test } from '@playwright/test'
import { norm, startEmpty } from './helpers'

test('forbind bank → gennemgå posteringer → udgift og indtægt; kun egne', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()

  // Forbind
  await page.goto('/indstillinger')
  await page.getByRole('link', { name: /^Bank/ }).click()
  await expect(page.getByText('Kun læseadgang til dine egne konti')).toBeVisible()
  await page.getByRole('button', { name: 'Forbind bank' }).click()
  const sheet = page.locator('dialog[open]')
  await sheet.getByLabel('Søg efter bank').fill('nord')
  await expect(sheet.getByRole('button', { name: /Danske Bank/ })).toHaveCount(0)
  await sheet.getByRole('button', { name: /Nordea/ }).click()
  await expect(page.getByText('Banken er forbundet')).toBeVisible()
  await expect(page.getByText('3 posteringer er hentet')).toBeVisible()
  await page.getByRole('link', { name: 'Se posteringer' }).click()

  // Indbakke: reservationen er sprunget over, overførslen er frasorteret
  await expect(page.getByText('2 nye posteringer · kun du kan se dem')).toBeVisible()
  await page.getByRole('button', { name: /^Netto/ }).click()
  const review = page.locator('dialog[open]')
  await expect(review.getByRole('radio', { name: 'Dagligvarer' })).toHaveAttribute('aria-checked', 'true')
  await expect(review.getByLabel('Butik / beskrivelse')).toHaveValue('Netto')
  await review.getByRole('button', { name: 'Gem udgift' }).click()
  await expect(page.getByText('1 ny postering · kun du kan se dem')).toBeVisible()
  await page.getByRole('button', { name: /^Arbejdsgiver A\/S/ }).click()
  await page.locator('dialog[open]').getByLabel('Beskrivelse').fill('Løn')
  await page.locator('dialog[open]').getByRole('button', { name: 'Gem indtægt' }).click()
  await expect(page.getByText('Alt er gennemgået')).toBeVisible()
  await page.getByRole('button', { name: /Frasorteret/ }).click()
  await expect(page.getByText('Overførsel til opsparing')).toBeVisible()

  // Udgiften og indtægten er nu husstandens
  await page.goto('/okonomi/transaktioner')
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('149,95 kr.')
  await page.getByRole('link', { name: 'Indtægter' }).click()
  await expect(page.getByRole('button', { name: /Løn.*Fra banken/ })).toBeVisible()
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('28.500')

  // Partneren ser ikke Hamzas bankposteringer
  await page.evaluate(() => localStorage.setItem('hjem-demo-as', '00000000-0000-4000-8000-0000000000a2'))
  await page.goto('/okonomi/bank')
  await expect(page.getByText('Ingen bank forbundet')).toBeVisible()
  await page.evaluate(() => localStorage.setItem('hjem-demo-as', '00000000-0000-4000-8000-0000000000a1'))

  // Fjern forbindelsen
  await page.goto('/indstillinger/bank')
  await page.getByRole('button', { name: 'Fjern Nordea' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Fjern' }).click()
  await expect(page.getByText('Ingen bank forbundet endnu.')).toBeVisible()
})

test('indtægt tilføjet i hånden', async ({ page }) => {
  await startEmpty(page, '/okonomi/indtaegter')
  await expect(page.getByText('Ingen indtægter denne måned')).toBeVisible()
  await page.getByRole('button', { name: 'Indtægt' }).click()
  const sheet = page.locator('dialog[open]')
  await sheet.getByLabel('Beløb i kroner').fill('1200')
  await sheet.getByLabel('Hvad').fill('Børnepenge')
  await sheet.getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByRole('button', { name: /Børnepenge/ })).toBeVisible()
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('1.200')
  await page.getByRole('button', { name: /Børnepenge/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Slet indtægt' }).click()
  await expect(page.getByText('Ingen indtægter denne måned')).toBeVisible()
})

test('ignorér alle nye posteringer på én gang – og tag én med igen', async ({ page }) => {
  await startEmpty(page, '/indstillinger/bank')
  await page.getByRole('button', { name: 'Forbind bank' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: /Lunar/ }).click()
  await page.getByRole('link', { name: 'Se posteringer' }).click()
  await expect(page.getByText('2 nye posteringer · kun du kan se dem')).toBeVisible()
  await page.getByRole('button', { name: 'Ignorér alle' }).click()
  const sheet = page.locator('dialog[open]')
  await expect(sheet.getByText('Ignorér 2 posteringer?')).toBeVisible()
  await sheet.getByRole('button', { name: 'Ignorér alle' }).click()
  await expect(page.getByText('Alt er gennemgået')).toBeVisible()
  await page.getByRole('button', { name: /Frasorteret.*\(3\)/ }).click()
  await page.getByRole('button', { name: /^Netto.*Ignoreret/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Tag med alligevel' }).click()
  await expect(page.getByText('1 ny postering · kun du kan se dem')).toBeVisible()
})
