import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { isValidInviteCode, savePendingInvite } from '@/lib/invite'

/** /invitation/ABCDEFGH: husk koden og send videre til login eller tilmelding. */
export function InviteLandingPage() {
  const { code } = useParams()
  const { session, loading } = useAuth()
  const valid = Boolean(code && isValidInviteCode(code))
  useEffect(() => {
    if (valid) savePendingInvite(code!)
  }, [valid, code])
  if (loading) return <FullScreenLoader />
  return <Navigate to={session ? '/' : '/login'} replace />
}
