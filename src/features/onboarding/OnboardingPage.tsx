import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Home, Ticket } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { signupName, useAuth } from '@/features/auth/AuthProvider'
import { formatLongDate } from '@/lib/dates'
import { formatInviteCode, isValidInviteCode, readPendingInvite } from '@/lib/invite'
import { supabase } from '@/lib/supabase'
import { onboardingError, useAcceptInvite, useCreateHousehold, usePreviewInvite, type InvitePreview } from './api'

type Step = 'choose' | 'create' | 'code' | 'confirm'

/** Første gang en voksen logger ind: opret en husstand eller tag imod en invitation. */
export function OnboardingPage() {
  const { session, signOut } = useAuth()
  const userId = session?.user.id
  const profile = useQuery({
    queryKey: ['onboarding-profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('display_name').eq('id', userId!).maybeSingle()
      return data?.display_name ?? ''
    },
  })
  const pending = readPendingInvite()
  const [step, setStep] = useState<Step>(pending ? 'code' : 'choose')
  const [code, setCode] = useState(pending ? formatInviteCode(pending) : '')
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState('')
  const previewInvite = usePreviewInvite()
  const accept = useAcceptInvite()
  const create = useCreateHousehold()
  const [codeError, setCodeError] = useState<string | null>(null)

  // Foreslå navnet fra Apple, ellers profilnavnet (fra Google eller e-mailen)
  const suggested = signupName() ?? profile.data ?? ''
  const displayName = name ?? suggested

  async function lookUp(e?: FormEvent) {
    e?.preventDefault()
    setCodeError(null)
    if (!isValidInviteCode(code)) return setCodeError('Koden har 8 tegn, fx ABCD-EFGH.')
    try {
      const p = await previewInvite.mutateAsync(code)
      if (!p) return setCodeError('Invitationen er ugyldig, allerede brugt eller udløbet. Bed om en ny.')
      setPreview(p)
      setStep('confirm')
    } catch (err) {
      setCodeError(onboardingError(err))
    }
  }

  const nameOk = displayName.trim().length > 0 && displayName.trim().length <= 40

  return (
    <div className="flex min-h-dvh flex-col justify-center px-safe pb-safe pt-safe">
      <div className="mx-auto w-full max-w-sm py-8">
        {step !== 'choose' && (
          <button
            type="button"
            onClick={() => {
              setStep(step === 'confirm' ? 'code' : 'choose')
              setCodeError(null)
            }}
            className="mb-4 flex items-center gap-1 text-[15px] font-semibold text-accent-text active:opacity-60"
          >
            <ChevronLeft className="size-5" /> Tilbage
          </button>
        )}

        {step === 'choose' && (
          <>
            <img src="/icons/icon-192.png" alt="" className="mb-8 size-16 rounded-[20px] shadow-raised" />
            <h1 className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">Velkommen{suggested ? `, ${suggested.split(' ')[0]}` : ''}</h1>
            <p className="mb-8 mt-2 text-[16px] text-secondary">Opret jeres husstand, eller tag imod en invitation fra en, der allerede bruger Hjem.</p>
            <div className="space-y-3">
              <button type="button" onClick={() => setStep('create')} className="pressable flex w-full items-center gap-4 rounded-card bg-surface-primary p-5 text-left shadow-card">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-accent">
                  <Home className="size-6 text-accent-text" />
                </span>
                <span>
                  <span className="block text-[17px] font-semibold">Opret husstand</span>
                  <span className="block text-[14px] text-secondary">Du bliver ejer og kan invitere de andre.</span>
                </span>
              </button>
              <button type="button" onClick={() => setStep('code')} className="pressable flex w-full items-center gap-4 rounded-card bg-surface-primary p-5 text-left shadow-card">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-accent">
                  <Ticket className="size-6 text-accent-text" />
                </span>
                <span>
                  <span className="block text-[17px] font-semibold">Jeg har en invitation</span>
                  <span className="block text-[14px] text-secondary">Skriv koden, du har fået.</span>
                </span>
              </button>
            </div>
          </>
        )}

        {step === 'create' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (householdName.trim() && nameOk) create.mutate({ name: householdName, displayName })
            }}
            className="space-y-4"
          >
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">Opret husstand</h1>
            <Field label="Husstandens navn" hint="Fx Familien Jensen eller Vores hjem">
              <TextInput value={householdName} maxLength={80} onChange={(e) => setHouseholdName(e.target.value)} autoCapitalize="words" autoFocus />
            </Field>
            <Field label="Dit navn" hint="Sådan ser de andre i husstanden dig">
              <TextInput value={displayName} maxLength={40} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoComplete="given-name" />
            </Field>
            {create.isError && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">{onboardingError(create.error)}</p>}
            <Button type="submit" block loading={create.isPending} disabled={!householdName.trim() || !nameOk}>
              Opret husstand
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={lookUp} className="space-y-4">
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">Tag imod invitation</h1>
            {pending && <p className="text-[15px] text-secondary">Koden fra dit invitationslink er sat ind. Tryk Fortsæt.</p>}
            <Field label="Invitationskode" error={codeError}>
              <TextInput
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={60}
                autoFocus={!pending}
              />
            </Field>
            <Button type="submit" block loading={previewInvite.isPending} disabled={!code.trim()}>
              Fortsæt
            </Button>
          </form>
        )}

        {step === 'confirm' && preview && (
          <div className="space-y-4">
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">Bliv medlem af {preview.householdName}?</h1>
            <p className="text-[15px] text-secondary">
              {preview.invitedBy} har inviteret dig. Som voksen kan du se og styre hele husstanden, også økonomien. Invitationen gælder til {formatLongDate(new Date(preview.expiresAt))}.
            </p>
            <Field label="Dit navn" hint="Sådan ser de andre i husstanden dig">
              <TextInput value={displayName} maxLength={40} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoComplete="given-name" />
            </Field>
            {accept.isError && (
              <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger">
                {(accept.error as Error).message === 'invalid_invite' ? 'Invitationen er ikke længere gyldig. Bed om en ny.' : onboardingError(accept.error)}
              </p>
            )}
            <Button block loading={accept.isPending} disabled={!nameOk} onClick={() => accept.mutate({ code, displayName })}>
              Bliv medlem
            </Button>
          </div>
        )}

        <button type="button" onClick={() => void signOut()} className="mt-10 block w-full text-center text-[15px] font-semibold text-secondary active:opacity-60">
          Log ud{session?.user.email ? ` (${session.user.email})` : ''}
        </button>
      </div>
    </div>
  )
}
