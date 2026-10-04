import { Navigate, Outlet } from 'react-router'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { HouseholdProvider, useHouseholdQuery } from '@/features/household/HouseholdProvider'
import { useAuth } from './AuthProvider'
import { LoadErrorScreen, NoHouseholdScreen } from './StatusScreens'

/** Beskytter alle sider: kræver login og medlemskab af en husstand. */
export function RequireHousehold() {
  const { session, loading } = useAuth()
  const household = useHouseholdQuery()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (household.isPending) return <FullScreenLoader />
  if (household.isError) return <LoadErrorScreen onRetry={() => household.refetch()} />
  if (!household.data) return <NoHouseholdScreen />

  return (
    <HouseholdProvider household={household.data}>
      <Outlet />
    </HouseholdProvider>
  )
}
