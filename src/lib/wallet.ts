import type { WalletKind } from '@/types/database'

/** Bevægelse i et barns lommepenge (samme felter som tabellen child_wallet_transactions) */
export type WalletTx = {
  kind: WalletKind
  amount_ore: number
  goal_id: string | null
  occurred_on: string
  voided_at: string | null
}

export const walletKindLabels: Record<WalletKind, string> = {
  allowance: 'Lommepenge',
  deposit: 'Ekstra',
  deduction: 'Fradrag',
  purchase: 'Køb',
  to_goal: 'Sat til side',
  from_goal: 'Taget fra opsparing',
}

/** Bevægelsens virkning på den frie saldo (øre, med fortegn). Samme regel som i databasen. */
export function balanceEffect(t: Pick<WalletTx, 'kind' | 'amount_ore'>): number {
  switch (t.kind) {
    case 'allowance':
    case 'deposit':
    case 'from_goal':
      return t.amount_ore
    case 'deduction':
    case 'purchase':
    case 'to_goal':
      return -t.amount_ore
  }
}

const active = (t: WalletTx) => t.voided_at === null

/** Fri saldo = summen af alle ikke-fortrudte bevægelser */
export function walletBalance(txs: WalletTx[]): number {
  return txs.filter(active).reduce((s, t) => s + balanceEffect(t), 0)
}

/** Sparet til et mål = sat til side minus taget fra */
export function goalSaved(txs: WalletTx[], goalId: string): number {
  return txs
    .filter((t) => active(t) && t.goal_id === goalId)
    .reduce((s, t) => s + (t.kind === 'to_goal' ? t.amount_ore : t.kind === 'from_goal' ? -t.amount_ore : 0), 0)
}

/** Ind og ud i en måned ("2026-10" eller "2026-10-01"). Flytninger til og fra mål tæller ikke som forbrug. */
export function walletMonth(txs: WalletTx[], month: string): { inOre: number; outOre: number } {
  const ym = month.slice(0, 7)
  let inOre = 0
  let outOre = 0
  for (const t of txs) {
    if (!active(t) || t.occurred_on.slice(0, 7) !== ym || t.kind === 'to_goal' || t.kind === 'from_goal') continue
    const e = balanceEffect(t)
    if (e > 0) inOre += e
    else outOre -= e
  }
  return { inOre, outOre }
}

/** Fremdrift i hele procent (0–100) */
export function goalPercent(savedOre: number, targetOre: number): number {
  if (targetOre <= 0) return 0
  return Math.max(0, Math.min(100, Math.floor((savedOre / targetOre) * 100)))
}
