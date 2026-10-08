import { expect, test, type Page } from '@playwright/test'

/** Start uden husstand og uden login (som en ny kunde) */
async function startFresh(page: Page) {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('fresh-set')) {
        localStorage.setItem('hjem-demo-mode', 'fresh')
        sessionStorage.setItem('fresh-set', '1')
      }
    } catch {
      /* ignorér */
    }
  })
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Velkommen hjem' })).toBeVisible()
}

async function codeLogin(page: Page, email: string) {
  await page.getByRole('button', { name: 'Få en kode på mail i stedet' }).click()
  await page.getByPlaceholder('E-mail').fill(email)
  await page.getByRole('button', { name: 'Send kode' }).click()
  await expect(page.getByText(`Vi har sendt en kode til ${email}`)).toBeVisible()
  await page.getByLabel('Kode fra e-mail').fill('123456')
  await page.getByRole('button', { name: 'Fortsæt' }).click()
  await expect(page.getByRole('heading', { name: 'Velkommen hjem' })).toHaveCount(0)
}

async function logOut(page: Page) {
  await page.goto('/indstillinger')
  await page.getByRole('button', { name: 'Log ud' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Log ud' }).click()
  await expect(page.getByRole('heading', { name: 'Velkommen hjem' })).toBeVisible()
}

test('ny kunde: opret husstand, invitér partneren, forlad og slet', async ({ page }) => {
  await startFresh(page)
  // Apple/Google vises ikke, når de ikke er sat op
  await expect(page.getByRole('button', { name: 'Fortsæt med Apple' })).toHaveCount(0)

  // 1. Tilmelding med kode på mail → velkomstside
  await codeLogin(page, 'ny@demo.dk')
  await expect(page.getByRole('heading', { name: /^Velkommen/ })).toBeVisible()
  await page.getByRole('button', { name: /Opret husstand/ }).click()
  await expect(page.getByRole('button', { name: 'Opret husstand' })).toBeDisabled()
  await page.getByLabel('Husstandens navn').fill('Familien Test')
  await page.getByLabel('Dit navn').fill('Nora')
  await page.getByRole('button', { name: 'Opret husstand' }).click()
  await expect(page.getByRole('navigation', { name: 'Hovednavigation' })).toBeVisible()

  // 2. Appen åbner; Nora er ejer og inviterer
  await page.goto('/indstillinger')
  await expect(page.getByText('Familien Test', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Nora \(dig\)/ })).toContainText('Ejer')
  await page.getByRole('button', { name: /Inviter voksen/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Lav invitation' }).click()
  const codeText = await page.locator('dialog[open] p.font-mono').textContent()
  const code = codeText!.trim()
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  await page.keyboard.press('Escape')
  await expect(page.getByText('Invitation sendt')).toBeVisible()
  await logOut(page)

  // 3. Partneren åbner linket, logger ind med adgangskode og bliver medlem
  await page.goto(`/invitation/${code.replace('-', '')}`)
  await expect(page.getByText('Du er inviteret til en husstand')).toBeVisible()
  await page.getByPlaceholder('E-mail').fill('sumaya@demo.dk')
  await page.getByPlaceholder('Adgangskode').fill('hemmelig123')
  await page.getByRole('button', { name: 'Log ind' }).click()
  await expect(page.getByRole('heading', { name: 'Tag imod invitation' })).toBeVisible()
  await expect(page.getByLabel('Invitationskode')).toHaveValue(code)
  await page.getByRole('button', { name: 'Fortsæt' }).click()
  await expect(page.getByRole('heading', { name: 'Bliv medlem af Familien Test?' })).toBeVisible()
  await expect(page.getByText('Nora har inviteret dig')).toBeVisible()
  await page.getByLabel('Dit navn').fill('Sumaya')
  await page.getByRole('button', { name: 'Bliv medlem' }).click()
  await expect(page.getByRole('navigation', { name: 'Hovednavigation' })).toBeVisible()
  await page.goto('/indstillinger')
  await expect(page.getByRole('link', { name: /Sumaya \(dig\)/ })).toContainText('Voksen')
  await expect(page.getByRole('link', { name: /^Nora/ })).toBeVisible()
  await expect(page.getByText('Invitation sendt')).toHaveCount(0)

  // 4. Brugt kode virker ikke igen
  await logOut(page)
  await codeLogin(page, 'hamza@demo.dk')
  await page.getByRole('button', { name: /Jeg har en invitation/ }).click()
  await page.getByLabel('Invitationskode').fill(code)
  await page.getByRole('button', { name: 'Fortsæt' }).click()
  await expect(page.getByText('Invitationen er ugyldig, allerede brugt eller udløbet')).toBeVisible()
  await page.getByLabel('Invitationskode').fill('ABC')
  await page.getByRole('button', { name: 'Fortsæt' }).click()
  await expect(page.getByText('Koden har 8 tegn')).toBeVisible()

  // 5. Sumaya forlader husstanden → velkomstsiden
  await page.getByRole('button', { name: /^Log ud/ }).click()
  await page.getByPlaceholder('E-mail').fill('sumaya@demo.dk')
  await page.getByPlaceholder('Adgangskode').fill('hemmelig123')
  await page.getByRole('button', { name: 'Log ind' }).click()
  await expect(page.getByRole('navigation', { name: 'Hovednavigation' })).toBeVisible()
  await page.goto('/indstillinger')
  await page.getByRole('button', { name: 'Forlad husstanden' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Forlad' }).click()
  await expect(page.getByRole('button', { name: /Opret husstand/ })).toBeVisible()

  // 6. Nora er nu eneste voksne: kan ikke "forlade", men slette – så forsvinder husstanden
  await page.getByRole('button', { name: /^Log ud/ }).click()
  await codeLogin(page, 'ny@demo.dk')
  await page.goto('/indstillinger')
  await expect(page.getByRole('link', { name: /Sumaya/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Forlad husstanden' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Slet min konto' }).click()
  const sheet = page.locator('dialog[open]')
  await expect(sheet.getByText('Du er den eneste voksne, så hele Familien Test slettes')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Slet konto' })).toBeDisabled()
  await sheet.getByLabel('Skriv "SLET" for at bekræfte').fill('slet')
  await sheet.getByRole('button', { name: 'Slet konto' }).click()
  await expect(page.getByRole('heading', { name: 'Velkommen hjem' })).toBeVisible()
  const households = await page.evaluate(() => JSON.parse(localStorage.getItem('hjem-demo-db-v9') ?? '{}').households?.length ?? -1)
  expect(households).toBe(0)
})

test('ejeren kan fjerne en voksen, og den fjernede mister adgangen', async ({ page }) => {
  await startFresh(page)
  await codeLogin(page, 'ny@demo.dk')
  await page.getByRole('button', { name: /Opret husstand/ }).click()
  await page.getByLabel('Husstandens navn').fill('Vores hjem')
  await page.getByLabel('Dit navn').fill('Nora')
  await page.getByRole('button', { name: 'Opret husstand' }).click()
  await expect(page.getByRole('navigation', { name: 'Hovednavigation' })).toBeVisible()
  await page.goto('/indstillinger')
  await page.getByRole('button', { name: /Inviter voksen/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Lav invitation' }).click()
  const code = (await page.locator('dialog[open] p.font-mono').textContent())!.trim()
  await page.keyboard.press('Escape')
  await logOut(page)

  await codeLogin(page, 'sumaya@demo.dk')
  await page.getByRole('button', { name: /Jeg har en invitation/ }).click()
  await page.getByLabel('Invitationskode').fill(code.toLowerCase())
  await page.getByRole('button', { name: 'Fortsæt' }).click()
  await page.getByRole('button', { name: 'Bliv medlem' }).click()
  await expect(page.getByRole('navigation', { name: 'Hovednavigation' })).toBeVisible()
  await logOut(page)

  await codeLogin(page, 'ny@demo.dk')
  await page.goto('/indstillinger')
  await page.getByRole('link', { name: /^sumaya/i }).click()
  await page.getByRole('button', { name: 'Fjern fra husstanden' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Fjern' }).click()
  await page.waitForURL(/\/indstillinger$/)
  await expect(page.getByText('1 medlem', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^sumaya/i })).toHaveCount(0)
  await logOut(page)

  await codeLogin(page, 'sumaya@demo.dk')
  await expect(page.getByRole('button', { name: /Opret husstand/ })).toBeVisible()
})
