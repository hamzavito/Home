import { sections } from '@/app/sections'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'

export function HomeHubPage() {
  return (
    <>
      <PageHeader title="Hjemmet" />
      <ListGroup>
        {[sections.calendar, sections.shopping].map((s) => (
          <ListRow key={s.path} icon={s.icon} iconColor={s.color} title={s.title} to={s.path} />
        ))}
      </ListGroup>
      <EmptyState icon={sections.tasks.icon} title="Opgaver" text={`Opgaver i hjemmet bygges i fase ${sections.tasks.phase}.`} />
    </>
  )
}
