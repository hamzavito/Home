import { Hammer } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import type { Section } from '@/app/sections'

export function ComingSoon({ section, back = true }: { section: Section; back?: boolean }) {
  return (
    <>
      <PageHeader title={section.title} back={back} />
      <EmptyState icon={Hammer} title="Kommer snart" text={`${section.title} bygges i fase ${section.phase}.`} />
    </>
  )
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Ikke fundet" back />
      <p className="text-text-secondary">Siden findes ikke.</p>
    </>
  )
}
