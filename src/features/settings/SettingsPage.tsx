import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/AuthProvider'
import { householdQueryKey, useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'

const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Lyst' },
  { value: 'dark', label: 'Mørkt' },
]

export function SettingsPage() {
  const household = useHousehold()
  const { session, signOut } = useAuth()
  const queryClient = useQueryClient()
  const [theme, setTheme] = useState(getThemePreference)
  const [name, setName] = useState(household.me.displayName)

  const saveName = useMutation({
    mutationFn: async (displayName: string) => {
      const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', household.me.userId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdQueryKey(session?.user.id) }),
  })

  const trimmed = name.trim()
  const nameChanged = trimmed !== household.me.displayName && trimmed.length > 0 && trimmed.length <= 40

  return (
    <>
      <PageHeader title="Indstillinger" back />

      <SectionHeader title="Min profil" />
      <div className="rounded-card bg-surface-1 p-5 shadow-card">
        <label className="block text-[13px] text-text-secondary" htmlFor="display-name">
          Visningsnavn
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="display-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-2xl bg-surface-2 px-4 text-text outline-none focus:ring-2 focus:ring-accent"
          />
          <Button size="sm" className="h-11" disabled={!nameChanged} loading={saveName.isPending} onClick={() => saveName.mutate(trimmed)}>
            Gem
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-text-tertiary">{session?.user.email}</p>
        {saveName.isError && <p className="mt-2 text-[13px] text-danger">Navnet kunne ikke gemmes.</p>}
      </div>

      <SectionHeader title="Husstand" />
      <ListGroup>
        <ListRow title={household.name} subtitle={`${household.members.length} medlemmer`} />
        {household.members.map((m, i) => (
          <div key={m.userId} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
            <Avatar name={m.displayName} color={m.color} index={i} />
            <span className="flex-1 text-[16px] font-medium">
              {m.displayName}
              {m.isMe && <span className="text-text-secondary"> (dig)</span>}
            </span>
          </div>
        ))}
      </ListGroup>

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

      <ListGroup className="mt-8">
        <ListRow icon={LogOut} iconColor="var(--danger)" title="Log ud" tone="danger" onClick={signOut} />
      </ListGroup>

      <p className="mt-6 text-center text-[12px] text-text-tertiary">Hjem {__APP_VERSION__}</p>
    </>
  )
}
