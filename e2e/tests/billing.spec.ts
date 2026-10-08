import { expect, test, type Page } from '@playwright/test'
import { startEmpty } from './helpers'

async function withBilling(page: Page, mode: 'trial-ending' | 'expired') {
  await page.addInitScript((m) => {
    try {
      localStorage.setItem('hjem-demo-billing', m)
    } catch {
      /* ignorér */
    }
  }, mode)
}

test('uden betaling slået til: intet abonnement vises (jeres egen husstand)', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  await expect(page.getByRole('heading', { name: 'Indstillinger' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Abonnement/ })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('prøveperioden slutter snart: banner → vælg plan → betalt', async ({ page }) => {
  await withBilling(page, 'trial-ending')
  await startEmpty(page, '/')
  const banner = page.getByRole('status').filter({ hasText: 'Prøveperioden slutter om 3 dage.' })
  await expect(banner).toBeVisible()
  await banner.click()
  await expect(page.getByText('Gratis prøveperiode')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Årlig/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radio', { name: /Årlig/ })).toContainText('Spar 139 kr.')
  await page.getByRole('radio', { name: /Månedlig/ }).click()
  await page.getByRole('button', { name: 'Fortsæt til betaling' }).click()
  await expect(page.getByText('Tak! Betalingen er gennemført.')).toBeVisible()
  await expect(page.getByText('Aktivt', { exact: true })).toBeVisible()
  await expect(page.getByText(/Månedlig · 49\skr\. · fornyes/)).toBeVisible()
  await expect(page.getByText('Betales af dig. Alle i husstanden er med.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Administrér betaling' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.goto('/indstillinger')
  await expect(page.getByRole('link', { name: /Abonnement/ })).toContainText('Aktivt')
})

test('udløbet: alt kan ses, intet kan gemmes, før der er betalt', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()
  // Prøveperioden er udløbet
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('hjem-demo-db-v9')!)
    db['private.subscription'] = [{ billing_enabled: true, status: 'trialing', plan: null, trial_ends_at: '2026-01-01T00:00:00Z', current_period_end: null, cancel_at_period_end: false, payer_user_id: null, has_customer: false }]
    localStorage.setItem('hjem-demo-db-v9', JSON.stringify(db))
  })
  await page.goto('/okonomi/budgetter')
  await expect(page.getByRole('status').filter({ hasText: 'Abonnementet er udløbet' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()
  await page.goto('/okonomi/ny')
  await page.getByLabel('Beløb i kroner').fill('50')
  await page.getByPlaceholder('Fx Bilka').fill('Netto')
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByText('Dagligvarer').click()
  await page.getByRole('button', { name: 'Gem udgift' }).click()
  await expect(page.getByRole('alert')).toContainText('Abonnementet er udløbet')

  await page.goto('/indstillinger/abonnement')
  await expect(page.getByText('Udløbet', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fortsæt til betaling' }).click()
  await expect(page.getByText(/Årlig · 449\skr\. · fornyes/)).toBeVisible()

  await page.goto('/okonomi/ny')
  await page.getByLabel('Beløb i kroner').fill('50')
  await page.getByPlaceholder('Fx Bilka').fill('Netto')
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByText('Dagligvarer').click()
  await page.getByRole('button', { name: 'Gem udgift' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/ny'))
})
