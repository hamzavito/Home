import { ChevronLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { supabase } from '@/lib/supabase'

// Nulstilling med engangskode i stedet for link:
// Et link i en mail åbner Safari – ikke den installerede PWA, som har sin egen
// login-session. Med en kode bliver brugeren i appen hele vejen.
//   1. resetPasswordForEmail → Supabase sender en mail med {{ .Token }}
//   2. verifyOtp(type: 'recovery') → brugeren er logget ind
//   3. updateUser({ password }) → ny adgangskode gemt

type Step = 'email' | 'code'

function authError(e: { status?: number; code?: string; message?: string }): string {
  if (e.status === 429 || e.code === 'over_email_send_rate_limit') return 'For mange forsøg. Vent et øjeblik og prøv igen.'
  if (e.code === 'otp_expired' || /expired|invalid/i.test(e.message ?? '')) return 'Koden er forkert eller udløbet. Bed om en ny kode.'
  if (e.code === 'weak_password') return 'Adgangskoden er for svag. Brug mindst 8 tegn.'
  if (e.code === 'same_password') return 'Vælg en anden adgangskode end den nuværende.'
  return 'Noget gik galt. Tjek forbindelsen og prøv igen.'
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
  const [notice, setNotice] = useState<string | null>(null)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setBusy(false)
    if (error) return setError(authError(error))
    setStep('code')
    // Samme besked uanset om e-mailen findes (afslører ikke hvem der har en konto)
    setNotice(`Hvis ${email.trim()} har en konto, har vi sendt en kode. Tjek også spam.`)
  }

  const codeOk = /^\d{6,10}$/.test(code.trim())
  const pwError = password.length > 0 && password.length < 8 ? 'Mindst 8 tegn' : password2.length > 0 && password !== password2 ? 'Adgangskoderne er ikke ens' : null

  async function reset(e: FormEvent) {
    e.preventDefault()
    if (!codeOk || password.length < 8 || password !== password2) return
    setBusy(true)
    setError(null)
    const verify = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' })
    if (verify.error) {
      setBusy(false)
      return setError(authError(verify.error))
    }
    const update = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (update.error) return setError(authError(update.error))
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm flex-1 pt-4">
        <Link to="/login" aria-label="Tilbage til login" className="pressable mb-8 flex size-10 items-center justify-center rounded-full bg-surface-1 shadow-card">
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </Link>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em]">Nulstil adgangskode</h1>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4" noValidate>
            <p className="text-[15px] text-text-secondary">Vi sender en kode til din e-mail. Du skriver den her i appen – du skal ikke klikke på noget link.</p>
            <Field label="E-mail" hideLabel>
              <TextInput type="email" inputMode="email" autoComplete="username" autoCapitalize="none" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" block loading={busy} disabled={!email.includes('@')}>
              Send kode
            </Button>
          </form>
        ) : (
          <form onSubmit={reset} className="mt-6 space-y-4" noValidate>
            {notice && <p className="text-[15px] text-text-secondary">{notice}</p>}
            <Field label="Kode fra e-mailen">
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="tabular text-center text-[24px] font-bold tracking-[0.3em]"
              />
            </Field>
            <Field label="Ny adgangskode" error={pwError}>
              <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Gentag ny adgangskode">
              <TextInput type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" block loading={busy} disabled={!codeOk || password.length < 8 || password !== password2}>
              Gem ny adgangskode
            </Button>
            <Button type="button" variant="ghost" block disabled={busy} onClick={() => sendCode()}>
              Send en ny kode
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
      {children}
    </p>
  )
}
