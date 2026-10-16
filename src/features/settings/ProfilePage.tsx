import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useAuth } from '@/features/auth/AuthProvider'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { authErrorMessage } from '@/lib/auth-errors'
import type { DefaultPaidBy } from '@/types/database'
import { useChangePassword, useUpdateProfile } from './api'

/** Min profil: navn, adgangskode og mine egne standardvalg */
export function ProfilePage() {
  const household = useHousehold()
  const { session } = useAuth()
  const [name, setName] = useState(household.me.displayName)
  const [sheet, setSheet] = useState<'password' | null>(null)
  const profile = useUpdateProfile()

  const trimmed = name.trim()
  const nameChanged = trimmed !== household.me.displayName && trimmed.length > 0 && trimmed.length <= 40
  const shownPaidBy = profile.isPending && profile.variables?.default_paid_by ? profile.variables.default_paid_by : household.me.defaultPaidBy

  return (
    <>
      <PageHeader title="Min profil" back="/indstillinger" />

      <div className="mt-4 rounded-card bg-surface-primary p-5 shadow-card">
        <Field label="Visningsnavn" hint={session?.user.email}>
          <div className="flex gap-2">
            <TextInput value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="flex-1" autoCapitalize="words" />
            <Button className="h-13 shrink-0" disabled={!nameChanged} loading={profile.isPending && profile.variables?.display_name !== undefined} onClick={() => profile.mutate({ display_name: trimmed })}>
              Gem
            </Button>
          </div>
        </Field>
        {profile.isError && <p className="mt-2 px-1 text-[13px] text-danger">Det kunne ikke gemmes. Prøv igen.</p>}
      </div>
      <ListGroup className="mt-3">
        <ListRow icon={KeyRound} title="Adgangskode" subtitle="Skift eller opret en adgangskode" onClick={() => setSheet('password')} />
      </ListGroup>

      <SectionHeader title="Mine standardvalg" />
      <div className="rounded-card bg-surface-primary p-5 shadow-card">
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Betalt af – forslag i nye udgifter</p>
        <SegmentedControl<DefaultPaidBy>
          label="Betalt af som standard"
          value={shownPaidBy}
          onChange={(v) => v !== household.me.defaultPaidBy && profile.mutate({ default_paid_by: v })}
          options={[
            { value: 'me', label: 'Mig' },
            { value: 'shared', label: 'Fælles' },
          ]}
        />
        <p className="mt-1.5 px-1 text-[13px] text-secondary">
          Gælder kun dig. Du kan altid vælge noget andet.
          {profile.isSuccess && profile.variables?.default_paid_by && <span className="font-semibold text-positive"> Gemt</span>}
        </p>
      </div>

      <BottomSheet open={sheet === 'password'} onClose={() => setSheet(null)} title="Adgangskode">
        {sheet === 'password' && <PasswordForm onDone={() => setSheet(null)} />}
      </BottomSheet>
    </>
  )
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const change = useChangePassword()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const error = password.length > 0 && password.length < 8 ? 'Mindst 8 tegn' : password2.length > 0 && password !== password2 ? 'Adgangskoderne er ikke ens' : null
  const valid = password.length >= 8 && password === password2

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      await change.mutateAsync(password)
    } catch {
      // vises nedenfor
    }
  }

  if (change.isSuccess)
    return (
      <>
        <p className="text-[15px] text-secondary">Din adgangskode er ændret. Brug den næste gang du logger ind.</p>
        <Button block className="mt-5" onClick={onDone}>
          OK
        </Button>
      </>
    )

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Ny adgangskode">
        <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <Field label="Gentag adgangskode" error={error}>
        <TextInput type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
      </Field>
      {change.isError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{authErrorMessage(change.error as { status?: number; code?: string; message?: string })}</p>}
      <Button type="submit" block disabled={!valid} loading={change.isPending}>
        Gem ny adgangskode
      </Button>
    </form>
  )
}
