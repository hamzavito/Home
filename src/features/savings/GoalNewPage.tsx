import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/ui/PageHeader'
import { GoalForm } from './GoalForm'

export function GoalNewPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Nyt opsparingsmål" back="/opsparing" />
      <GoalForm onDone={(id) => navigate(`/opsparing/${id}`, { replace: true })} />
    </>
  )
}
