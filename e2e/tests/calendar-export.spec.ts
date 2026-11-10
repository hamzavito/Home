import { expect, test } from '@playwright/test'
import { startEmpty } from './helpers'

test('kalenderen viser en knap til månedseksport', async ({ page }) => {
  await startEmpty(page, '/hjemmet/kalender')
  await expect(page.getByRole('button', { name: /Eksportér måneden/ })).toBeVisible()
  await expect(page.getByText(/Ingen automatisk synkronisering/)).toBeVisible()
})
