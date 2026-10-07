import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { getRememberMe } from '@/lib/session-storage'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { session, signIn, childSignIn } = useAuth()
  const [mode, setMode] = useState<'adult' | 'child'>('adult')
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
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
    const res = mode === 'adult' ? await signIn(email, password, remember) : await childSignIn(code, username, pin, remember)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      if (mode === 'child') setPin('')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm">
        <img src="/icons/icon-192.png" alt="" className="mb-8 size-16 rounded-[20px] shadow-raised" />
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">Velkommen hjem</h1>
        <p className="mb-8 mt-2 text-[16px] text-secondary">Log ind for at se jeres fælles overblik.</p>

        <div className="mb-5">
          <SegmentedControl
            label="Log ind som"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
            }}
            options={[
              { value: 'adult', label: 'Voksen' },
              { value: 'child', label: 'Barn' },
            ]}
          />
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {mode === 'adult' ? (
            <>
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
            </>
          ) : (
            <>
              <Field label="Husstandskode" hideLabel>
                <TextInput
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Husstandskode"
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Brugernavn" hideLabel>
                <TextInput
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Brugernavn"
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="PIN" hideLabel>
                <TextInput
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  placeholder="PIN"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </>
          )}

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

          <Button type="submit" block loading={busy} disabled={mode === 'adult' ? !email || !password : !code.trim() || !username.trim() || pin.length < 4}>
            Log ind
          </Button>
        </form>

        {mode === 'adult' && (
          <Link to="/glemt-adgangskode" className="mt-5 block text-center text-[15px] font-semibold text-accent-text active:opacity-60">
            Glemt adgangskode?
          </Link>
        )}
        {mode === 'child' && <p className="mt-5 text-center text-[14px] text-secondary">Har du glemt din PIN? Spørg en voksen.</p>}

        <p className="mt-8 text-center text-[13px] text-muted">
          Kun for medlemmer af husstanden. Der er ingen offentlig tilmelding.
        </p>
      </div>
    </div>
  )
}
