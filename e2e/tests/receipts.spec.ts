import { expect, test, type Page } from '@playwright/test'
import { norm, startEmpty } from './helpers'

/** Genererer et billede af en dansk kvittering (som et foto af papir). */
async function receiptImage(page: Page, lines: string[], opts: { photo?: boolean } = {}): Promise<Buffer> {
  const gen = await page.context().newPage()
  // photo: som et rigtigt foto – kvitteringen holdt i hånden over et mørkt gulv, let skæv
  const paper = opts.photo
    ? `<div id="r" style="background:#3b3631;padding:120px 160px;width:max-content;position:relative"><div style="position:absolute;left:60px;top:380px;width:190px;height:120px;border-radius:60px;background:#c9a58c"></div><pre style="background:#fbfaf5;font:22px/1.45 'DejaVu Sans Mono',monospace;padding:40px 34px;margin:0;color:#333;transform:rotate(-1.5deg)">${lines.join('\n')}</pre></div>`
    : `<pre id="r" style="background:#fdfdf8;font:22px/1.45 'DejaVu Sans Mono',monospace;padding:30px;margin:0;color:#222">${lines.join('\n')}</pre>`
  await gen.setContent(`<body style="margin:0;background:#9a9a9a;padding:30px">${paper}</body>`)
  const png = await gen.locator('#r').screenshot({ type: 'png' })
  await gen.close()
  return png
}

function yesterdayDk() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

test('scan kvittering: OCR-forslag, kategoriforslag, godkendelse præcis én gang', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()

  // Tidligere køb i Bilka → kategoriforslag "Dagligvarer"
  await page.goto('/okonomi/ny')
  await page.getByLabel('Beløb i kroner').fill('120')
  await page.getByPlaceholder('Fx Bilka').fill('Bilka')
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByText('Dagligvarer').click()
  await page.getByRole('button', { name: 'Gem udgift' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/ny'))

  const png = await receiptImage(page, [
    '        BILKA', '     Bilka Tilst', 'Tilst Skolevej 2, 8381 Tilst', 'CVR 35954716  Tlf 89306300', '',
    'MÆLK LETMÆLK 1L        11,95', 'RUGBRØD                22,00', 'KAFFE 400G             54,95', 'SUBTOTAL              638,75',
    'HERAF MOMS            127,75', 'TOTAL                 638,75', '', 'DANKORT     XXXX XXXX 1234', 'BELØB DKK             638,75', `${yesterdayDk()}  14:32   KASSE 7`,
  ])

  await page.goto('/')
  await page.locator('main').getByRole('button', { name: 'Kvittering' }).click()
  await expect(page.getByText('Tag et billede af kvitteringen')).toBeVisible()
  await page.locator('label', { hasText: 'Vælg fra billeder' }).locator('input').setInputFiles({ name: 'k.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('heading', { name: 'Kontrollér' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('Billedet er gemt sikkert')).toBeVisible()
  await expect(page.getByPlaceholder('Fx Bilka')).toHaveValue('Bilka')
  await expect(page.getByLabel('Beløb i kroner')).toHaveValue('638,75')

  await page.getByRole('button', { name: 'Videre' }).click()
  await expect(page.getByText('Foreslået ud fra jeres tidligere køb hos Bilka')).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Kategori' }).getByRole('radio', { checked: true })).toContainText('Dagligvarer')
  await expect(page.getByText(/Kvitteringen slettes automatisk/)).toBeVisible()

  // Tredobbelt tryk på "Godkend og gem"
  await page.getByRole('button', { name: 'Godkend og gem' }).evaluate((b: HTMLButtonElement) => {
    b.click()
    b.click()
    b.click()
  })
  await expect(page.getByText('Kvitteringen er gemt')).toBeVisible()

  await page.goto('/okonomi/transaktioner')
  await expect(page.getByText('· Kvittering')).toBeVisible()
  const txt = norm(await page.locator('main').textContent())
  expect(txt.match(/Kvittering/g)?.length, 'præcis én transaktion fra kvitteringen').toBe(1)
  expect(txt).toContain('638,75 kr.')

  // Liste → detalje → opbevaring permanent
  await page.goto('/kvitteringer')
  await page.getByRole('link', { name: /Bilka/ }).click()
  await page.getByRole('button', { name: 'Ændr opbevaring' }).click()
  await page.getByRole('radio', { name: 'Behold permanent' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByText('Kvitteringsbilledet beholdes permanent.')).toBeVisible()

  // Udgiften åbnes fra kvitteringen, og sletning fjerner også kvitteringen
  await page.getByRole('button', { name: 'Åbn udgiften' }).click()
  await page.getByRole('button', { name: 'Slet udgift' }).click()
  await expect(page.getByText('Kvitteringen og dens billede slettes også')).toBeVisible()
  await page.locator('dialog[open]').getByRole('button', { name: 'Slet' }).click()
  await page.waitForURL((u) => !u.pathname.includes('/udgift/'))
  await page.goto('/kvitteringer')
  await expect(page.getByText('Ingen kvitteringer endnu')).toBeVisible()
})

test('annulleret scanning efterlader ingen kvittering', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()
  const png = await receiptImage(page, ['NETTO', 'I ALT   203,50', '03.10.2026'])
  await page.goto('/kvitteringer/scan')
  await page.locator('label', { hasText: 'Vælg fra billeder' }).locator('input').setInputFiles({ name: 'k.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Billedet er gemt sikkert')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Annullér scanning' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Kassér' }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/scan'))
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('hjem-demo-db-v2') ?? '{}').receipts?.length ?? 0)
  expect(pending).toBe(0)
})

test('scan uden at gemme billedet: rigtig total, valg af beløb, kun udgiften gemmes', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()
  // "Sparet i år" og bonussaldo er større end totalen, men er ikke totalen
  const png = await receiptImage(page, [
    'COOP 365', 'BRØD                   20,00', 'MÆLK                   12,00', 'TOTAL                  32,00', 'MOBILEPAY              32,00',
    'Du har sparet i år  1.245,50', 'Bonussaldo            312,40', yesterdayDk(),
  ])
  await page.goto('/kvitteringer/scan')
  await page.locator('label', { hasText: 'Vælg fra billeder' }).locator('input').setInputFiles({ name: 'k.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('heading', { name: 'Kontrollér' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByLabel('Beløb i kroner')).toHaveValue('32')

  // Andre beløb kan vælges med ét tryk – og tilbage igen
  const choices = page.getByRole('radiogroup', { name: 'Beløb på kvitteringen' })
  await expect(choices.getByRole('radio', { name: '32,00 kr.' })).toHaveAttribute('aria-checked', 'true')
  await choices.getByRole('radio').nth(1).click()
  await expect(page.getByLabel('Beløb i kroner')).not.toHaveValue('32')
  await choices.getByRole('radio', { name: '32,00 kr.' }).click()
  await expect(page.getByLabel('Beløb i kroner')).toHaveValue('32')

  await page.getByRole('button', { name: 'Videre' }).click()
  await page.getByRole('radiogroup', { name: 'Kategori' }).getByText('Dagligvarer').click()
  await page.getByRole('switch', { name: /Gem kvitteringsbilledet/ }).click()
  await expect(page.getByText('Kun udgiften gemmes. Billedet slettes med det samme.')).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Opbevaringstid' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Gem udgift uden billede' }).click()
  await expect(page.getByText('Udgiften er gemt')).toBeVisible()
  await expect(page.getByText('Kvitteringsbilledet er ikke gemt.')).toBeVisible()

  // Udgiften findes, men ingen kvittering
  await page.getByRole('button', { name: 'Se udgifter' }).click()
  await expect(page.locator('main')).toContainText(/32(,00)?\s?kr\./)
  await expect(page.getByText('· Kvittering')).toHaveCount(0)
  await page.goto('/kvitteringer')
  await expect(page.getByText('Ingen kvitteringer endnu')).toBeVisible()
})

test('foto af Netto-kvittering: rabat med minus efter beløbet, total og dato læses rigtigt', async ({ page }) => {
  await startEmpty(page, '/okonomi/budgetter')
  await page.getByRole('button', { name: 'Opret forslag' }).click()
  await expect(page.getByRole('link', { name: /Dagligvarer/ })).toBeVisible()
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const png = await receiptImage(
    page,
    [
      '            Netto', '      Bjerggårds Alle 4', '      5240 Odense NØ', '',
      'DANONINO 6X50G', '2 x 18,95                37,90', 'RABAT                    18,96-', 'CHEASY SKYR VAN. 1KG', '2 x 30,95                61,90',
      'RABAT                    11,90-', 'ÆBLESKIVER 18 STK        20,00', 'VITAMIN WELL ANTIOXI     16,00', 'PANT                      3,00',
      'PINK DONUT                7,00', 'Aftenrabat                3,50-', '', 'TOTAL                   111,44', 'BETALINGSKORT           111,44', '',
      'MOMS UDGØR       22,29', '', `  41  1  1086 ${pad(d.getDate())} ${pad(d.getMonth() + 1)} ${String(d.getFullYear()).slice(2)} 19:14`,
    ],
    { photo: true },
  )
  await page.goto('/kvitteringer/scan')
  await page.locator('label', { hasText: 'Vælg fra billeder' }).locator('input').setInputFiles({ name: 'k.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('heading', { name: 'Kontrollér' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByLabel('Beløb i kroner')).toHaveValue('111,44')
  await expect(page.getByPlaceholder('Fx Bilka')).toHaveValue('Netto')
  await expect(page.getByLabel('Købsdato')).toHaveValue(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  await expect(page.getByText('Kontrollér beløbet')).toHaveCount(0)
})
