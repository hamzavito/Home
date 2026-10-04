import { Check, ChevronLeft } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { authErrorMessage } from '@/lib/auth-errors'
import { supabase } from '@/lib/supabase'

// Nulstilling med Supabases officielle recovery-flow og en engangskode
// ({{ .Token }} i mailskabelonen "Reset Password") i stedet for et link:
// Et link i en mail åbner Safari – ikke den installerede PWA, som har sin egen
// session. Med en kode bliver brugeren i appen hele vejen.
//
//   1. auth.resetPasswordForEmail(email)          → Supabase sender koden
//   2. auth.verifyOtp({ type: 'recovery', … })     → koden verificeres, bruger logges ind
//   3. auth.updateUser({ password })               → ny adgangskode gemmes
//
// Mailafsendelsen er udelukkende Supabase-konfiguration (indbygget server nu,
// custom SMTP senere) – frontend-flowet ændres ikke ved et skift.

type Step = 'email' | 'code' | 'password' | 'done'

const COOLDOWN_SECONDS = 60
const SENT_KEY = 'hjem.reset.sentAt'

function readSentAt(): number {
  try {
    return Number(sessionStorage.getItem(SENT_KEY) ?? 0)
  } catch {
    return 0
  }
}
function writeSentAt(ts: number) {
  try {
    sessionStorage.setItem(SENT_KEY, String(ts))
  } catch {
    // ingen lagring – cooldown gælder blot i hukommelsen
  }
}


export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [sentAt, setSentAt] = useState(readSentAt)

  const cooldown = Math.max(0, Math.ceil((sentAt + COOLDOWN_SECONDS * 1000 - now) / 1000))
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    if (cooldown > 0 || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    // Kun hastighedsbegrænsning og manglende forbindelse vises som fejl. Alt andet
    // behandles som "sendt", så appen aldrig afslører om en e-mail har en konto.
    if (error && (error.status === 429 || /rate/i.test(error.code ?? ''))) return setError(authErrorMessage(error))
    if (error && (!error.status || error.name === 'AuthRetryableFetchError')) return setError('Ingen forbindelse. Prøv igen.')
    const ts = Date.now()
    writeSentAt(ts)
    setSentAt(ts)
    setNow(ts)
    setCode('')
    setStep('code')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!codeOk || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' })
    setBusy(false)
    if (error) return setError(authErrorMessage(error))
    setStep('password')
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (!pwValid || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(authErrorMessage(error))
    setStep('done')
  }

  const codeOk = /^\d{6,10}$/.test(code.trim())
  const pwValid = password.length >= 8 && password === password2
  const pwError = password.length > 0 && password.length < 8 ? 'Mindst 8 tegn' : password2.length > 0 && password !== password2 ? 'Adgangskoderne er ikke ens' : null

  return (
    <div className="flex min-h-dvh flex-col px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm flex-1 pt-4">
        {step !== 'done' && (
          <Link to="/login" aria-label="Tilbage til login" className="pressable mb-8 flex size-10 items-center justify-center rounded-full bg-surface-1 shadow-card">
            <ChevronLeft className="size-5" strokeWidth={2.5} />
          </Link>
        )}

        {step === 'email' && (
          <form onSubmit={sendCode} className="space-y-4" noValidate>
            <Title>Nulstil adgangskode</Title>
            <p className="text-[15px] text-text-secondary">Vi sender en 6-cifret kode til din e-mail. Du skriver den her i appen – du skal ikke klikke på noget link.</p>
            <Field label="E-mail" hideLabel>
              <TextInput type="email" inputMode="email" autoComplete="username" autoCapitalize="none" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" block loading={busy} disabled={!email.includes('@') || cooldown > 0}>
              {cooldown > 0 ? `Send kode (${cooldown} s)` : 'Send kode'}
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode} className="space-y-4" noValidate>
            <Title>Indtast koden</Title>
            <p className="text-[15px] text-text-secondary">
              Hvis <span className="font-semibold text-text">{email.trim()}</span> har en konto, har vi sendt en kode. Tjek også spam.
            </p>
            <Field label="6-cifret kode" hideLabel>
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={10}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="tabular h-16 text-center text-[28px] font-bold tracking-[0.35em]"
                aria-label="Kode fra e-mailen"
              />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" block loading={busy} disabled={!codeOk}>
              Bekræft kode
            </Button>
            <Button type="button" variant="ghost" block disabled={busy || cooldown > 0} onClick={() => sendCode()}>
              {cooldown > 0 ? `Send ny kode om ${cooldown} s` : 'Send ny kode'}
            </Button>
            <button type="button" className="block w-full text-center text-[14px] text-text-secondary" onClick={() => {
                setStep('email')
                setError(null)
              }}>
              Forkert e-mail?
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={savePassword} className="space-y-4" noValidate>
            <Title>Vælg ny adgangskode</Title>
            <p className="text-[15px] text-text-secondary">Koden er godkendt. Vælg en adgangskode på mindst 8 tegn.</p>
            <Field label="Ny adgangskode" error={pwError}>
              <TextInput type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Gentag ny adgangskode">
              <TextInput type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" block loading={busy} disabled={!pwValid}>
              Gem ny adgangskode
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center pt-16 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-positive-soft [animation:pop_420ms_var(--ease-spring)_both]">
              <Check className="size-10 text-positive" strokeWidth={3} />
            </span>
            <Title className="mt-6">Adgangskoden er ændret</Title>
            <p className="mt-2 text-[15px] text-text-secondary">Du er logget ind. Brug den nye adgangskode næste gang.</p>
            <Button block className="mt-10" onClick={() => navigate('/', { replace: true })}>
              Fortsæt til appen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={`text-[30px] font-bold leading-tight tracking-[-0.03em] ${className ?? ''}`}>{children}</h1>
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
      {children}
    </p>
  )
}
