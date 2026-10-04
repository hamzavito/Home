import { sections } from '@/app/sections'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'

export function MorePage() {
  return (
    <>
      <PageHeader title="Mere" />
      <ListGroup>
        {[sections.savings, sections.shopping, sections.receipts].map((s) => (
          <ListRow key={s.path} icon={s.icon} iconColor={s.color} title={s.title} to={s.path} />
        ))}
      </ListGroup>
      <ListGroup className="mt-6">
        <ListRow icon={sections.settings.icon} iconColor={sections.settings.color} title={sections.settings.title} to={sections.settings.path} />
      </ListGroup>
    </>
  )
}
