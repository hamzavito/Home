import { expect, test } from '@playwright/test'
import { norm, startEmpty } from './helpers'

test('kommende udgift → betalt → registreret én gang → fortryd', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Diverse/ })).toBeVisible()

  await page.goto('/okonomi/kommende/ny')
  await page.getByLabel('Beløb i kroner').fill('1200')
  await page.getByPlaceholder('Fx Tandlæge').fill('Tandlæge')
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByText('Diverse').click()
  await page.getByRole('button', { name: 'Gem kommende udgift' }).click()
  await expect(page.getByRole('link', { name: /Tandlæge/ })).toBeVisible()

  // Påvirker ikke budgettet endnu
  await page.goto('/okonomi/transaktioner')
  await expect(page.getByText('Ingen udgifter')).toBeVisible()

  // Vises på forsiden
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Tandlæge/ })).toBeVisible()
  await page.getByRole('link', { name: /Tandlæge/ }).click()

  await page.getByRole('button', { name: 'Markér som betalt' }).click()
  await expect(page.getByText('Vil du registrere denne som en udgift?')).toBeVisible()
  await page.getByRole('button', { name: /Ja, registrér/ }).evaluate((b: HTMLButtonElement) => {
    b.click()
    b.click()
  })
  await expect(page.getByText('Registreret som udgift og trukket fra budgettet.')).toBeVisible()

  await page.goto('/okonomi/transaktioner')
  await expect(page.getByText('Tandlæge')).toBeVisible()
  expect(norm(await page.locator('main').textContent()).match(/Tandlæge/g)?.length).toBe(1)

  // Fortryd betaling sletter den registrerede udgift
  await page.goto('/okonomi/kommende')
  await page.getByRole('link', { name: /Tandlæge/ }).click()
  await page.getByRole('button', { name: 'Fortryd betaling' }).click()
  await expect(page.getByRole('button', { name: 'Markér som betalt' })).toBeVisible()
  await page.goto('/okonomi/transaktioner')
  await expect(page.getByText('Ingen udgifter')).toBeVisible()
})

test('opsparingsmål: indbetal, hæv, kan ikke hæve for meget, forside', async ({ page }) => {
  await startEmpty(page, '/opsparing/ny')
  await page.getByLabel('Målbeløb i kroner').fill('25000')
  await page.getByPlaceholder('Fx Ferie, Nødbuffer, Umrah').fill('Ferie')
  await page.getByRole('button', { name: 'Opret mål' }).click()
  await expect(page.getByRole('heading', { name: 'Ferie' })).toBeVisible()

  await page.getByRole('button', { name: 'Indbetal' }).click()
  await page.locator('dialog[open]').getByLabel('Beløb i kroner').fill('5000')
  await page.locator('dialog[open]').getByRole('button', { name: 'Indbetal' }).click()
  await expect(page.getByText('20 %')).toBeVisible()

  await page.getByRole('button', { name: 'Hæv' }).click()
  await page.locator('dialog[open]').getByLabel('Beløb i kroner').fill('6000')
  await expect(page.getByText('Der er kun 5.000 kr. på målet.')).toBeVisible()
  await page.locator('dialog[open]').getByLabel('Beløb i kroner').fill('1000')
  await page.locator('dialog[open]').getByRole('button', { name: 'Hæv' }).click()
  await expect(page.getByText('16 %')).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: /Ferie/ })).toBeVisible()
  expect(norm(await page.locator('main').textContent())).toContain('4.000')
})
