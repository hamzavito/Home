import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'

/** Nøgletal (Nordnet-inspireret): label, stort tal, lille forklaring. */
export function StatCard({ label, ore, value, sub, tone }: { label: string; ore?: number; value?: ReactNode; sub?: ReactNode; tone?: 'positive' | 'danger' }) {
  const color = tone === 'positive' ? 'text-positive' : tone === 'danger' ? 'text-danger' : undefined
  return (
    <Card variant="tonal" className="p-4">
      <p className="text-[13px] font-medium text-text-secondary">{label}</p>
      <div className={`mt-1 ${color ?? ''}`}>{ore !== undefined ? <Money ore={ore} size="lg" decimals="never" /> : <span className="tabular text-[22px] font-bold tracking-tight">{value}</span>}</div>
      {sub && <p className="tabular mt-0.5 text-[12px] text-text-tertiary">{sub}</p>}
    </Card>
  )
}
