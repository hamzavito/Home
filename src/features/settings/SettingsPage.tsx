import { ChevronRight, Download, KeyRound, Lock, LogOut, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
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
import { cn } from '@/lib/cn'
import { retentionOptions } from '@/lib/retention'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'
import type { DefaultPaidBy, DefaultRetention } from '@/types/database'
import { LoginCodeCard } from './ChildLogin'
import { AccountDanger, InviteRows } from './HouseholdAccess'
import { SubscriptionRow } from '@/features/billing/SubscriptionRow'
import { roleLabels } from './MemberPage'
import { NotificationSettings } from './NotificationSettings'
import { useChangePassword, useExportData, useUpdateProfile, useUpdateRetentionDefault } from './api'

const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Lyst' },
  { value: 'dark', label: 'Mørkt' },
]

const retentionChoices = retentionOptions.filter((o) => o.value !== 'custom') as Array<{ value: DefaultRetention; label: string }>

export function SettingsPage() {
  const household = useHousehold()
  const { session, signOut } = useAuth()
  const [theme, setTheme] = useState(getThemePreference)
  const [name, setName] = useState(household.me.displayName)
  const [sheet, setSheet] = useState<'password' | 'logout' | null>(null)
  const profile = useUpdateProfile()
  const retention = useUpdateRetentionDefault()
  const exportData = useExportData()

  const trimmed = name.trim()
  const nameChanged = trimmed !== household.me.displayName && trimmed.length > 0 && trimmed.length <= 40
  const shownPaidBy = profile.isPending && profile.variables?.default_paid_by ? profile.variables.default_paid_by : household.me.defaultPaidBy
  const shownRetention = retention.isPending && retention.variables ? retention.variables : household.defaultRetention

  return (
    <>
      <PageHeader title="Indstillinger" back="/mere" />

      <SectionHeader title="Min profil" />
      <div className="rounded-card bg-surface-primary p-5 shadow-card">
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

      <SectionHeader title="Standardvalg" />
      <div className="space-y-5 rounded-card bg-surface-primary p-5 shadow-card">
        <div>
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
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">Gem kvitteringsbilleder i</p>
          <div role="radiogroup" aria-label="Gem kvitteringsbilleder i" className="flex flex-wrap gap-2">
            {retentionChoices.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={shownRetention === o.value}
                onClick={() => o.value !== household.defaultRetention && retention.mutate(o.value)}
                className={cn(
                  'pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors',
                  shownRetention === o.value ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[13px] text-secondary">Gælder nye kvitteringer for hele husstanden. Eksisterende kvitteringer ændres ikke, og udgifterne bevares altid.
            {retention.isSuccess && <span className="font-semibold text-positive"> Gemt</span>}
          </p>
          {retention.isError && <p className="mt-1 px-1 text-[13px] text-danger">Det kunne ikke gemmes. Prøv igen.</p>}
        </div>
      </div>
      <ListGroup className="mt-3">
        <ListRow icon={Lock} iconColor="var(--text-secondary)" title="Valuta" subtitle="Alle beløb er i danske kroner" trailing={<span className="text-[15px] font-semibold text-secondary">DKK</span>} />
      </ListGroup>

      <NotificationSettings />

      <SectionHeader title="Husstand" />
      <ListGroup>
        <ListRow title={household.name} subtitle={`${household.members.length} ${household.members.length === 1 ? 'medlem' : 'medlemmer'}`} />
        {household.members.map((m, i) => (
          <Link key={m.userId} to={`/indstillinger/medlem/${m.userId}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors active:bg-surface-secondary">
            <Avatar name={m.displayName} color={m.color} index={i} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[16px] font-medium">
                {m.displayName}
                {m.isMe && <span className="text-secondary"> (dig)</span>}
              </span>
              <span className="text-[13px] text-secondary">
                {roleLabels[m.role]}
                {m.disabled && ' · login slået fra'}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" />
          </Link>
        ))}
        <SubscriptionRow />
        <InviteRows />
        {household.me.role === 'owner' && <ListRow icon={UserPlus} title="Tilføj barn" subtitle="Eget login med brugernavn og PIN" to="/indstillinger/barn/ny" />}
      </ListGroup>

      {household.me.role === 'owner' && <LoginCodeCard />}

      <SectionHeader title="Udseende" />
      <SegmentedControl
        label="Tema"
        options={themes}
        value={theme}
        onChange={(v) => {
          setTheme(v)
          applyTheme(v)
        }}
      />

      <SectionHeader title="Data" />
      <ListGroup>
        <ListRow icon={Download} title="Eksportér data" subtitle="Alle jeres data som JSON-fil" onClick={() => exportData.mutate()} trailing={exportData.isPending ? <span className="text-[13px] text-secondary">Henter …</span> : undefined} />
      </ListGroup>
      <p className="mt-2 px-1 text-[13px] text-secondary">
        {exportData.isSuccess ? 'Eksporten er klar.' : exportData.isError ? 'Eksporten mislykkedes. Prøv igen.' : 'Kvitteringsbilleder er ikke med. Gem filen et sikkert sted – den indeholder jeres økonomi.'}
      </p>

      <SectionHeader title="Konto" />
      <AccountDanger />

      <ListGroup className="mt-8">
        <ListRow icon={LogOut} iconColor="var(--danger)" title="Log ud" tone="danger" onClick={() => setSheet('logout')} />
      </ListGroup>

      <p className="mt-6 text-center text-[12px] text-secondary">Hjem {__APP_VERSION__}</p>

      <BottomSheet open={sheet === 'password'} onClose={() => setSheet(null)} title="Adgangskode">
        {sheet === 'password' && <PasswordForm onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === 'logout'} onClose={() => setSheet(null)} title="Log ud?">
        <p className="text-[15px] text-secondary">Du logges kun ud på denne enhed. Data på enheden fjernes.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            Annullér
          </Button>
          <Button variant="danger" onClick={() => void signOut()}>
            Log ud
          </Button>
        </div>
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
