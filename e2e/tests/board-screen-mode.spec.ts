import { expect, test } from '@playwright/test'
import { startEmpty } from './helpers'

test('familietavlen kan skifte til og fra TV-visning', async ({ page }) => {
  await startEmpty(page, '/tavle')
  const enter = page.getByRole('button', { name: 'TV-visning' })
  await expect(enter).toBeVisible()
  await enter.click()
  await expect(page.getByRole('button', { name: 'Afslut TV-visning' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: 'Tilbage til Hjemmet' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Afslut TV-visning' }).click()
  await expect(page.getByRole('link', { name: 'Tilbage til Hjemmet' })).toBeVisible()
})
