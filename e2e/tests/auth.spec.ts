import { expect, test } from '@playwright/test'

test('nulstil adgangskode med kode: neutral besked, cooldown, forkert kode, ny adgangskode', async ({ page }) => {
  await page.goto('/glemt-adgangskode')
  await page.getByPlaceholder('E-mail').fill('ukendt@example.com')
  await page.getByRole('button', { name: 'Send kode' }).click()
  await expect(page.getByRole('heading', { name: 'Indtast koden' })).toBeVisible()
  await expect(page.getByText(/Hvis .* har en konto, har vi sendt en kode/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Send ny kode om \d+ s/ })).toBeDisabled()

  await page.getByLabel('Kode fra e-mailen').fill('999999')
  await page.getByRole('button', { name: 'Bekræft kode' }).click()
  await expect(page.getByText('Koden er forkert eller udløbet')).toBeVisible()

  await page.getByLabel('Kode fra e-mailen').fill('123456')
  await page.getByRole('button', { name: 'Bekræft kode' }).click()
  await expect(page.getByRole('heading', { name: 'Vælg ny adgangskode' })).toBeVisible()
  const pw = page.locator('input[autocomplete="new-password"]')
  await pw.nth(0).fill('nyKode123')
  await pw.nth(1).fill('nyKode12')
  await expect(page.getByText('Adgangskoderne er ikke ens')).toBeVisible()
  await pw.nth(1).fill('nyKode123')
  await page.getByRole('button', { name: 'Gem ny adgangskode' }).click()
  await expect(page.getByRole('heading', { name: 'Adgangskoden er ændret' })).toBeVisible()
})

test('log ud og ind igen', async ({ page }) => {
  await page.goto('/indstillinger')
  await page.getByRole('button', { name: 'Log ud' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Log ud' }).click()
  await expect(page.getByRole('heading', { name: 'Velkommen hjem' })).toBeVisible()
  await page.getByPlaceholder('E-mail').fill('hamza@demo.dk')
  await page.getByPlaceholder('Adgangskode').fill('hemmelig')
  await page.getByRole('button', { name: 'Log ind' }).click()
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
})
