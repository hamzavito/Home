import { PageHeader } from '@/components/ui/PageHeader'
import { NotificationSettings } from './NotificationSettings'

/** Notifikationer: på denne telefon og hvad jeg får besked om */
export function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifikationer" back="/indstillinger" />
      <div className="mt-4">
        <NotificationSettings header={false} />
      </div>
    </>
  )
}
