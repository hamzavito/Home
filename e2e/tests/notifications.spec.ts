import { expect, test, type Page } from '@playwright/test'
import { startEmpty } from './helpers'

/**
 * Falsk push-tjeneste i browseren (headless Chromium har ingen rigtig).
 * Tilladelse og tilmelding gemmes i localStorage, så de overlever en genindlæsning.
 * Appen kører som installeret på hjemmeskærmen (navigator.standalone).
 */
async function fakePush(page: Page, answer: NotificationPermission = 'granted') {
  await page.addInitScript((answer) => {
    const get = (k: string) => localStorage.getItem(k)
    class FakeNotification {
      static get permission() {
        return (get('fake-perm') as NotificationPermission) ?? 'default'
      }
      static async requestPermission() {
        localStorage.setItem('fake-perm', answer)
        return answer
      }
    }
    const makeSub = (key: number[]) => ({
      endpoint: 'https://push.example/fake',
      options: { applicationServerKey: new Uint8Array(key).buffer },
      toJSON: () => ({ endpoint: 'https://push.example/fake', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }),
      unsubscribe: async () => {
        localStorage.removeItem('fake-sub')
        return true
      },
    })
    const pushManager = {
      getSubscription: async () => {
        const key = get('fake-sub')
        return key ? makeSub(JSON.parse(key)) : null
      },
      subscribe: async (o: { applicationServerKey: Uint8Array }) => {
        const key = Array.from(o.applicationServerKey)
        localStorage.setItem('fake-sub', JSON.stringify(key))
        return makeSub(key)
      },
    }
    // Som den installerede app på hjemmeskærmen (kun dér har iPhone push)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true })
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true })
  }, answer)
}

test('notifikationer: slå til på telefonen, testbesked og valg af hvad man får besked om', async ({ page }) => {
  await fakePush(page)
  await startEmpty(page, '/indstillinger')
  const device = page.getByRole('switch', { name: /På denne telefon/ })
  await expect(device).toHaveAttribute('aria-checked', 'false')
  await device.click()
  await expect(device).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Du får notifikationer her.')).toBeVisible()

  await page.getByRole('button', { name: /Send en testnotifikation/ }).click()
  await expect(page.getByText('Sendt – den kommer om et øjeblik')).toBeVisible()

  // Hvad man får besked om gemmes på profilen
  const shopping = page.getByRole('switch', { name: /Nye varer på indkøbslisten/ })
  const calendar = page.getByRole('switch', { name: /Påmindelser om aftaler/ })
  await expect(shopping).toHaveAttribute('aria-checked', 'true')
  await shopping.click()
  await expect(shopping).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Gemt', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('switch', { name: /Nye varer på indkøbslisten/ })).toHaveAttribute('aria-checked', 'false')
  await expect(calendar).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: /På denne telefon/ })).toHaveAttribute('aria-checked', 'true')

  // Slå fra igen
  await page.getByRole('switch', { name: /På denne telefon/ }).click()
  await expect(page.getByRole('switch', { name: /På denne telefon/ })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('button', { name: /Send en testnotifikation/ })).toHaveCount(0)
})

test('notifikationer: afvist tilladelse forklares', async ({ page }) => {
  await fakePush(page, 'denied')
  await startEmpty(page, '/indstillinger')
  await page.getByRole('switch', { name: /På denne telefon/ }).click()
  await expect(page.getByText(/Blokeret\. Slå dem til i iPhonens Indstillinger/)).toBeVisible()
  await expect(page.getByRole('switch', { name: /På denne telefon/ })).toHaveAttribute('aria-checked', 'false')
})

test.describe('iPhone i Safari (ikke føjet til hjemmeskærmen)', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  test('forklarer at appen skal føjes til hjemmeskærmen', async ({ page }) => {
    await startEmpty(page, '/indstillinger')
    await expect(page.getByText(/Notifikationer virker kun, når Hjem er føjet til hjemmeskærmen/)).toBeVisible()
    await expect(page.getByRole('switch', { name: /På denne telefon/ })).toHaveCount(0)
    // Valgene kan stadig sættes (gælder alle ens telefoner)
    await expect(page.getByRole('switch', { name: /Påmindelser om aftaler/ })).toBeVisible()
  })
})

test('kalender: påmindelse vælges pr. aftale og gemmes', async ({ page }) => {
  await startEmpty(page, '/hjemmet/kalender/ny')
  const reminder = page.getByLabel('Påmindelse')
  // Standard: 1 time før, til begge ved fælles aftale
  await expect(reminder).toHaveValue('60')
  await expect(page.getByText('Sendes til jer begge, hvis notifikationer er slået til')).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Gælder for' }).getByRole('radio', { name: 'Sumaya' }).click()
  await expect(page.getByText('Sendes til Sumaya, hvis notifikationer er slået til')).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Gælder for' }).getByRole('radio', { name: 'Hamza' }).click()
  await expect(page.getByText('Sendes til dig, hvis notifikationer er slået til')).toBeVisible()

  // Heldag har sine egne valg; standard er ingen
  await page.getByRole('switch', { name: 'Hele dagen' }).click()
  await expect(reminder).toHaveValue('none')
  await expect(reminder.locator('option')).toHaveText(['Ingen', 'Samme dag kl. 8', 'Dagen før kl. 18'])
  await page.getByRole('switch', { name: 'Hele dagen' }).click()

  await page.getByPlaceholder('Fx Lægetid').fill('Tandlæge')
  await page.getByLabel('Start').fill('10:30')
  await reminder.selectOption({ label: '15 min. før' })
  await page.getByRole('button', { name: 'Opret aftale' }).click()

  await page.getByRole('link', { name: /Tandlæge/ }).first().click()
  await expect(page.getByLabel('Påmindelse')).toHaveValue('15')
  await page.getByLabel('Påmindelse').selectOption({ label: 'Ingen' })
  await expect(page.getByText('Ingen notifikation')).toBeVisible()
  await page.getByRole('button', { name: 'Gem ændringer' }).click()
  await page.getByRole('link', { name: /Tandlæge/ }).first().click()
  await expect(page.getByLabel('Påmindelse')).toHaveValue('none')
})
