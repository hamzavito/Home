import { Compass } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Ikke fundet" back="/" />
      <EmptyState icon={Compass} title="Siden findes ikke" text="Linket kan være forkert, eller indholdet er slettet.">
        <Button size="sm" onClick={() => navigate('/')}>
          Gå til forsiden
        </Button>
      </EmptyState>
    </>
  )
}
