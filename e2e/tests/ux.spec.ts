import { expect, test } from '@playwright/test'
import { startDemo } from './helpers'

test('forside → Mad → udgift → kvittering → og hele vejen tilbage', async ({ page }) => {
  await startDemo(page, '/')
  await page.getByRole('link', { name: /% Mad / }).first().click()
  await expect(page.getByRole('heading', { name: 'Mad' })).toBeVisible()

  await page.getByRole('link', { name: /Bilka.*638,75/ }).first().click()
  await expect(page.getByText('Kvittering', { exact: true }).first()).toBeVisible()
  const txUrl = page.url()

  await page.getByRole('link', { name: /Kvittering/ }).first().click()
  await expect(page.getByText('Kvittering', { exact: true }).first()).toBeVisible()
  expect(page.url()).toContain('/kvitteringer/')

  // Tilbage følger vejen man kom
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await expect(page).toHaveURL(txUrl)
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await expect(page.getByRole('heading', { name: 'Mad' })).toBeVisible()
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
})

test('direkte link til en side går tilbage til en fornuftig forælder', async ({ page }) => {
  await startDemo(page, '/okonomi/kommende')
  await page.getByRole('link', { name: /Tandlæge/ }).click()
  const url = page.url()
  // Åbn detaljen direkte (fx fra et bogmærke) – tilbage går til listen, ikke ud af appen
  await page.goto(url)
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await expect(page.getByRole('heading', { name: 'Kommende udgifter' })).toBeVisible()
})

test('gem i en formular lægger ikke listen dobbelt i historikken', async ({ page }) => {
  await startDemo(page, '/hjemmet')
  await page.getByRole('button', { name: 'Opgave' }).click()
  await page.getByPlaceholder('Fx Støvsuge stuen').fill('Vande blomster')
  await page.getByRole('button', { name: 'Opret opgave' }).click()
  await expect(page.getByRole('link', { name: /Vande blomster/ })).toBeVisible()
  await page.getByRole('link', { name: /Vande blomster/ }).click()
  await page.getByRole('button', { name: 'Tilbage' }).click()
  await expect(page.getByRole('heading', { name: 'Hjemmet' })).toBeVisible()
})

test('ukendte id’er og adresser giver en pæn besked', async ({ page }) => {
  await startDemo(page, '/hjemmet/opgave/00000000-0000-0000-0000-000000000000')
  await expect(page.getByText('Opgaven findes ikke')).toBeVisible()
  await page.goto('/hjemmet/kalender/00000000-0000-0000-0000-000000000000')
  await expect(page.getByText('Aftalen findes ikke')).toBeVisible()
  await page.goto('/okonomi/udgift/00000000-0000-0000-0000-000000000000')
  await expect(page.getByText(/findes ikke/).first()).toBeVisible()
  await page.goto('/noget/helt/andet')
  await expect(page.getByText('Siden findes ikke')).toBeVisible()
  await page.getByRole('button', { name: 'Gå til forsiden' }).click()
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
})
