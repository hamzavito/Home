import { expect, test } from '@playwright/test'
import { expectReadable, startEmpty } from './helpers'

test('ny version: brugeren bliver spurgt og kan opdatere', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('updated')) {
      localStorage.setItem('hjem-demo-update', '1')
      sessionStorage.setItem('updated', '1')
    }
  })
  await startEmpty(page, '/')
  await expect(page.getByText('Ny version af Hjem er klar')).toBeVisible()
  await expectReadable(page, 'opdatering')
  await page.getByRole('button', { name: 'Opdatér' }).click()
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
  await expect(page.getByText('Ny version af Hjem er klar')).toHaveCount(0)
})

test('ny version kan udskydes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hjem-demo-update', '1'))
  await startEmpty(page, '/')
  await page.getByRole('button', { name: 'Senere' }).click()
  await expect(page.getByText('Ny version af Hjem er klar')).toHaveCount(0)
})

test('offline: tydelig besked, forsvinder når nettet er tilbage', async ({ page, context }) => {
  await startEmpty(page, '/')
  await context.setOffline(true)
  await expect(page.getByText(/Ingen forbindelse/)).toBeVisible()
  await expectReadable(page, 'offline')
  await context.setOffline(false)
  await expect(page.getByText(/Ingen forbindelse/)).toHaveCount(0)
})

test('log ud fjerner private data fra enheden', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  await page.evaluate(() => sessionStorage.setItem('hjem.reset-sent', '123'))
  await page.getByRole('button', { name: 'Log ud' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Log ud' }).click()
  await expect(page.getByRole('button', { name: 'Log ind' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hjem.auth')))).toEqual([])
  // Beskyttede sider viser login, så længe man er logget ud
  await page.getByRole('button', { name: 'Log ind' }).waitFor()
  expect(page.url()).toContain('/login')
})
