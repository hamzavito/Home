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
  await expect(page.getByText('6 posteringer er hentet, og 1 indtægt er godkendt automatisk')).toBeVisible()
  await page.getByRole('link', { name: 'Se posteringer' }).click()

  // Indbakke: reservationen er sprunget over, overførslen er frasorteret
  await expect(page.getByText('4 nye posteringer · kun du kan se dem')).toBeVisible()
  await expect(page.getByText(/Indtægter kommer automatisk med.*undtagen MobilePay/)).toBeVisible()
  await expect(page.getByText(/^Sidst hentet i dag kl\./)).toBeVisible()
  await page.getByRole('button', { name: /^Netto.*149,95/ }).click()
  const review = page.locator('dialog[open]')
  await expect(review.getByText(/andre og fremtidige køb hos Netto kommer automatisk/)).toBeVisible()
  await expect(review.getByRole('radio', { name: 'Dagligvarer' })).toHaveAttribute('aria-checked', 'true')
  await expect(review.getByLabel('Butik / beskrivelse')).toHaveValue('Netto')
  await review.getByRole('button', { name: 'Gem udgift' }).click()
  // Den anden Netto-postering kom automatisk med; tilbage er huslejen og MobilePay
  await expect(page.getByText('2 nye posteringer · kun du kan se dem')).toBeVisible()
  await page.getByRole('button', { name: /^Boligselskabet/ }).click()
  const fixed = page.locator('dialog[open]')
  await fixed.getByRole('button', { name: 'Det er en fast udgift' }).click()
  await fixed.getByRole('button', { name: 'Opret standardgrupper' }).click()
  await expect(fixed.getByRole('radio', { name: 'Bolig' })).toHaveAttribute('aria-checked', 'true')
  await fixed.getByLabel('Navn').fill('Husleje')
  await fixed.getByRole('button', { name: 'Gem som fast' }).click()
  // MobilePay ind godkendes ikke automatisk – det gør man selv
  await expect(page.getByText('1 ny postering · kun du kan se dem')).toBeVisible()
  await page.getByRole('button', { name: /^MobilePay.*250/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Gem indtægt' }).click()
  await expect(page.getByText('Alt er gennemgået')).toBeVisible()
  await page.getByRole('button', { name: 'Hent nye posteringer' }).click()
  await expect(page.getByText('Ingen nye bogførte posteringer. 1 kortkøb er reserveret og kommer til godkendelse, når banken har bogført det.')).toBeVisible()
  // Reservationen vises med det samme, men kan ikke godkendes endnu
  await expect(page.getByText('Reserveret – venter på banken (1)')).toBeVisible()
  await expect(page.getByText('Reservation', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Frasorteret/ }).click()
  await expect(page.getByText('Overførsel til opsparing')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Boligselskabet.*Fast udgift/ })).toBeVisible()
  // Huslejen står nu under faste poster
  await page.goto('/okonomi/faste')
  await expect(page.getByText('Husleje')).toBeVisible()

  // Udgiften og indtægten er nu husstandens
  await page.goto('/okonomi/transaktioner')
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('149,95 kr.')
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('50 kr.')
  expect(norm(await page.locator('main').textContent())).not.toContain('9.500')
  await page.getByRole('link', { name: 'Indtægter' }).click()
  await expect(page.getByRole('button', { name: /Arbejdsgiver A\/S.*Fra banken/ })).toBeVisible()
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('28.500')

  // Partneren ser ikke Hamzas bankposteringer
  await page.evaluate(() => localStorage.setItem('hjem-demo-as', '00000000-0000-4000-8000-0000000000a2'))
  await page.goto('/okonomi/bank')
  await expect(page.getByText('Ingen bank forbundet')).toBeVisible()
  await page.evaluate(() => localStorage.setItem('hjem-demo-as', '00000000-0000-4000-8000-0000000000a1'))

  // Huskede butikker kan glemmes
  await page.goto('/indstillinger/bank')
  await expect(page.getByText('Huskede butikker')).toBeVisible()
  await expect(page.getByText('Fast udgift · Husleje')).toBeVisible()
  await page.getByRole('button', { name: 'Glem Netto' }).click()
  await page.getByRole('button', { name: 'Glem Boligselskabet' }).click()
  await expect(page.getByText('Huskede butikker')).toHaveCount(0)

  // Fjern forbindelsen
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
  await expect(page.getByText('4 nye posteringer · kun du kan se dem')).toBeVisible()
  await page.getByRole('button', { name: 'Ignorér alle' }).click()
  const sheet = page.locator('dialog[open]')
  await expect(sheet.getByText('Ignorér 4 posteringer?')).toBeVisible()
  await sheet.getByRole('button', { name: 'Ignorér alle' }).click()
  await expect(page.getByText('Alt er gennemgået')).toBeVisible()
  await page.getByRole('button', { name: /Frasorteret.*\(5\)/ }).click()
  await page.getByRole('button', { name: /^Netto.*149,95/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Tag med alligevel' }).click()
  await expect(page.getByText('1 ny postering · kun du kan se dem')).toBeVisible()
})

test('godkend alle med kategoriforslag på én gang', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()
  await page.goto('/indstillinger/bank')
  await page.getByRole('button', { name: 'Forbind bank' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: /Lunar/ }).click()
  await page.getByRole('link', { name: 'Se posteringer' }).click()
  await page.getByRole('button', { name: 'Godkend 2 med forslag' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Godkend' }).click()
  // Kun huslejen (uden forslag) og MobilePay er tilbage – lønnen kom automatisk med som indtægt
  await expect(page.getByText('2 nye posteringer · kun du kan se dem')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Godkend \d+ med forslag/ })).toHaveCount(0)
  await page.goto('/okonomi/transaktioner')
  await expect.poll(async () => norm(await page.locator('main').textContent())).toContain('2 udgifter')
})

test('henter automatisk, når appen åbnes og der er gået et stykke tid', async ({ page }) => {
  await startEmpty(page, '/indstillinger/bank')
  await page.getByRole('button', { name: 'Forbind bank' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: /Lunar/ }).click()
  await expect(page.getByText('Banken er forbundet')).toBeVisible()
  // Sidste hentning for to dage siden
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('hjem-demo-db-v9')!)
    for (const c of db['private.bank_connections']) c.last_synced_at = new Date(Date.now() - 2 * 86_400_000).toISOString()
    localStorage.setItem('hjem-demo-db-v9', JSON.stringify(db))
  })
  await page.goto('/okonomi/bank')
  await expect(page.getByText(/^Sidst hentet i dag kl\./)).toBeVisible()
  await expect(page.getByText('Reserveret – venter på banken (1)')).toBeVisible()
})
