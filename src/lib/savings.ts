// Fremskrivning af opsparingsmål. Rene funktioner (testes i savings.test.ts).

export type Movement = { kind: 'deposit' | 'withdrawal'; amount_ore: number; occurred_on: string }

const monthIndex = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return y! * 12 + (m! - 1)
}

/** Gennemsnitlig nettoindbetaling pr. måned over de seneste `months` hele måneder + indeværende. */
export function averageMonthly(movements: Movement[], today: Date = new Date(), months = 3): number {
  const now = today.getFullYear() * 12 + today.getMonth()
  const from = now - (months - 1)
  const net = movements
    .filter((m) => monthIndex(m.occurred_on) >= from && monthIndex(m.occurred_on) <= now)
    .reduce((s, m) => s + (m.kind === 'deposit' ? m.amount_ore : -m.amount_ore), 0)
  return Math.round(net / months)
}

export type Projection =
  | { kind: 'reached' }
  | { kind: 'eta'; months: number; date: Date }
  | { kind: 'no-trend' }

/** Hvornår nås målet med det nuværende tempo? */
export function projectGoal(currentOre: number, targetOre: number, monthlyOre: number, today: Date = new Date()): Projection {
  if (currentOre >= targetOre) return { kind: 'reached' }
  if (monthlyOre <= 0) return { kind: 'no-trend' }
  const months = Math.ceil((targetOre - currentOre) / monthlyOre)
  return { kind: 'eta', months, date: new Date(today.getFullYear(), today.getMonth() + months, 1, 12) }
}

/** Hvor meget skal der spares pr. måned for at nå målet til måldatoen? */
export function requiredMonthly(currentOre: number, targetOre: number, targetIso: string, today: Date = new Date()): number | null {
  const remaining = targetOre - currentOre
  if (remaining <= 0) return 0
  const monthsLeft = monthIndex(targetIso) - (today.getFullYear() * 12 + today.getMonth())
  if (monthsLeft <= 0) return null
  return Math.ceil(remaining / monthsLeft)
}
