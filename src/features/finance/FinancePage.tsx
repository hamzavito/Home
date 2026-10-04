import { Wallet } from 'lucide-react'
import { sections } from '@/app/sections'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'

export function FinancePage() {
  return (
    <>
      <PageHeader title="Økonomi" />
      <ListGroup>
        {[sections.budgets, sections.upcoming, sections.receipts].map((s) => (
          <ListRow key={s.path} icon={s.icon} iconColor={s.color} title={s.title} to={s.path} />
        ))}
      </ListGroup>
      <EmptyState icon={Wallet} title="Transaktioner" text={`Registrering af udgifter bygges i fase ${sections.finance.phase}.`} />
    </>
  )
}
