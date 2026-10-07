import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { clearPrivateDeviceData } from '@/lib/device-data'
import { disablePush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { setRememberMe } from '@/lib/session-storage'

type AuthState = {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<{ error: string | null }>
  /** Barn: husstandskode + brugernavn + PIN (kontrolleres på serveren) */
  childSignIn: (code: string, username: string, pin: string, remember: boolean) => Promise<{ error: string | null }>
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

  const childSignIn: AuthState['childSignIn'] = async (code, username, pin, remember) => {
    setRememberMe(remember)
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; session?: { access_token: string; refresh_token: string } }>('child-login', {
      body: { code, username, pin },
    })
    if (!error && data?.ok && data.session) {
      const { error: e2 } = await supabase.auth.setSession(data.session)
      return { error: e2 ? 'Login mislykkedes. Prøv igen.' : null }
    }
    const status = (error as { context?: Response } | null)?.context?.status
    if (status === 401) return { error: 'Loginoplysningerne er forkerte.' }
    if (status === 429) return { error: 'For mange forsøg. Vent lidt og prøv igen.' }
    return { error: 'Login mislykkedes. Tjek din forbindelse og prøv igen.' }
  }

  const signOut = async () => {
    // Ingen notifikationer til en telefon, der er logget ud (højst 3 sek. – også uden net)
    await Promise.race([disablePush().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])
    // 'local' logger kun denne enhed ud, så partnerens/andre enheders login bevares.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      // Fjern alt privat fra enheden – også hvis netværket fejler
      queryClient.clear()
      clearPrivateDeviceData()
    }
  }

  return <AuthContext value={{ session, loading, signIn, childSignIn, signOut }}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth skal bruges inden for AuthProvider')
  return ctx
}
