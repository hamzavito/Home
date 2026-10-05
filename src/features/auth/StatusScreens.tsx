import { CloudOff, KeyRound, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from './AuthProvider'

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-safe pb-safe pt-safe">{children}</div>
}

export function ConfigMissingScreen() {
  return (
    <Centered>
      <EmptyState
        icon={KeyRound}
        title="Appen mangler konfiguration"
        text="VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY er ikke sat. Tilføj dem i Vercel (eller .env.local lokalt) og deploy igen."
      />
    </Centered>
  )
}

export function NoHouseholdScreen() {
  const { signOut, session } = useAuth()
  return (
    <Centered>
      <EmptyState
        icon={Users}
        title="Ingen husstand"
        text={`Kontoen ${session?.user.email ?? ''} er ikke tilknyttet en husstand endnu. Kør opsætningsscriptet i Supabase.`}
      >
        <Button variant="secondary" onClick={signOut}>
          Log ud
        </Button>
      </EmptyState>
    </Centered>
  )
}

export function LoadErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { signOut } = useAuth()
  return (
    <Centered>
      <EmptyState icon={CloudOff} title="Kunne ikke hente data" text="Tjek din internetforbindelse og prøv igen.">
        <div className="flex gap-3">
          <Button onClick={onRetry}>Prøv igen</Button>
          <Button variant="secondary" onClick={signOut}>
            Log ud
          </Button>
        </div>
      </EmptyState>
    </Centered>
  )
}
