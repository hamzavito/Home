import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Start appen uden demodata (tom husstand med Hamza og Sumaya). */
export async function startEmpty(page: Page, path = '/') {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('hjem-demo-mode', 'empty')
    } catch {
      /* ignorér */
    }
  })
  await page.goto(path)
  await expect(page.getByText('Hamza & Sumaya').or(page.getByRole('heading').first())).toBeVisible()
}

/** Start appen med demodata (faste poster, budgetter, udgifter, kvitteringer …). */
export async function startDemo(page: Page, path = '/') {
  await page.goto(path)
}

/** Kør axe og fejl ved kontrastproblemer (WCAG AA). */
export async function expectReadable(page: Page, name: string) {
  // Vent til animationer er færdige, så kontrasten måles på den endelige farve
  await page.waitForTimeout(800)
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const issues = result.violations.flatMap((v) =>
    v.nodes.map((n) => `${name}: ${n.target.join(' ')} – ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`),
  )
  expect(issues, issues.join('\n')).toEqual([])
}

/** Danske beløb kan indeholde hårde mellemrum – normalisér før sammenligning. */
export const norm = (s: string | null) => (s ?? '').replace(/[\u00a0\u202f]/g, ' ')
