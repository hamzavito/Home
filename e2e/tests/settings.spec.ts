import { expect, test } from '@playwright/test'
import { startEmpty } from './helpers'

test('standard "betalt af" bruges i nye udgifter', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Diverse/ })).toBeVisible()
  await page.goto('/indstillinger')
  await page.getByRole('radiogroup', { name: 'Betalt af som standard' }).getByRole('radio', { name: 'Fælles' }).click()
  await expect(page.getByText('Gemt')).toBeVisible()
  await page.goto('/okonomi/ny')
  await expect(page.getByRole('radiogroup', { name: 'Betalt af' }).getByRole('radio', { name: 'Fælles' })).toHaveAttribute('aria-checked', 'true')
})

test('standard opbevaring af kvitteringer gemmes og valuta er låst til DKK', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  const group = page.getByRole('radiogroup', { name: 'Gem kvitteringsbilleder i' })
  await group.getByRole('radio', { name: '6 måneder' }).click()
  await expect(page.getByText('Gemt')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('radiogroup', { name: 'Gem kvitteringsbilleder i' }).getByRole('radio', { name: '6 måneder' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('DKK', { exact: true })).toBeVisible()
})

test('eksport giver en JSON-fil med husstandens data', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Eksportér data/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^hjem-backup-\d{4}-\d{2}-\d{2}\.json$/)
})

test('skift adgangskode validerer og bekræfter', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  await page.getByRole('button', { name: /^Adgangskode/ }).click()
  const sheet = page.locator('dialog[open]')
  await sheet.getByLabel('Ny adgangskode').fill('kort')
  await expect(sheet.getByText('Mindst 8 tegn')).toBeVisible()
  await sheet.getByLabel('Ny adgangskode').fill('en-lang-adgangskode')
  await sheet.getByLabel('Gentag adgangskode').fill('en-lang-adgangskode')
  await sheet.getByRole('button', { name: 'Gem ny adgangskode' }).click()
  await expect(sheet.getByText('Din adgangskode er ændret.')).toBeVisible()
})
