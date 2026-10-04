import { useSearchParams } from 'react-router'
import { monthKey } from '@/lib/dates'

/** Valgt måned gemmes i URL'en (?m=2026-10), så den huskes ved navigation frem og tilbage. */
export function useMonthParam(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('m')
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : monthKey(new Date())
  const setMonth = (m: string) => {
    const next = new URLSearchParams(params)
    if (m === monthKey(new Date())) next.delete('m')
    else next.set('m', m.slice(0, 7))
    setParams(next, { replace: true })
  }
  return [month, setMonth]
}
