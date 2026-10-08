import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { ChildApp } from '@/features/child/ChildApp'
import { HouseholdProvider, useHouseholdQuery } from '@/features/household/HouseholdProvider'
import { isHiddenEmail } from '@/lib/child-login'
import { clearPendingInvite } from '@/lib/invite'
import { refreshPushSubscription } from '@/lib/push'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
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

  // Allerede med i en husstand: en gemt invitation er ikke længere relevant
  const hasHousehold = Boolean(household.data)
  useEffect(() => {
    if (hasHousehold) clearPendingInvite()
  }, [hasHousehold])

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (household.isPending) return <FullScreenLoader />
  if (household.isError) return <LoadErrorScreen onRetry={() => household.refetch()} />
  // Børn (skjult identitet) uden aktiv husstand: login slået fra. Voksne: opret eller tag imod invitation.
  if (!household.data) return isHiddenEmail(session.user.email) ? <NoHouseholdScreen /> : <OnboardingPage />

  return (
    <HouseholdProvider household={household.data}>
      {/* Børn får deres egen, enklere app – uanset hvilken adresse de åbner */}
      {household.data.me.isChild ? <ChildApp /> : <Outlet />}
    </HouseholdProvider>
  )
}
