import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { getRememberMe } from '@/lib/session-storage'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(getRememberMe)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn(email, password, remember)
    setBusy(false)
    if (res.error) setError(res.error)
  }

  const input =
    'h-12 w-full rounded-xl bg-fill px-4 text-[17px] text-text placeholder:text-text-tertiary outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="flex min-h-dvh flex-col justify-center px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm">
        <img src="/icons/icon-192.png" alt="" className="mx-auto mb-6 size-20 rounded-[22px] shadow-card" />
        <h1 className="text-center font-display text-[30px] font-bold tracking-tight">Hjem</h1>
        <p className="mb-8 text-center text-[15px] text-text-secondary">Log ind for at fortsætte</p>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <label className="block">
            <span className="sr-only">E-mail</span>
            <input
              className={input}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="E-mail"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="sr-only">Adgangskode</span>
            <input
              className={input}
              type="password"
              autoComplete="current-password"
              placeholder="Adgangskode"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl px-1 py-2 text-[15px]">
            <span>Husk mig på denne enhed</span>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-5 accent-[var(--accent)]"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" block loading={busy} disabled={!email || !password}>
            Log ind
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-text-tertiary">
          Kun for medlemmer af husstanden. Der er ingen offentlig tilmelding.
        </p>
      </div>
    </div>
  )
}
