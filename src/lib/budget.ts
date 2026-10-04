// Budgetstatus ud fra hvor stor en andel af budgettet der er brugt.
//   0–70 %   normal
//   70–90 %  diskret advarsel
//   90–100 % tydeligere advarsel
//   >100 %   overskredet
export type BudgetStatus = 'none' | 'normal' | 'notice' | 'warning' | 'over'

export function budgetStatus(spentOre: number, budgetOre: number): BudgetStatus {
  if (budgetOre <= 0) return spentOre > 0 ? 'over' : 'none'
  const ratio = spentOre / budgetOre
  if (ratio > 1) return 'over'
  if (ratio >= 0.9) return 'warning'
  if (ratio >= 0.7) return 'notice'
  return 'normal'
}

/** Procent brugt, afrundet. Uden budget: 0 (eller 100 hvis der er forbrug). */
export function percentUsed(spentOre: number, budgetOre: number): number {
  if (budgetOre <= 0) return spentOre > 0 ? 100 : 0
  return Math.round((spentOre / budgetOre) * 100)
}

/** CSS-farve pr. status. "normal" bruger den neutrale tekstfarve – ikke grøn – for at undgå trafiklys. */
export const statusColor: Record<BudgetStatus, string> = {
  none: 'var(--text-muted)',
  normal: 'var(--text-primary)',
  notice: 'var(--notice)',
  warning: 'var(--warning)',
  over: 'var(--danger)',
}

export const statusSoft: Record<BudgetStatus, string> = {
  none: 'var(--track)',
  normal: 'var(--track)',
  notice: 'var(--notice-soft)',
  warning: 'var(--warning-soft)',
  over: 'var(--danger-soft)',
}

export const statusLabel: Record<BudgetStatus, string> = {
  none: 'Intet budget',
  normal: 'På sporet',
  notice: 'Hold øje',
  warning: 'Næsten brugt',
  over: 'Overskredet',
}
