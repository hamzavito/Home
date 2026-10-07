import { describe, expect, it } from 'vitest'
import { balanceEffect, goalPercent, goalSaved, walletBalance, walletMonth, type WalletTx } from './wallet'

const tx = (kind: WalletTx['kind'], amount_ore: number, extra: Partial<WalletTx> = {}): WalletTx => ({
  kind,
  amount_ore,
  goal_id: null,
  occurred_on: '2026-10-05',
  voided_at: null,
  ...extra,
})

describe('lommepenge', () => {
  it('giver fortegn efter type', () => {
    expect(balanceEffect(tx('allowance', 5000))).toBe(5000)
    expect(balanceEffect(tx('deposit', 1000))).toBe(1000)
    expect(balanceEffect(tx('from_goal', 300))).toBe(300)
    expect(balanceEffect(tx('purchase', 2000))).toBe(-2000)
    expect(balanceEffect(tx('deduction', 500))).toBe(-500)
    expect(balanceEffect(tx('to_goal', 700))).toBe(-700)
  })

  it('beregner saldo og ignorerer fortrudte bevægelser', () => {
    const txs = [tx('allowance', 10000), tx('purchase', 2500), tx('deposit', 9999, { voided_at: '2026-10-06T10:00:00Z' }), tx('to_goal', 3000, { goal_id: 'g1' })]
    expect(walletBalance(txs)).toBe(4500)
  })

  it('beregner sparet pr. mål', () => {
    const txs = [
      tx('to_goal', 3000, { goal_id: 'g1' }),
      tx('to_goal', 2000, { goal_id: 'g2' }),
      tx('from_goal', 500, { goal_id: 'g1' }),
      tx('to_goal', 800, { goal_id: 'g1', voided_at: '2026-10-06T10:00:00Z' }),
    ]
    expect(goalSaved(txs, 'g1')).toBe(2500)
    expect(goalSaved(txs, 'g2')).toBe(2000)
    expect(goalSaved(txs, 'g3')).toBe(0)
  })

  it('opgør måneden uden flytninger til mål', () => {
    const txs = [
      tx('allowance', 10000),
      tx('purchase', 2500),
      tx('to_goal', 3000, { goal_id: 'g1' }),
      tx('allowance', 10000, { occurred_on: '2026-09-28' }),
    ]
    expect(walletMonth(txs, '2026-10')).toEqual({ inOre: 10000, outOre: 2500 })
    expect(walletMonth(txs, '2026-10-01')).toEqual({ inOre: 10000, outOre: 2500 })
  })

  it('beregner procent inden for 0–100', () => {
    expect(goalPercent(2500, 10000)).toBe(25)
    expect(goalPercent(15000, 10000)).toBe(100)
    expect(goalPercent(0, 0)).toBe(0)
    expect(goalPercent(999, 1000)).toBe(99)
  })
})
