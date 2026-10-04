import { Info, PiggyBank, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { SavingsCard } from '@/components/finance/SavingsCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useFixedGroups, useFixedMonth } from '@/features/fixed/api'
import { formatMonthYear, monthKey } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { useGoals, type GoalWithProgress } from './api'

export function goalSub(g: GoalWithProgress): string {
  if (g.currentOre >= g.target_ore) return 'Målet er nået'
  const rest = `${formatAmount(g.target_ore - g.currentOre, { decimals: 'never' })} kr. tilbage`
  return g.target_date ? `${rest} · ${formatMonthYear(new Date(`${g.target_date}T12:00:00`))}` : rest
}

/** Planlagt opsparing i de faste poster (plan – opretter aldrig bevægelser). */
export function usePlannedSavings() {
  const month = monthKey(new Date())
  const rows = useFixedMonth(month)
  const groups = useFixedGroups()
  const savingsGroups = new Set((groups.data ?? []).filter((g) => /opspar/i.test(g.name)).map((g) => g.id))
  return (rows.data ?? []).filter((r) => r.kind === 'expense' && r.group_id && savingsGroups.has(r.group_id)).reduce((s, r) => s + r.monthly_ore, 0)
}

export function SavingsPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const planned = usePlannedSavings()
  const list = goals.data ?? []
  const active = list.filter((g) => !g.archived_at)
  const archived = list.filter((g) => g.archived_at)
  const total = active.reduce((s, g) => s + g.currentOre, 0)
  const target = active.reduce((s, g) => s + g.target_ore, 0)

  return (
    <>
      <PageHeader
        title="Opsparing"
        back
        action={
          <Button size="sm" onClick={() => navigate('/opsparing/ny')}>
            <Plus className="size-4" strokeWidth={2.6} /> Nyt mål
          </Button>
        }
      />
      {goals.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : active.length === 0 && archived.length === 0 ? (
        <Card variant="tonal">
          <EmptyState icon={PiggyBank} title="Ingen opsparingsmål" text="Fx ferie, nødbuffer, bil, bolig eller Umrah/Hajj.">
            <Button size="sm" onClick={() => navigate('/opsparing/ny')}>
              Opret det første mål
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card variant="hero" className="p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-hero-text-secondary">Sparet op i alt</p>
            <Money ore={total} size="hero" decimals="never" className="mt-3 block" />
            <p className="mt-1.5 text-[14px] text-hero-text-secondary">
              af {formatAmount(target, { decimals: 'never' })} kr. på {active.length} {active.length === 1 ? 'mål' : 'mål'}
            </p>
          </Card>

          {planned > 0 && (
            <Link to="/okonomi/faste" className="mt-3 flex items-start gap-3 rounded-card bg-surface-secondary p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-secondary" />
              <p className="text-[13px] text-secondary">
                I de faste poster er der planlagt <span className="font-semibold text-primary">{formatAmount(planned, { decimals: 'never' })} kr./md.</span> til opsparing. Det er planen – registrér indbetalingerne på målene, når pengene flyttes.
              </p>
            </Link>
          )}

          <SectionHeader title="Aktive mål" />
          <div className="space-y-3">
            {active.map((g) => (
              <SavingsCard key={g.id} name={g.name} currentOre={g.currentOre} targetOre={g.target_ore} sub={goalSub(g)} to={`/opsparing/${g.id}`} />
            ))}
          </div>

          {archived.length > 0 && (
            <>
              <SectionHeader title="Arkiverede" />
              <div className="space-y-3">
                {archived.map((g) => (
                  <SavingsCard key={g.id} name={g.name} currentOre={g.currentOre} targetOre={g.target_ore} sub="Arkiveret" to={`/opsparing/${g.id}`} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
