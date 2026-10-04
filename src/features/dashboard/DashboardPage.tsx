import { CalendarClock, PiggyBank, Receipt, WalletCards } from 'lucide-react'
import { sections } from '@/app/sections'
import { SpendingChart } from '@/components/charts/SpendingChart'
import { MoneyCard } from '@/components/finance/MoneyCard'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { formatMonth, greeting, monthKey } from '@/lib/dates'
import { daysInMonth, elapsedDays } from '@/lib/series'

export function DashboardPage() {
  const { members } = useHousehold()
  const now = new Date()
  const month = monthKey(now)
  const days = daysInMonth(month)
  const names = members.map((m) => m.displayName).join(' & ')

  return (
    <>
      <header className="pb-4 pt-4">
        <p className="text-[15px] font-medium text-text-secondary">{greeting(now)}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em]">{names}</h1>
      </header>

      <MoneyCard eyebrow={formatMonth(now)} budgetOre={0} spentOre={0} pace={elapsedDays(month) / days}>
        <div className="mt-5">
          <SpendingChart series={[]} days={days} budgetOre={0} tone="hero" height={72} />
        </div>
      </MoneyCard>

      <SectionHeader title="Budgetter" to={sections.budgets.path} />
      <Card variant="tonal">
        <EmptyState compact icon={WalletCards} title="Ingen budgetter endnu" text={`Budgetter kommer i fase ${sections.budgets.phase}.`} />
      </Card>

      <SectionHeader title="Kommende" />
      <Card>
        <EmptyState compact icon={CalendarClock} title="Intet kommende" text="Kommende udgifter og aftaler vises her." />
      </Card>

      <SectionHeader title="Opsparing" />
      <Card variant="tonal">
        <EmptyState compact icon={PiggyBank} title="Ingen opsparingsmål" text={`Opsparing kommer i fase ${sections.savings.phase}.`} />
      </Card>

      <SectionHeader title="Seneste aktivitet" />
      <Card padded={false}>
        <EmptyState compact icon={Receipt} title="Ingen udgifter endnu" text="Registrerede udgifter vises her." />
      </Card>
    </>
  )
}
