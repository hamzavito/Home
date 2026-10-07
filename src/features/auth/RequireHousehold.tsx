import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { ChildApp } from '@/features/child/ChildApp'
import { HouseholdProvider, useHouseholdQuery } from '@/features/household/HouseholdProvider'
import { refreshPushSubscription } from '@/lib/push'
import { useAuth } from './AuthProvider'
import { LoadErrorScreen, NoHouseholdScreen } from './StatusScreens'

/** Beskytter alle sider: kræver login og medlemskab af en husstand. */
export function RequireHousehold() {
  const { session, loading } = useAuth()
  const household = useHouseholdQuery()
  const userId = session?.user.id

  // Forny telefonens tilmelding til notifikationer ved start (gør intet uden tilladelse)
  useEffect(() => {
    if (userId) void refreshPushSubscription().catch(() => {})
  }, [userId])

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (household.isPending) return <FullScreenLoader />
  if (household.isError) return <LoadErrorScreen onRetry={() => household.refetch()} />
  if (!household.data) return <NoHouseholdScreen />

  return (
    <HouseholdProvider household={household.data}>
      {/* Børn får deres egen, enklere app – uanset hvilken adresse de åbner */}
      {household.data.me.isChild ? <ChildApp /> : <Outlet />}
    </HouseholdProvider>
  )
}
