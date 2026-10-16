import { Bell, ChevronRight, Download, Landmark, Lock, LogOut, Palette, Receipt, Send, UserPlus, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useAuth } from '@/features/auth/AuthProvider'
import { SubscriptionRow } from '@/features/billing/SubscriptionRow'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { describeFamily } from '@/lib/family'
import { retentionOptions } from '@/lib/retention'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'
import { LoginCodeRow } from './ChildLogin'
import { AccountDanger, InviteRows } from './HouseholdAccess'
import { roleLabels } from './MemberPage'
import { useFamilyComposition } from './family'
import { useExportData } from './api'

export const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Lyst' },
  { value: 'dark', label: 'Mørkt' },
]

/**
 * Indstillinger: ét overblik med ens rækker i faste grupper –
 * Mig · Husstand · Økonomi · App · Konto. Detaljerne ligger på undersider.
 */
export function SettingsPage() {
  const household = useHousehold()
  const { session, signOut } = useAuth()
  const [theme, setTheme] = useState(getThemePreference)
  const [sheet, setSheet] = useState<'theme' | 'logout' | null>(null)
  const exportData = useExportData()
  const composition = useFamilyComposition()
  const retention = retentionOptions.find((o) => o.value === household.defaultRetention)?.label ?? ''
  const isOwner = household.me.role === 'owner'

  return (
    <>
      <PageHeader title="Indstillinger" back="/mere" />

      <SectionHeader title="Mig" />
      <ListGroup>
        <ListRow icon={UserRound} title="Min profil" subtitle={[household.me.displayName, session?.user.email].filter(Boolean).join(' · ')} to="/indstillinger/profil" />
        <ListRow icon={Bell} title="Notifikationer" subtitle="På denne telefon og hvad du får besked om" to="/indstillinger/notifikationer" />
      </ListGroup>

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
      </ListGroup>
      <ListGroup className="mt-3">
        <InviteRows icon={Send} />
        {isOwner && <ListRow icon={UserPlus} title="Tilføj barn" subtitle="Med eget login eller uden (små børn)" to="/indstillinger/barn/ny" />}
        {isOwner && <LoginCodeRow />}
        <ListRow icon={Users} title="Familieoplysninger" subtitle={composition ? describeFamily(composition) : 'Voksne, børn og deres alder'} to="/indstillinger/familie" />
        <SubscriptionRow />
      </ListGroup>

      <SectionHeader title="Økonomi" />
      <ListGroup>
        <ListRow icon={Landmark} title="Bank" subtitle="Hent dine udgifter og indtægter automatisk" to="/indstillinger/bank" />
        <ListRow icon={Receipt} title="Kvitteringer" subtitle={`Gem billeder i ${retention.toLowerCase()}`} to="/indstillinger/kvitteringer" />
        <ListRow icon={Lock} iconColor="var(--text-secondary)" title="Valuta" subtitle="Alle beløb er i danske kroner" trailing={<span className="text-[15px] font-semibold text-secondary">DKK</span>} />
      </ListGroup>

      <SectionHeader title="App" />
      <ListGroup>
        <ListRow icon={Palette} title="Udseende" subtitle={themes.find((t) => t.value === theme)?.label} onClick={() => setSheet('theme')} />
        <ListRow
          icon={Download}
          title="Eksportér data"
          subtitle={exportData.isSuccess ? 'Eksporten er klar' : exportData.isError ? 'Eksporten mislykkedes. Prøv igen.' : 'Alle jeres data som JSON-fil'}
          onClick={() => exportData.mutate()}
          trailing={exportData.isPending ? <span className="text-[13px] text-secondary">Henter …</span> : undefined}
        />
      </ListGroup>
      <p className="mt-2 px-1 text-[13px] text-secondary">Kvitteringsbilleder er ikke med i eksporten. Gem filen et sikkert sted – den indeholder jeres økonomi.</p>

      <SectionHeader title="Konto" />
      <AccountDanger extra={<ListRow icon={LogOut} iconColor="var(--danger)" title="Log ud" tone="danger" onClick={() => setSheet('logout')} />} />

      <p className="mt-6 text-center text-[12px] text-secondary">
        Hjem {__APP_VERSION__} · <Link to="/privatliv" className="underline">Privatliv</Link> · <Link to="/vilkaar" className="underline">Vilkår</Link>
      </p>

      <BottomSheet open={sheet === 'theme'} onClose={() => setSheet(null)} title="Udseende">
        <SegmentedControl
          label="Tema"
          options={themes}
          value={theme}
          onChange={(v) => {
            setTheme(v)
            applyTheme(v)
          }}
        />
        <p className="mt-3 text-[14px] text-secondary">System følger telefonens indstilling.</p>
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
