import { CalendarDays, CheckSquare, ChefHat, LogOut, PiggyBank, Plus, ShoppingBag, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { EventRow } from '@/features/calendar/EventRow'
import { useEvents, useTasks, type CalendarEvent, type Task } from '@/features/home/api'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { useWeek } from '@/features/mealplan/api'
import { NotificationSettings } from '@/features/settings/NotificationSettings'
import { cn } from '@/lib/cn'
import { dayLabel, greeting, monthKey, toIsoDate } from '@/lib/dates'
import { addDaysIso, compareEvents, eventCovers } from '@/lib/home'
import { formatAmount } from '@/lib/money'
import { weekStart } from '@/lib/recipes'
import { applyTheme, getThemePreference, type ThemePreference } from '@/lib/theme'
import { goalPercent, goalSaved, walletBalance, walletMonth } from '@/lib/wallet'
import { useAddWalletTx, useCreateChildGoal, useUpdateChildGoal, useWallet, walletErrorMessage, type ChildGoal } from './api'
import { ChildTaskRow } from './ChildTaskRow'
import { AmountForm, ChildGoalCard, GoalForm, WalletTxRow } from './WalletParts'

// ------------------------------------------------------------------ data
/** Barnets egne opgaver (databasen viser kun dem – filtret her er en ekstra sikring) */
function useMyTasks() {
  const { me } = useHousehold()
  const tasks = useTasks()
  const mine = (list: Task[] | undefined) => (list ?? []).filter((t) => t.assignee_id === me.userId)
  return { isPending: tasks.isPending, active: mine(tasks.data?.active), done: mine(tasks.data?.done) }
}

/** Fælles aftaler og aftaler barnet deltager i */
function useMyEvents(from: string, to: string) {
  const { me } = useHousehold()
  const events = useEvents(from, to)
  const visible = (e: CalendarEvent) => e.participant_ids.length === 0 || e.participant_ids.includes(me.userId)
  return { isPending: events.isPending, data: (events.data ?? []).filter(visible).sort(compareEvents) }
}

/** Aftensmaden i dag (fra madplanen) */
function useTonight() {
  const today = toIsoDate(new Date())
  const week = useWeek(weekStart(today))
  return { isPending: week.isPending, entries: (week.data ?? []).filter((e) => e.plan_date === today) }
}

const firstName = (name: string) => name.split(/\s+/)[0] ?? name

// ------------------------------------------------------------------ Hjem
export function ChildHome() {
  const { me } = useHousehold()
  const now = new Date()
  const today = toIsoDate(now)
  const tonight = useTonight()
  const tasks = useMyTasks()
  const events = useMyEvents(today, today)
  const wallet = useWallet(me.userId)
  const txs = wallet.data?.transactions ?? []
  const goals = (wallet.data?.goals ?? []).filter((g) => !g.archived_at)
  const topGoal = goals.map((g) => ({ g, saved: goalSaved(txs, g.id) })).sort((a, b) => goalPercent(b.saved, b.g.target_ore) - goalPercent(a.saved, a.g.target_ore))[0]
  const todayEvents = events.data.filter((e) => eventCovers(e, today))
  const left = tasks.active.length

  return (
    <>
      <header className="pb-4 pt-4">
        <p className="text-[15px] font-medium text-secondary">{greeting(now)}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em]">{firstName(me.displayName)}</h1>
      </header>

      <SectionHeader title="I aften" />
      {tonight.isPending ? (
        <Skeleton className="h-20 rounded-card" />
      ) : tonight.entries.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={ChefHat} title="Ingen aftensmad planlagt endnu" />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {tonight.entries.map((e) => (
            <DinnerRow key={e.id} title={e.title} recipeId={e.recipe_id} />
          ))}
        </Card>
      )}

      <SectionHeader title="Mine opgaver" to="/opgaver" linkLabel={tasks.isPending ? undefined : `${left} tilbage`} />
      {tasks.isPending ? (
        <Skeleton className="h-24 rounded-card" />
      ) : left === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CheckSquare} title="Du er færdig med alt" text="Godt gået!" />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {tasks.active.slice(0, 3).map((t) => (
            <ChildTaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}

      <SectionHeader title="I dag" to="/kalender" linkLabel="Kalender" />
      {events.isPending ? (
        <Skeleton className="h-16 rounded-card" />
      ) : todayEvents.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CalendarDays} title="Ingen aftaler i dag" />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {todayEvents.map((e) => (
            <EventRow key={e.id} e={e} linkTo={null} />
          ))}
        </Card>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link to="/penge" className="pressable block rounded-card bg-surface-primary p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-secondary">
            <Wallet className="size-4" /> Mine penge
          </p>
          {wallet.isPending ? <Skeleton className="mt-2 h-7 w-24" /> : <Money ore={walletBalance(txs)} size="lg" className="mt-1 block" />}
        </Link>
        <Link to="/penge" className="pressable block rounded-card bg-surface-primary p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-secondary">
            <PiggyBank className="size-4" /> Opsparing
          </p>
          {wallet.isPending ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : topGoal ? (
            <>
              <p className="tabular mt-1 text-[22px] font-bold leading-tight text-positive">{goalPercent(topGoal.saved, topGoal.g.target_ore)} %</p>
              <p className="truncate text-[13px] text-secondary">{topGoal.g.name}</p>
            </>
          ) : (
            <p className="mt-1 text-[14px] text-secondary">Intet mål endnu</p>
          )}
        </Link>
      </div>
    </>
  )
}

function DinnerRow({ title, recipeId }: { title: string; recipeId: string | null }) {
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-notice-soft text-notice">
        <ChefHat className="size-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1 break-words text-[17px] font-semibold">{title}</span>
    </>
  )
  if (!recipeId) return <div className="flex items-center gap-3 px-4 py-3">{content}</div>
  return (
    <Link to={`/aftensmad/${recipeId}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-secondary">
      {content}
    </Link>
  )
}

// ------------------------------------------------------------------ Opgaver
export function ChildTasks() {
  const tasks = useMyTasks()
  return (
    <>
      <PageHeader title="Mine opgaver" eyebrow={tasks.isPending ? undefined : `${tasks.active.length} tilbage`} />
      {tasks.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : tasks.active.length === 0 ? (
        <Card variant="tonal">
          <EmptyState icon={CheckSquare} title="Ingen opgaver" text="Når du får en opgave, står den her." />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {tasks.active.map((t) => (
            <ChildTaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}
      {tasks.done.length > 0 && (
        <>
          <SectionHeader title="Færdige" />
          <Card padded={false} className="divide-y divide-subtle">
            {tasks.done.map((t) => (
              <ChildTaskRow key={t.id} task={t} />
            ))}
          </Card>
        </>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Kalender
export function ChildCalendar() {
  const today = toIsoDate(new Date())
  const end = addDaysIso(today, 30)
  const events = useMyEvents(today, end)
  // Hver aftale vises én gang: på sin dato, eller i dag hvis den allerede er i gang
  const groups = new Map<string, CalendarEvent[]>()
  for (const e of events.data) {
    const day = e.event_date < today ? today : e.event_date
    groups.set(day, [...(groups.get(day) ?? []), e])
  }
  const days = [...groups.keys()].sort()
  return (
    <>
      <PageHeader title="Kalender" eyebrow="De næste 30 dage" />
      {events.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : days.length === 0 ? (
        <Card variant="tonal">
          <EmptyState icon={CalendarDays} title="Ingen aftaler" text="Fælles aftaler og dine egne aftaler står her." />
        </Card>
      ) : (
        days.map((d) => (
          <section key={d} aria-label={dayLabel(d)}>
            <h2 className="mb-2 mt-5 px-1 text-[15px] font-bold first-letter:uppercase">{dayLabel(d)}</h2>
            <Card padded={false} className="divide-y divide-subtle">
              {groups.get(d)!.map((e) => (
                <EventRow key={e.id} e={e} linkTo={null} />
              ))}
            </Card>
          </section>
        ))
      )}
    </>
  )
}

// ------------------------------------------------------------------ Penge
export type MoneySheet = { kind: 'purchase' } | { kind: 'new-goal' } | { kind: 'goal'; goal: ChildGoal } | { kind: 'to-goal'; goal: ChildGoal } | { kind: 'from-goal'; goal: ChildGoal } | null

export function ChildMoney() {
  const { me } = useHousehold()
  const wallet = useWallet(me.userId)
  const add = useAddWalletTx()
  const createGoal = useCreateChildGoal()
  const [sheet, setSheet] = useState<MoneySheet>(null)
  const txs = wallet.data?.transactions ?? []
  const allGoals = wallet.data?.goals ?? []
  const goals = allGoals.filter((g) => !g.archived_at)
  const balance = walletBalance(txs)
  const month = walletMonth(txs, monthKey(new Date()))

  function close() {
    setSheet(null)
    add.reset()
    createGoal.reset()
  }

  return (
    <>
      <PageHeader title="Mine penge" />
      <div className="rounded-card-lg bg-surface-inverse p-5 text-on-inverse shadow-raised">
        <p className="text-[14px] font-semibold">Min saldo</p>
        {wallet.isPending ? <Skeleton className="mt-2 h-11 w-36" /> : <Money ore={balance} size="hero" className="mt-1 block" />}
        <p className="tabular mt-3 text-[14px]">
          Denne måned: +{formatAmount(month.inOre)} kr. ind · −{formatAmount(month.outOre)} kr. brugt
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="surface" onClick={() => setSheet({ kind: 'purchase' })} disabled={wallet.isPending}>
          <ShoppingBag className="size-4.5" /> Jeg har købt
        </Button>
        <Button variant="surface" onClick={() => setSheet({ kind: 'new-goal' })}>
          <Plus className="size-4.5" strokeWidth={2.5} /> Nyt mål
        </Button>
      </div>

      <SectionHeader title="Opsparing" />
      {goals.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={PiggyBank} title="Ingen mål endnu" text="Spar op til noget, du gerne vil have." />
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <ChildGoalCard key={g.id} goal={g} savedOre={goalSaved(txs, g.id)} onClick={() => setSheet({ kind: 'goal', goal: g })} />
          ))}
        </div>
      )}

      <SectionHeader title="Bevægelser" />
      {wallet.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : txs.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Wallet} title="Ingen bevægelser endnu" text="Når du får lommepenge eller køber noget, står det her." />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {txs.slice(0, 40).map((t) => (
            <WalletTxRow key={t.id} tx={t} goals={allGoals} />
          ))}
        </Card>
      )}

      <BottomSheet open={sheet?.kind === 'purchase'} onClose={close} title="Hvad har du købt?">
        {sheet?.kind === 'purchase' && (
          <AmountForm
            submitLabel="Gem køb"
            notePlaceholder="Fx slik eller bog"
            maxOre={balance}
            pending={add.isPending}
            error={add.isError ? walletErrorMessage(add.error) : null}
            onSubmit={(ore, note) => add.mutate({ childId: me.userId, kind: 'purchase', amountOre: ore, note }, { onSuccess: close })}
          />
        )}
      </BottomSheet>
      <BottomSheet open={sheet?.kind === 'new-goal'} onClose={close} title="Nyt opsparingsmål">
        {sheet?.kind === 'new-goal' && (
          <GoalForm
            pending={createGoal.isPending}
            error={createGoal.isError ? walletErrorMessage(createGoal.error) : null}
            onSubmit={(name, targetOre) => createGoal.mutate({ childId: me.userId, name, targetOre }, { onSuccess: close })}
          />
        )}
      </BottomSheet>
      <GoalSheets sheet={sheet} setSheet={setSheet} close={close} childId={me.userId} balance={balance} txs={txs} />
    </>
  )
}

/** Ark for ét mål: sæt penge til side, tag penge fra og afslut. Bruges af både barn og forældre. */
export function GoalSheets({
  sheet,
  setSheet,
  close,
  childId,
  balance,
  txs,
}: {
  sheet: MoneySheet
  setSheet: (s: MoneySheet) => void
  close: () => void
  childId: string
  balance: number
  txs: Parameters<typeof goalSaved>[0]
}) {
  const add = useAddWalletTx()
  const updateGoal = useUpdateChildGoal()
  const s = sheet
  const goal = s && 'goal' in s ? s.goal : null
  const saved = goal ? goalSaved(txs, goal.id) : 0
  const done = () => {
    add.reset()
    updateGoal.reset()
    close()
  }
  return (
    <>
      {/* Ét ark med skiftende indhold – to dialoger efter hinanden ville lukke hinanden */}
      <BottomSheet
        open={goal !== null}
        onClose={done}
        title={!goal ? undefined : s?.kind === 'to-goal' ? `Sæt til side: ${goal.name}` : s?.kind === 'from-goal' ? `Tag fra: ${goal.name}` : goal.name}
      >
        {goal && s?.kind === 'goal' && (
          <div className="space-y-3">
            <ChildGoalCard goal={goal} savedOre={saved} />
            <Button block onClick={() => setSheet({ kind: 'to-goal', goal })} disabled={balance <= 0}>
              Sæt penge til side
            </Button>
            <Button block variant="secondary" onClick={() => setSheet({ kind: 'from-goal', goal })} disabled={saved <= 0}>
              Tag penge fra målet
            </Button>
            <Button block variant="danger" loading={updateGoal.isPending} onClick={() => updateGoal.mutate({ goalId: goal.id, archive: true }, { onSuccess: done })}>
              Afslut mål
            </Button>
            <p className="px-1 text-[13px] text-secondary">Når et mål afsluttes, kommer pengene tilbage på saldoen.</p>
            {updateGoal.isError && <p className="text-[13px] text-danger">{walletErrorMessage(updateGoal.error)}</p>}
          </div>
        )}
        {goal && s?.kind === 'to-goal' && (
          <AmountForm
            key="to"
            withNote={false}
            submitLabel="Sæt til side"
            maxOre={balance}
            pending={add.isPending}
            error={add.isError ? walletErrorMessage(add.error) : null}
            onSubmit={(ore) => add.mutate({ childId, kind: 'to_goal', amountOre: ore, goalId: goal.id }, { onSuccess: done })}
          >
            <p className="text-[14px] text-secondary">Der er {formatAmount(balance)} kr. på saldoen.</p>
          </AmountForm>
        )}
        {goal && s?.kind === 'from-goal' && (
          <AmountForm
            key="from"
            withNote={false}
            submitLabel="Flyt til saldoen"
            maxOre={saved}
            pending={add.isPending}
            error={add.isError ? walletErrorMessage(add.error) : null}
            onSubmit={(ore) => add.mutate({ childId, kind: 'from_goal', amountOre: ore, goalId: goal.id }, { onSuccess: done })}
          >
            <p className="text-[14px] text-secondary">Der er {formatAmount(saved)} kr. på målet.</p>
          </AmountForm>
        )}
      </BottomSheet>
    </>
  )
}

// ------------------------------------------------------------------ Mere
const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Lyst' },
  { value: 'dark', label: 'Mørkt' },
]

export function ChildMore() {
  const { me, name } = useHousehold()
  const { session, signOut } = useAuth()
  const [theme, setTheme] = useState(getThemePreference)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <PageHeader title="Mere" />
      <ListGroup>
        <ListRow title={me.displayName} subtitle={session?.user.email ?? name} />
      </ListGroup>

      <NotificationSettings shopping={false} />

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
        <ListRow icon={LogOut} iconColor="var(--danger)" title="Log ud" tone="danger" onClick={() => setConfirm(true)} />
      </ListGroup>
      <p className={cn('mt-6 text-center text-[12px] text-secondary')}>Hjem {__APP_VERSION__}</p>

      <BottomSheet open={confirm} onClose={() => setConfirm(false)} title="Log ud?">
        <p className="text-[15px] text-secondary">Du logges kun ud på denne enhed.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
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
