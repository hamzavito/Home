import { defineConfig, devices } from '@playwright/test'

// E2E-tests kører mod appen bygget med den lokale demo-backend (npm run test:e2e).
// CHROMIUM_PATH kan pege på en allerede installeret Chromium (fx i cloud-miljøer).
const executablePath = process.env.CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: 'e2e/tests',
  timeout: 120_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: {
    // Som brugernes telefoner: dansk sprog og dansk tid
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    baseURL: 'http://localhost:4300',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'lyst', use: { colorScheme: 'light' } },
    { name: 'mørkt', use: { colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'npx vite preview --config e2e/vite.config.ts',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env.CI,
  },
})
