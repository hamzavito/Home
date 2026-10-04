// Hjælpere til simple grafer.

/** Antal dage i måneden for "YYYY-MM-01" */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y!, m!, 0).getDate()
}

/**
 * Hvor mange dage af måneden der er "gået" (inkl. i dag).
 * Tidligere måneder = alle dage, fremtidige = 0.
 */
export function elapsedDays(month: string, today: Date = new Date()): number {
  const [y, m] = month.split('-').map(Number)
  const ty = today.getFullYear()
  const tm = today.getMonth() + 1
  if (y! < ty || (y === ty && m! < tm)) return daysInMonth(month)
  if (y === ty && m === tm) return today.getDate()
  return 0
}

/** Kumuleret forbrug pr. dag: index 0 = dag 1. Kun dage frem til `upToDay`. */
export function cumulativeByDay(month: string, items: Array<{ date: string; ore: number }>, upToDay: number): number[] {
  const days = daysInMonth(month)
  const daily = new Array<number>(days).fill(0)
  for (const it of items) {
    if (!it.date.startsWith(month.slice(0, 7))) continue
    const d = Number(it.date.slice(8, 10))
    if (d >= 1 && d <= days) daily[d - 1]! += it.ore
  }
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < Math.min(upToDay, days); i++) {
    sum += daily[i]!
    out.push(sum)
  }
  return out
}
