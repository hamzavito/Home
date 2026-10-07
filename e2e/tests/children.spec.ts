import { expect, test, type Page } from '@playwright/test'
import { expectReadable } from './helpers'

const NOAH = '00000000-0000-4000-8000-0000000000b1'
const LINA = '00000000-0000-4000-8000-0000000000b2'
const SUMAYA = '00000000-0000-4000-8000-0000000000a2'

/** Tom husstand med Hamza (ejer), Sumaya (voksen) og to børn: Noah og Lina */
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

/** Log ind som en anden i husstanden (demoen skifter session ved genindlæsning) */
async function loginAs(page: Page, userId: string) {
  await page.evaluate((id) => localStorage.setItem('hjem-demo-as', id), userId)
  await page.goto('/')
  await expect(page.getByRole('heading').first()).toBeVisible()
}

test('forælder styrer barnet: penge, mål, opgave med belønning og aftale', async ({ page }) => {
  await startFamily(page, '/indstillinger')
  // Medlemmer med roller – ingen navne er kodet ind i appen
  await expect(page.getByRole('link', { name: /Noah\s*Barn/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Lina\s*Barn/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Sumaya\s*Voksen/ })).toBeVisible()
  await page.getByRole('link', { name: /Noah\s*Barn/ }).click()

  // Ejer ser rollen; et barn med PIN-login styres under "Login" (rollen kan ikke gøres til voksen)
  await expect(page.getByText(/Barn · brugernavn noah/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Slå login fra/ })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Rolle' })).toHaveCount(0)
  // Barnets samlede overblik
  await page.getByRole('link', { name: /Åbn Noahs overblik/ }).click()
  await expect(page).toHaveURL(new RegExp(`/hjemmet/barn/${NOAH}$`))

  // Lommepenge
  await page.getByRole('button', { name: 'Giv eller træk penge' }).click()
  const sheet = page.locator('dialog[open]')
  await expect(sheet.getByRole('radio', { name: 'Lommepenge' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByLabel('Beløb').fill('100')
  await sheet.getByLabel('Note (valgfri)').fill('Ugens lommepenge')
  await sheet.getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByText('Noahs saldo').locator('..')).toContainText(/100\s*kr\./)
  await expect(page.getByText('Ugens lommepenge')).toBeVisible()

  // Fradrag
  await page.getByRole('button', { name: 'Giv eller træk penge' }).click()
  await sheet.getByRole('radio', { name: 'Fradrag' }).click()
  await sheet.getByLabel('Beløb').fill('10')
  await sheet.getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByText('Noahs saldo').locator('..')).toContainText(/90\s*kr\./)

  // Fortryd fradraget – bevares i historikken som fortrudt
  await page.getByRole('button', { name: /Fortryd fradrag 10 kr\./ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Fortryd' }).click()
  await expect(page.getByText('Noahs saldo').locator('..')).toContainText(/100\s*kr\./)
  await expect(page.getByText(/Fortrudt/)).toBeVisible()

  // Opsparingsmål
  await page.getByRole('button', { name: 'Nyt mål' }).click()
  await page.locator('dialog[open]').getByLabel('Hvad sparer du op til?').fill('Cykel')
  await page.locator('dialog[open]').getByLabel('Mål').fill('500')
  await page.locator('dialog[open]').getByRole('button', { name: 'Opret mål' }).click()
  await expect(page.getByRole('button', { name: /Cykel\s*0 %/ })).toBeVisible()

  // Opgave til barnet med valgfri belønning
  await page.getByRole('button', { name: 'Tildel opgave' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Hvem' }).getByRole('radio', { name: 'Noah' })).toHaveAttribute('aria-checked', 'true')
  await page.getByPlaceholder('Fx Støvsuge stuen').fill('Tøm opvaskemaskinen')
  await page.getByLabel('Belønning (valgfri)').fill('10')
  await page.getByRole('button', { name: /Opret opgave|Gem/ }).first().click()
  await expect(page).not.toHaveURL(/\/hjemmet\/ny/)

  // Aftale for barnet (flere deltagere kan vælges)
  await page.goto(`/hjemmet/kalender/ny?deltager=${NOAH}`)
  const who = page.getByRole('group', { name: 'Gælder for' })
  await expect(who.getByRole('checkbox', { name: 'Noah' })).toHaveAttribute('aria-checked', 'true')
  await expect(who.getByRole('checkbox', { name: 'Hele familien' })).toHaveAttribute('aria-checked', 'false')
  await who.getByRole('checkbox', { name: 'Hamza' }).click()
  await page.getByPlaceholder('Fx Lægetid').fill('Fodbold')
  await page.getByLabel('Start').fill('16:00')
  await page.getByRole('button', { name: 'Opret aftale' }).click()
  await expect(page.getByRole('link', { name: /Fodbold/ }).first()).toContainText(/Noah & Hamza|Hamza & Noah/)

  await expectReadable(page, 'kalender med deltagere')
})

test('barnet ser kun sit eget: opgaver, aftaler, penge – resten af appen findes ikke', async ({ page }) => {
  await startFamily(page, '/hjemmet/ny')
  // Forældrene opretter opgaver og aftaler
  const task = async (title: string, who: string) => {
    await page.goto('/hjemmet/ny')
    await page.getByPlaceholder('Fx Støvsuge stuen').fill(title)
    await page.getByRole('radiogroup', { name: 'Hvem' }).getByRole('radio', { name: who }).click()
    await page.getByRole('button', { name: /Opret opgave|Gem/ }).first().click()
    await expect(page).not.toHaveURL(/\/hjemmet\/ny/)
  }
  await task('Rydde værelset', 'Noah')
  await task('Fodre katten', 'Lina')
  await task('Betale regninger', 'Mig')
  const event = async (title: string, who: string[], note?: string) => {
    await page.goto('/hjemmet/kalender/ny')
    await page.getByPlaceholder('Fx Lægetid').fill(title)
    if (note) await page.getByLabel('Beskrivelse (valgfri)').fill(note)
    for (const w of who) await page.getByRole('group', { name: 'Gælder for' }).getByRole('checkbox', { name: w }).click()
    await page.getByLabel('Start').fill('15:00')
    await page.getByRole('button', { name: 'Opret aftale' }).click()
    await expect(page).toHaveURL(/\/hjemmet\/kalender(\?|$)/)
  }
  await event('Fællesspisning', [])
  await event('Svømning', ['Noah'], 'Husk badetøj og håndklæde')
  await event('Frisør', ['Sumaya'], 'Privat note til Sumaya')
  await event('Ballet', ['Lina'])
  await page.goto(`/hjemmet/barn/${NOAH}`)
  await page.getByRole('button', { name: 'Giv eller træk penge' }).click()
  await page.locator('dialog[open]').getByLabel('Beløb').fill('50')
  await page.locator('dialog[open]').getByRole('button', { name: 'Gem' }).click()
  await expect(page.getByText('Noahs saldo').locator('..')).toContainText(/50\s*kr\./)

  // ------------------------------------------------ Noah logger ind
  await loginAs(page, NOAH)
  await expect(page.getByRole('heading', { name: 'Noah' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Hovednavigation' })
  await expect(nav.getByRole('link')).toHaveText(['Hjem', 'Opgaver', 'Kalender', 'Penge', 'Mere'])
  await expect(page.getByText('Ingen aftensmad planlagt endnu')).toBeVisible()
  await expect(page.getByRole('link', { name: '1 tilbage' })).toBeVisible()
  await expect(page.getByText('Rydde værelset')).toBeVisible()
  await expect(page.getByText('Fodre katten')).toHaveCount(0)
  await expect(page.getByText('Betale regninger')).toHaveCount(0)
  // I dag: fælles + egne aftaler – ikke forældrenes eller søsterens
  await expect(page.getByText('Fællesspisning')).toBeVisible()
  await expect(page.getByText('Svømning')).toBeVisible()
  await expect(page.getByText('Frisør')).toHaveCount(0)
  await expect(page.getByText('Ballet')).toHaveCount(0)
  // Opgaver og penge står også direkte på Hjem
  await expect(page.getByRole('button', { name: /Markér Rydde værelset som færdig/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mine penge' })).toBeVisible()
  await expect(page.getByText('Min saldo', { exact: true }).locator('..')).toContainText(/Min saldo\s*50\s*kr\./)
  await expect(page.getByRole('button', { name: 'Jeg har købt' })).toBeVisible()
  await expectReadable(page, 'barnets forside')

  // Ingen adgang til resten af appen – heller ikke via adressen
  for (const path of ['/okonomi', '/okonomi/budgetter', '/indkob', '/opsparing', '/kvitteringer', '/kvitteringer/scan', '/okonomi/kommende', '/indstillinger', `/indstillinger/medlem/${NOAH}`, '/hjemmet/ny', '/hjemmet/madplan']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Noah' })).toBeVisible()
  }

  // Opgaver: I gang og Færdig
  await nav.getByRole('link', { name: 'Opgaver' }).click()
  await page.getByRole('button', { name: 'I gang' }).click()
  await expect(page.getByRole('button', { name: 'I gang' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Markér Rydde værelset som færdig/ }).click()
  await expect(page.getByRole('heading', { name: 'Færdige' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ikke færdig alligevel' })).toBeVisible()

  // Kalender: kun visning, ingen redigering
  await nav.getByRole('link', { name: 'Kalender' }).click()
  await expect(page.getByText('Svømning')).toBeVisible()
  await expect(page.getByText('Frisør')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Svømning/ })).toHaveCount(0)
  // Noten fra forældrene vises for barnet – men ikke noter på aftaler, barnet ikke deltager i
  await expect(page.getByText('Husk badetøj og håndklæde')).toBeVisible()
  await expect(page.getByText('Privat note til Sumaya')).toHaveCount(0)

  // Penge: køb og opsparing
  await nav.getByRole('link', { name: 'Penge' }).click()
  await page.getByRole('button', { name: 'Jeg har købt' }).click()
  await page.locator('dialog[open]').getByLabel('Beløb').fill('80')
  await expect(page.getByText('Du kan højst bruge 50 kr.')).toBeVisible()
  await page.locator('dialog[open]').getByLabel('Beløb').fill('15')
  await page.locator('dialog[open]').getByLabel('Note (valgfri)').fill('Slik')
  await page.locator('dialog[open]').getByRole('button', { name: 'Gem køb' }).click()
  await expect(page.getByText('Min saldo', { exact: true }).locator('..')).toContainText(/Min saldo\s*35\s*kr\./)

  await page.getByRole('button', { name: 'Nyt mål' }).click()
  await page.locator('dialog[open]').getByLabel('Hvad sparer du op til?').fill('LEGO')
  await page.locator('dialog[open]').getByLabel('Mål').fill('200')
  await page.locator('dialog[open]').getByRole('button', { name: 'Opret mål' }).click()
  await page.getByRole('button', { name: /LEGO\s*0 %/ }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Sæt penge til side' }).click()
  await page.locator('dialog[open]').getByLabel('Beløb').fill('20')
  await page.locator('dialog[open]').getByRole('button', { name: 'Sæt til side' }).click()
  await expect(page.getByRole('button', { name: /LEGO\s*10 %/ })).toBeVisible()
  await expect(page.getByText('Min saldo', { exact: true }).locator('..')).toContainText(/Min saldo\s*15\s*kr\./)
  await expectReadable(page, 'mine penge')

  // Mere: ingen indkøbsliste-notifikationer, ingen eksport eller husstandsindstillinger
  await nav.getByRole('link', { name: 'Mere' }).click()
  await expect(page.getByText('Nye varer på indkøbslisten')).toHaveCount(0)
  await expect(page.getByText('Eksportér data')).toHaveCount(0)

  // ------------------------------------------------ Lina ser ikke Noahs penge eller opgaver
  await loginAs(page, LINA)
  await expect(page.getByRole('heading', { name: 'Lina' })).toBeVisible()
  await expect(page.getByText('Fodre katten')).toBeVisible()
  await expect(page.getByText('Rydde værelset')).toHaveCount(0)
  await expect(page.getByText('Ballet')).toBeVisible()
  await expect(page.getByText('Svømning')).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Hovednavigation' }).getByRole('link', { name: 'Penge' }).click()
  await expect(page.getByText('Min saldo', { exact: true }).locator('..')).toContainText(/Min saldo\s*0\s*kr\./)
  await expect(page.getByText('LEGO')).toHaveCount(0)
  await expect(page.getByText('Slik')).toHaveCount(0)

  // ------------------------------------------------ Forælder ser barnets køb og mål
  await loginAs(page, SUMAYA)
  await page.goto(`/hjemmet/barn/${NOAH}`)
  await expect(page.getByText('Noahs saldo').locator('..')).toContainText(/15\s*kr\./)
  await expect(page.getByRole('button', { name: /LEGO\s*10 %/ })).toBeVisible()
  await expect(page.getByText('Slik')).toBeVisible()
  // Sumaya er voksen, ikke ejer: kan ikke ændre roller eller login
  await page.goto(`/indstillinger/medlem/${NOAH}`)
  await expect(page.getByRole('heading', { name: 'Noah' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Rolle' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Slå login fra/ })).toHaveCount(0)
  // …men kan se barnets PIN
  await page.getByRole('button', { name: 'Vis PIN' }).click()
  await expect(page.getByLabel('PIN', { exact: true })).toHaveText('482611')
})

test('barnet ser aftensmaden og kan læse opskriften', async ({ page }) => {
  await startFamily(page)
  // Forælderen laver en opskrift og sætter den på madplanen i dag
  await page.goto('/hjemmet/madplan/opskrift/ny')
  await page.getByPlaceholder('Fx Kylling i karry').fill('Pasta med kødsovs')
  await page.getByLabel('Ingrediens 1', { exact: true }).fill('Pasta')
  await page.getByLabel('Mængde 1').fill('500')
  await page.getByLabel('Enhed 1').selectOption('g')
  await page.getByRole('button', { name: 'Gem opskrift' }).click()
  await page.getByRole('button', { name: 'Sæt på madplanen' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Tilføj', exact: true }).click()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await loginAs(page, NOAH)
  await page.getByRole('link', { name: 'Pasta med kødsovs' }).click()
  await expect(page.getByRole('heading', { name: 'Pasta med kødsovs' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Ingredienser' })).toContainText(/500\s*g\s*Pasta/)
  // Kun læsning: ingen redigering eller madplan-knapper
  await expect(page.getByRole('button', { name: /Redigér|Sæt på madplanen/ })).toHaveCount(0)
})
