import { Mail } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { readPendingInvite } from '@/lib/invite'
import { getRememberMe } from '@/lib/session-storage'
import { appleEnabled, appleIdToken, googleEnabled, isCancelled, renderGoogleButton, type IdTokenResult } from '@/lib/social-login'
import { useAuth } from './AuthProvider'

type AdultStep = 'password' | 'code-email' | 'code-verify'

export function LoginPage() {
  const { session, signIn, childSignIn, sendEmailCode, verifyEmailCode, idTokenSignIn } = useAuth()
  const [mode, setMode] = useState<'adult' | 'child'>('adult')
  const [step, setStep] = useState<AdultStep>('password')
  const [otp, setOtp] = useState('')
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const invited = readPendingInvite() !== null
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(getRememberMe)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cooldown = Math.max(0, Math.ceil((sentAt + 60_000 - now) / 1000))
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  if (session) return <Navigate to="/" replace />

  async function social(provider: 'apple' | 'google', get: () => Promise<IdTokenResult>) {
    setError(null)
    setBusy(true)
    try {
      const r = await get()
      const res = await idTokenSignIn(provider, r, remember)
      if (res.error) setError(res.error)
    } catch (e) {
      if (!isCancelled(e)) setError('Login mislykkedes. Prøv igen.')
    } finally {
      setBusy(false)
    }
  }

  async function sendCode() {
    if (cooldown > 0) return
    setBusy(true)
    setError(null)
    const res = await sendEmailCode(email)
    setBusy(false)
    if (res.error) return setError(res.error)
    setSentAt(Date.now())
    setNow(Date.now())
    setOtp('')
    setStep('code-verify')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'adult' && step === 'code-email') return void sendCode()
    setBusy(true)
    setError(null)
    const res =
      mode === 'child'
        ? await childSignIn(code, username, pin, remember)
        : step === 'code-verify'
          ? await verifyEmailCode(email, otp, remember)
          : await signIn(email, password, remember)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      if (mode === 'child') setPin('')
    }
  }

  const adultDisabled = step === 'password' ? !email || !password : step === 'code-email' ? !/^\S+@\S+\.\S+$/.test(email.trim()) : !/^\d{6,10}$/.test(otp)

  return (
    <div className="flex min-h-dvh flex-col justify-center px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm">
        <img src="/icons/icon-192.png" alt="" className="mb-8 size-16 rounded-[20px] shadow-raised" />
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">Velkommen hjem</h1>
        <p className="mb-8 mt-2 text-[16px] text-secondary">Log ind, eller opret dig på et øjeblik.</p>
        {invited && (
          <p className="mb-5 rounded-2xl bg-surface-accent px-4 py-3 text-[15px] font-medium text-accent-text">
            Du er inviteret til en husstand. Log ind eller opret dig for at fortsætte.
          </p>
        )}

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

        {mode === 'adult' && step === 'password' && (appleEnabled() || googleEnabled()) && (
          <div className="mb-5 space-y-3">
            {appleEnabled() && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void social('apple', appleIdToken)}
                className="pressable flex h-13 w-full items-center justify-center gap-2 rounded-full bg-black text-[16px] font-semibold text-white dark:bg-white dark:text-black"
              >
                <AppleLogo /> Fortsæt med Apple
              </button>
            )}
            {googleEnabled() && <GoogleButton onToken={(r) => void social('google', async () => r)} />}
            <div className="flex items-center gap-3 py-1 text-[13px] text-secondary">
              <span className="h-px flex-1 bg-[var(--border-subtle)]" /> eller <span className="h-px flex-1 bg-[var(--border-subtle)]" />
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {mode === 'adult' ? (
            <>
              {step !== 'code-verify' && (
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
              )}
              {step === 'password' && (
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
              )}
              {step === 'code-verify' && (
                <>
                  <p className="px-1 text-[15px] text-secondary">
                    Vi har sendt en kode til <span className="font-semibold text-primary">{email.trim()}</span>. Skriv den her.
                  </p>
                  <Field label="Kode fra e-mail" hideLabel>
                    <TextInput
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Kode"
                      maxLength={10}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      autoFocus
                    />
                  </Field>
                </>
              )}
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

          <Button type="submit" block loading={busy} disabled={mode === 'adult' ? adultDisabled : !code.trim() || !username.trim() || pin.length < 4}>
            {mode === 'adult' && step === 'code-email' ? 'Send kode' : mode === 'adult' && step === 'code-verify' ? 'Fortsæt' : 'Log ind'}
          </Button>
        </form>

        {mode === 'adult' && step === 'password' && (
          <>
            <button
              type="button"
              onClick={() => {
                setStep('code-email')
                setError(null)
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 text-[15px] font-semibold text-accent-text active:opacity-60"
            >
              <Mail className="size-4" /> Få en kode på mail i stedet
            </button>
            <Link to="/glemt-adgangskode" className="mt-4 block text-center text-[15px] font-semibold text-accent-text active:opacity-60">
              Glemt adgangskode?
            </Link>
          </>
        )}
        {mode === 'adult' && step !== 'password' && (
          <div className="mt-5 flex flex-col items-center gap-4">
            {step === 'code-verify' && (
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="text-[15px] font-semibold text-accent-text active:opacity-60 disabled:text-muted">
                {cooldown > 0 ? `Send ny kode om ${cooldown} sek.` : 'Send ny kode'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep('password')
                setError(null)
              }}
              className="text-[15px] font-semibold text-accent-text active:opacity-60"
            >
              Log ind med adgangskode
            </button>
          </div>
        )}
        {mode === 'child' && <p className="mt-5 text-center text-[14px] text-secondary">Har du glemt din PIN? Spørg en voksen.</p>}

        {mode === 'adult' && (
          <p className="mt-8 text-center text-[13px] text-secondary">
            Ny her? Fortsæt med {appleEnabled() || googleEnabled() ? 'Apple, Google eller ' : ''}en kode på mail. Så oprettes din konto, og du kan oprette jeres husstand eller tage imod en invitation.
          </p>
        )}
      </div>
    </div>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 814 1000" aria-hidden="true" className="size-[18px] fill-current">
      <path d="M788 341c-6 4-108 62-108 190 0 149 131 201 135 203-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-166 41s-106-57-156-127C46 792 0 665 0 545c0-193 125-295 249-295 66 0 121 43 162 43 39 0 101-46 176-46 29 0 131 3 201 94zM554 159c31-37 53-88 53-139 0-7-1-14-2-20-50 2-110 34-146 76-28 32-55 83-55 135 0 8 1 16 2 18 3 1 9 2 14 2 45 0 102-30 134-72z" />
    </svg>
  )
}

/** Googles egen knap – den skal tegnes af Googles bibliotek */
function GoogleButton({ onToken }: { onToken: (r: IdTokenResult) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onToken)
  useEffect(() => {
    cb.current = onToken
  })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    renderGoogleButton(el, Math.min(400, el.clientWidth || 320), (r) => cb.current(r)).catch(() => setFailed(true))
  }, [])
  if (failed) return <p className="text-center text-[13px] text-secondary">Google-login kunne ikke indlæses.</p>
  return <div ref={ref} className="flex h-11 justify-center" aria-label="Fortsæt med Google" />
}
