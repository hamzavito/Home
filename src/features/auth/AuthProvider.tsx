import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { clearPrivateDeviceData } from '@/lib/device-data'
import { supabase } from '@/lib/supabase'
import { setRememberMe } from '@/lib/session-storage'

type AuthState = {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn: AuthState['signIn'] = async (email, password, remember) => {
    setRememberMe(remember)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (!error) return { error: null }
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      return { error: 'Forkert e-mail eller adgangskode.' }
    }
    if (error.status === 429) return { error: 'For mange forsøg. Vent lidt og prøv igen.' }
    return { error: 'Login mislykkedes. Tjek din forbindelse og prøv igen.' }
  }

  const signOut = async () => {
    // 'local' logger kun denne enhed ud, så partnerens/andre enheders login bevares.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      // Fjern alt privat fra enheden – også hvis netværket fejler
      queryClient.clear()
      clearPrivateDeviceData()
    }
  }

  return <AuthContext value={{ session, loading, signIn, signOut }}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth skal bruges inden for AuthProvider')
  return ctx
}
