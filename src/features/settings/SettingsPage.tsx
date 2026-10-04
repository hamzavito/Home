import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SectionTitle } from '@/components/ui/Card'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/AuthProvider'
import { householdQueryKey, useHousehold } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'

const themes: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Lyst', icon: Sun },
  { value: 'dark', label: 'Mørkt', icon: Moon },
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

      <SectionTitle>Min profil</SectionTitle>
      <div className="rounded-card bg-surface-strong p-4 shadow-card">
        <label className="block text-[13px] text-text-secondary" htmlFor="display-name">
          Visningsnavn
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="display-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl bg-fill px-3 text-text outline-none focus:ring-2 focus:ring-accent"
          />
          <Button className="h-11" disabled={!nameChanged} loading={saveName.isPending} onClick={() => saveName.mutate(trimmed)}>
            Gem
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-text-tertiary">{session?.user.email}</p>
        {saveName.isError && <p className="mt-2 text-[13px] text-danger">Navnet kunne ikke gemmes.</p>}
      </div>

      <SectionTitle>Husstand</SectionTitle>
      <ListGroup>
        <ListRow title={household.name} subtitle={`${household.members.length} medlemmer`} />
        {household.members.map((m, i) => (
          <div key={m.userId} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
            <Avatar name={m.displayName} color={m.color} index={i} />
            <span className="flex-1 text-[17px]">
              {m.displayName}
              {m.isMe && <span className="text-text-secondary"> (dig)</span>}
            </span>
          </div>
        ))}
      </ListGroup>

      <SectionTitle>Udseende</SectionTitle>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-2xl bg-fill p-1">
        {themes.map((t) => (
          <button
            key={t.value}
            role="radio"
            aria-checked={theme === t.value}
            type="button"
            onClick={() => {
              setTheme(t.value)
              applyTheme(t.value)
            }}
            className={cn(
              'flex h-10 items-center justify-center gap-1.5 rounded-xl text-[15px] font-medium transition',
              theme === t.value ? 'bg-surface-strong shadow-card' : 'text-text-secondary',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      <ListGroup className="mt-8">
        <ListRow icon={LogOut} iconColor="var(--danger)" title="Log ud" onClick={signOut} />
      </ListGroup>

      <p className="mt-6 text-center text-[12px] text-text-tertiary">Hjem {__APP_VERSION__}</p>
    </>
  )
}
