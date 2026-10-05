import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getThemePreference } from './theme'

const metas = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m.getAttribute('content'), m.getAttribute('media')])

describe('applyTheme', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#f4f3ef" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">'
    localStorage.clear()
  })

  it('tvunget mørkt tema farver statuslinjen mørk', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(metas()).toEqual([
      ['#09090b', null],
      ['#09090b', null],
    ])
    expect(getThemePreference()).toBe('dark')
  })

  it('tilbage til system gendanner media queries', () => {
    applyTheme('light')
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(metas()).toEqual([
      ['#f4f3ef', '(prefers-color-scheme: light)'],
      ['#09090b', '(prefers-color-scheme: dark)'],
    ])
    expect(getThemePreference()).toBe('system')
  })
})
