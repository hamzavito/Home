import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
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

  return (
    <div className="flex min-h-dvh flex-col justify-center px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm">
        <img src="/icons/icon-192.png" alt="" className="mb-8 size-16 rounded-[20px] shadow-raised" />
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">Velkommen hjem</h1>
        <p className="mb-8 mt-2 text-[16px] text-text-secondary">Log ind for at se jeres fælles overblik.</p>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <Field label="E-mail" hideLabel>
            <TextInput
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
          </Field>
          <Field label="Adgangskode" hideLabel>
            <TextInput
              type="password"
              autoComplete="current-password"
              placeholder="Adgangskode"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <label className="flex items-center justify-between px-1 py-2 text-[15px] font-medium">
            <span>Husk mig på denne enhed</span>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-5 accent-[var(--accent)]"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
              {error}
            </p>
          )}

          <Button type="submit" block loading={busy} disabled={!email || !password}>
            Log ind
          </Button>
        </form>

        <Link to="/glemt-adgangskode" className="mt-5 block text-center text-[15px] font-semibold text-accent active:opacity-60">
          Glemt adgangskode?
        </Link>

        <p className="mt-8 text-center text-[13px] text-text-tertiary">
          Kun for medlemmer af husstanden. Der er ingen offentlig tilmelding.
        </p>
      </div>
    </div>
  )
}
