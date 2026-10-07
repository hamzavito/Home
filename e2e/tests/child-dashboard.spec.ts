import { expect, test, type Page } from '@playwright/test'
import { expectReadable } from './helpers'

const NOAH = '00000000-0000-4000-8000-0000000000b1'
const ME = '00000000-0000-4000-8000-0000000000a1'
const sheet = (page: Page) => page.locator('dialog[open]')
const saldo = (page: Page) => page.getByText('Noahs saldo').locator('..')

async function startFamily(page: Page, path = '/') {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('hjem-demo-mode', 'empty')
      localStorage.setItem('hjem-demo-kids', '1')
    } catch {
      /* ignorér */
    }
  })
  await page.goto(path)
  await expect(page.getByRole('heading').first()).toBeVisible()
}

async function loginAs(page: Page, userId: string) {
  await page.evaluate((id) => localStorage.setItem('hjem-demo-as', id), userId)
  await page.goto('/')
  await expect(page.getByRole('heading').first()).toBeVisible()
}

async function rewardTask(page: Page, title: string, kr: string) {
  await page.goto(`/hjemmet/ny?ansvarlig=${NOAH}`)
  await page.getByPlaceholder('Fx Støvsuge stuen').fill(title)
  await page.getByLabel('Belønning (valgfri)').fill(kr)
  await page.getByRole('button', { name: 'Opret opgave' }).click()
  await expect(page).not.toHaveURL(/\/hjemmet\/ny/)
}

test('belønning: barnet markerer færdig → forælder godkender og udbetaler præcis én gang', async ({ page }) => {
  await startFamily(page, '/hjemmet')
  // Børnene er en del af Hjemmet
  const kids = page.getByRole('link', { name: /^Noah/ })
  await expect(page.getByRole('heading', { name: 'Børn' })).toBeVisible()
  await expect(kids).toContainText(/0 opgaver · 0 kr\./)
  await expect(page.getByRole('link', { name: /^Lina/ })).toBeVisible()

  await rewardTask(page, 'Tøm opvaskemaskinen', '20')
  await rewardTask(page, 'Red seng', '10')
  await page.goto('/hjemmet')
  await expect(kids).toContainText('2 opgaver')

  // Barnet gør opgaverne færdige – ingen penge endnu
  await loginAs(page, NOAH)
  const nav = page.getByRole('navigation', { name: 'Hovednavigation' })
  await nav.getByRole('link', { name: 'Opgaver' }).click()
  await expect(page.getByText('+20 kr.')).toBeVisible()
  await page.getByRole('button', { name: /Markér Tøm opvaskemaskinen som færdig/ }).click()
  await page.getByRole('button', { name: /Markér Red seng som færdig/ }).click()
  await expect(page.getByText('Afventer godkendelse')).toHaveCount(2)
  await nav.getByRole('link', { name: 'Penge' }).click()
  await expect(page.getByText('Min saldo', { exact: true }).locator('..')).toContainText(/Min saldo\s*0\s*kr\./)

  // Forælderen ser det i Hjemmet og godkender
  await loginAs(page, ME)
  await page.goto('/hjemmet')
  await expect(kids).toContainText('2 afventer godkendelse')
  await kids.click()
  await expect(page.getByRole('heading', { name: 'Afventer godkendelse' })).toBeVisible()
  const card = page.getByLabel('Afventer godkendelse: Tøm opvaskemaskinen')
  await expect(card).toContainText('20 kr.')
  await expectReadable(page, 'barnets overblik')
  // Dobbelttryk: kun én udbetaling
  await card.getByRole('button', { name: 'Godkend og udbetal' }).dblclick()
  await expect(card).toHaveCount(0)
  await expect(saldo(page)).toContainText(/20\s*kr\./)
  await expect(page.getByText('Opgave: Tøm opvaskemaskinen')).toHaveCount(1)
  await expect(page.getByRole('link', { name: /Tøm opvaskemaskinen\s*20 kr\. · Udbetalt/ })).toBeVisible()

  // Afvis den anden
  await page.getByLabel('Afventer godkendelse: Red seng').getByRole('button', { name: 'Afvis' }).click()
  await expect(page.getByRole('link', { name: /Red seng\s*10 kr\. · Afvist/ })).toBeVisible()
  await expect(saldo(page)).toContainText(/20\s*kr\./)
  await page.reload()
  await expect(saldo(page)).toContainText(/20\s*kr\./)

  // Barnet ser status; genåbning af en udbetalt opgave trækker ikke pengene tilbage
  await loginAs(page, NOAH)
  await nav.getByRole('link', { name: 'Opgaver' }).click()
  await expect(page.getByText('Udbetalt')).toBeVisible()
  await expect(page.getByText('Afvist')).toBeVisible()
  await page.getByRole('group', { name: 'Tøm opvaskemaskinen' }).getByRole('button', { name: 'Ikke færdig alligevel' }).click()
  await nav.getByRole('link', { name: 'Penge' }).click()
  await expect(page.getByText('Min saldo', { exact: true }).locator('..')).toContainText(/Min saldo\s*20\s*kr\./)
  await expect(page.getByText('Opgave: Tøm opvaskemaskinen')).toBeVisible()
})

test('faste lommepenge: opret, udbetal én gang, pause, genoptag, ændr beløb og stop', async ({ page }) => {
  await startFamily(page, `/hjemmet/barn/${NOAH}`)
  const weekday = await page.evaluate(() => ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'][(new Date().getDay() + 6) % 7]!)
  await expect(page.getByRole('heading', { name: 'Faste lommepenge' })).toBeVisible()
  await page.getByRole('button', { name: 'Opret fast lommepenge' }).click()
  await sheet(page).getByLabel('Beløb').fill('50')
  await expect(sheet(page).getByRole('radio', { name: 'fredag' })).toHaveAttribute('aria-checked', 'true')
  await sheet(page).getByRole('radio', { name: weekday }).click()
  await sheet(page).getByRole('button', { name: 'Opret fast lommepenge' }).click()
  await expect(sheet(page)).toHaveCount(0)

  // Forfalder i dag → udbetales straks
  const plan = page.getByRole('button', { name: new RegExp(`50 kr\\.\\s*Hver ${weekday}`) })
  await expect(plan).toContainText('Næste:')
  await expect(saldo(page)).toContainText(/50\s*kr\./)
  await expect(page.getByText('Fast lommepenge', { exact: true })).toHaveCount(1)
  // Jobbet kører igen ved genindlæsning – ingen dublet
  await page.reload()
  await expect(saldo(page)).toContainText(/50\s*kr\./)
  await expect(page.getByText('Fast lommepenge', { exact: true })).toHaveCount(1)

  // Pause og genoptag samme dag: ingen ekstra udbetaling
  await plan.click()
  await expect(sheet(page).getByText('+50 kr.')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: /50 kr\.\s*Hver .* · På pause/ })).toBeVisible()
  await page.getByRole('button', { name: /^50 kr\./ }).click()
  await sheet(page).getByRole('button', { name: 'Genoptag' }).click()
  await expect(plan).toContainText('Næste:')
  await expect(saldo(page)).toContainText(/50\s*kr\./)

  // Nyt beløb gælder fremad; historikken er uændret
  await plan.click()
  await sheet(page).getByLabel('Beløb (kr.)').fill('60')
  await sheet(page).getByRole('button', { name: 'Gem ændringer' }).click()
  const plan60 = page.getByRole('button', { name: new RegExp(`60 kr\\.\\s*Hver ${weekday}`) })
  await expect(plan60).toBeVisible()
  await plan60.click()
  await expect(sheet(page).getByText('+50 kr.')).toBeVisible()
  // Stop
  await sheet(page).getByRole('button', { name: 'Stop' }).click()
  await sheet(page).getByRole('button', { name: 'Ja, stop' }).click()
  await expect(plan60).toHaveCount(0)
  await expect(saldo(page)).toContainText(/50\s*kr\./)

  // Månedligt: sidste dag i måneden
  await page.getByRole('button', { name: 'Opret fast lommepenge' }).click()
  await sheet(page).getByLabel('Beløb').fill('200')
  await sheet(page).getByRole('radio', { name: 'Månedligt' }).click()
  await sheet(page).getByLabel('Dag i måneden').selectOption('0')
  await sheet(page).getByRole('button', { name: 'Opret fast lommepenge' }).click()
  await expect(page.getByRole('button', { name: /200 kr\.\s*Sidste dag i hver måned · Næste:/ })).toBeVisible()

  // Barnet kan ikke se ordningerne – kun bevægelserne
  await loginAs(page, NOAH)
  await page.getByRole('navigation', { name: 'Hovednavigation' }).getByRole('link', { name: 'Penge' }).click()
  await expect(page.getByText('Fast lommepenge', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Faste lommepenge')).toHaveCount(0)
})
