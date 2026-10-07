import { expect, test, type Page } from '@playwright/test'
import { expectReadable, startEmpty } from './helpers'

const sheet = (page: Page) => page.locator('dialog[open]')

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log ud' }).click()
  await sheet(page).getByRole('button', { name: 'Log ud' }).click()
  await expect(page.getByRole('heading', { name: 'Velkommen hjem' })).toBeVisible()
}

async function childLogin(page: Page, code: string, username: string, pin: string) {
  await page.getByRole('radio', { name: 'Barn' }).click()
  await page.getByPlaceholder('Husstandskode').fill(code)
  await page.getByPlaceholder('Brugernavn').fill(username)
  await page.getByPlaceholder('PIN').fill(pin)
  await page.getByRole('button', { name: 'Log ind' }).click()
}

async function adultLogin(page: Page, email: string) {
  await page.getByRole('radio', { name: 'Voksen' }).click()
  await page.getByPlaceholder('E-mail').fill(email)
  await page.getByPlaceholder('Adgangskode').fill('hemmelig')
  await page.getByRole('button', { name: 'Log ind' }).click()
}

async function addChild(page: Page, name: string, username: string, pin: string) {
  await page.goto('/indstillinger/barn/ny')
  await page.getByLabel('Navn', { exact: true }).fill(name)
  await page.getByLabel('Brugernavn').fill(username)
  await page.getByLabel('PIN', { exact: true }).fill(pin)
  await page.getByLabel('Gentag PIN').fill(pin)
  await page.getByRole('button', { name: 'Opret barn' }).click()
}

test('ejer opretter barn, barnet logger ind med husstandskode, brugernavn og PIN', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  // Husstandskoden vises for ejeren
  await expect(page.getByLabel('Husstandskode')).toHaveText('HJEM42')

  // 6 cifre er standard
  await page.getByRole('link', { name: /Tilføj barn/ }).click()
  await expect(page.getByRole('radio', { name: '6 cifre' })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('PIN', { exact: true }).fill('12345')
  await expect(page.getByText('PIN skal være 6 cifre')).toBeVisible()
  await expectReadable(page, 'tilføj barn')

  await addChild(page, 'Noah', 'Noah', '482611')
  await expect(page.getByRole('heading', { name: 'Noah er oprettet' })).toBeVisible()
  await expect(page.getByText('HJEM42')).toBeVisible()
  await expect(page.getByText('noah', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Færdig' }).click()
  await expect(page.getByText(/Barn · brugernavn noah/)).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Rolle' })).toHaveCount(0)

  // Samme brugernavn kan ikke bruges to gange i husstanden
  await addChild(page, 'Noah 2', 'noah', '582917')
  await expect(page.getByText('Brugernavnet er allerede i brug i husstanden.')).toBeVisible()

  // Barnelogin: forkert PIN giver en neutral besked
  await page.goto('/indstillinger')
  await logout(page)
  await childLogin(page, 'HJEM42', 'noah', '999999')
  await expect(page.getByRole('alert')).toHaveText('Loginoplysningerne er forkerte.')
  await expect(page.getByPlaceholder('PIN')).toHaveValue('')
  await childLogin(page, 'hjem42', 'noah', '111111')
  await expect(page.getByRole('alert')).toHaveText('Loginoplysningerne er forkerte.')
  await childLogin(page, 'XXXXXX', 'noah', '482611')
  await expect(page.getByRole('alert')).toHaveText('Loginoplysningerne er forkerte.')

  // Korrekt: husstandskode (små bogstaver er ok) + brugernavn + PIN
  await childLogin(page, 'hjem42', 'Noah', '482611')
  await expect(page.getByRole('heading', { name: 'Noah' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Hovednavigation' }).getByRole('link')).toHaveText(['Hjem', 'Opgaver', 'Kalender', 'Penge', 'Mere'])
  // Den skjulte systemidentitet vises aldrig
  await page.getByRole('navigation', { name: 'Hovednavigation' }).getByRole('link', { name: 'Mere' }).click()
  await expect(page.getByText(/Brugernavn: noah/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('internal.home')
  // Barnet kan ikke nå indstillinger eller økonomi via adressen
  for (const path of ['/indstillinger', '/indstillinger/barn/ny', '/okonomi', '/indkob']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
  }
  await page.goto('/mere')
  await logout(page)
  await expect(page.getByRole('radio', { name: 'Voksen' })).toBeVisible()
})

test('lås efter 5 forkerte forsøg; ejer skifter PIN og slår login fra og til', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  await addChild(page, 'Lina', 'lina', '7395')
  await expect(page.getByText(/PIN skal være 6 cifre/)).toBeVisible()
  // 4 cifre kan vælges
  await page.getByRole('radio', { name: '4 cifre' }).click()
  await page.getByLabel('PIN', { exact: true }).fill('7395')
  await page.getByLabel('Gentag PIN').fill('7395')
  await page.getByRole('button', { name: 'Opret barn' }).click()
  await expect(page.getByRole('heading', { name: 'Lina er oprettet' })).toBeVisible()
  await page.getByRole('button', { name: 'Færdig' }).click()
  const memberUrl = page.url()

  await page.goto('/indstillinger')
  await logout(page)
  for (let i = 0; i < 5; i++) {
    await childLogin(page, 'HJEM42', 'lina', '0000')
    await expect(page.getByRole('alert')).toHaveText('Loginoplysningerne er forkerte.')
  }
  await childLogin(page, 'HJEM42', 'lina', '7395')
  await expect(page.getByRole('alert')).toHaveText('For mange forsøg. Vent lidt og prøv igen.')

  // Ejeren giver en ny PIN (ophæver låsen)
  await adultLogin(page, 'hamza@demo.dk')
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
  await page.goto(memberUrl)
  await page.getByRole('button', { name: /Skift PIN/ }).click()
  await sheet(page).getByRole('radio', { name: '4 cifre' }).click()
  await sheet(page).getByLabel('PIN', { exact: true }).fill('2580')
  await sheet(page).getByLabel('Gentag PIN').fill('2580')
  await sheet(page).getByRole('button', { name: 'Gem ny PIN' }).click()
  await expect(sheet(page).getByText(/PIN er ændret/)).toBeVisible()
  await sheet(page).getByRole('button', { name: 'OK' }).click()

  // Slå login fra
  await page.getByRole('button', { name: /Slå login fra/ }).click()
  await sheet(page).getByRole('button', { name: 'Slå fra' }).click()
  await expect(page.getByText(/login slået fra/).first()).toBeVisible()

  await page.goto('/indstillinger')
  await logout(page)
  await childLogin(page, 'HJEM42', 'lina', '2580')
  await expect(page.getByRole('alert')).toHaveText('Loginoplysningerne er forkerte.')

  // Slå til igen: gammel PIN virker ikke, ny gør
  await adultLogin(page, 'hamza@demo.dk')
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
  await page.goto(memberUrl)
  await page.getByRole('button', { name: /Slå login til igen/ }).click()
  await sheet(page).getByRole('button', { name: 'Slå til' }).click()
  await expect(page.getByText('Login er aktivt')).toBeVisible()
  await page.goto('/indstillinger')
  await logout(page)
  await childLogin(page, 'HJEM42', 'lina', '7395')
  await expect(page.getByRole('alert')).toHaveText('Loginoplysningerne er forkerte.')
  await childLogin(page, 'HJEM42', 'lina', '2580')
  await expect(page.getByRole('heading', { name: 'Lina' })).toBeVisible()
})

test('voksne (ikke ejere) kan hverken se husstandskoden eller tilføje børn', async ({ page }) => {
  await startEmpty(page, '/indstillinger')
  await logout(page)
  await adultLogin(page, 'sumaya@demo.dk')
  await expect(page.getByText('Hamza & Sumaya')).toBeVisible()
  await page.goto('/indstillinger')
  await expect(page.getByRole('heading', { name: 'Indstillinger' })).toBeVisible()
  await expect(page.getByLabel('Husstandskode')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Tilføj barn/ })).toHaveCount(0)
  await page.goto('/indstillinger/barn/ny')
  await expect(page.getByText('Kun ejere kan tilføje børn.')).toBeVisible()
})
