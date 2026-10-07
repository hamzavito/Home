import { CalendarPlus, CheckSquare, ListPlus, PiggyBank, Plus, Undo2, UserRound, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useAddWalletTx, useCreateChildGoal, useSetMemberRole, useVoidWalletTx, useWallet, walletErrorMessage, type WalletTransaction } from '@/features/child/api'
import { GoalSheets, type MoneySheet } from '@/features/child/ChildPages'
import { AmountForm, ChildGoalCard, GoalForm, WalletTxRow } from '@/features/child/WalletParts'
import { useTasks } from '@/features/home/api'
import { TaskRow } from '@/features/home/TaskRow'
import { useHousehold, type HouseholdMember } from '@/features/household/HouseholdProvider'
import { cn } from '@/lib/cn'
import { monthKey } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { goalSaved, walletBalance, walletKindLabels, walletMonth } from '@/lib/wallet'
import type { WalletKind } from '@/types/database'

/** Ejefald: "Noahs", men "Jonas'" */
export const genitive = (name: string) => (/[sxz]$/i.test(name) ? `${name}'` : `${name}s`)

export const roleLabels: Record<string, string> = { owner: 'Ejer', adult: 'Voksen', member: 'Voksen', child: 'Barn' }

/** Et medlem af husstanden. Ejere kan skifte rolle; for børn styres lommepenge, mål, opgaver og aftaler. */
export function MemberPage() {
  const { id } = useParams()
  const household = useHousehold()
  const member = household.members.find((m) => m.userId === id)
  if (!member)
    return (
      <>
        <PageHeader title="Medlem" back="/indstillinger" />
        <EmptyState icon={UserRound} title="Medlemmet findes ikke" />
      </>
    )
  const index = household.members.indexOf(member)
  return (
    <>
      <PageHeader title={member.displayName} eyebrow={roleLabels[member.role]} back="/indstillinger" />
      <div className="flex items-center gap-3 rounded-card bg-surface-primary p-4 shadow-card">
        <Avatar name={member.displayName} color={member.color} index={index} className="size-12 text-[17px]" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">
            {member.displayName}
            {member.isMe && <span className="text-secondary"> (dig)</span>}
          </p>
          <p className="text-[14px] text-secondary">{roleLabels[member.role]}</p>
        </div>
      </div>
      {household.me.role === 'owner' && !member.isMe && <RoleEditor member={member} />}
      {member.isChild && <ChildControls child={member} />}
    </>
  )
}

const roleOptions = [
  { value: 'adult', label: 'Voksen', hint: 'Ser og styrer hele husstanden, også økonomien.' },
  { value: 'owner', label: 'Ejer', hint: 'Som voksen, og kan også ændre andres roller.' },
  { value: 'child', label: 'Barn', hint: 'Ser kun aftensmad, egne opgaver, egne og fælles aftaler og egne lommepenge.' },
] as const

function RoleEditor({ member }: { member: HouseholdMember }) {
  const setRole = useSetMemberRole()
  const current = member.role === 'member' ? 'adult' : member.role
  const [role, setLocalRole] = useState<(typeof roleOptions)[number]['value']>(current)
  return (
    <>
      <SectionHeader title="Rolle" />
      <div className="rounded-card bg-surface-primary p-5 shadow-card">
        <div role="radiogroup" aria-label="Rolle" className="flex flex-wrap gap-2">
          {roleOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={role === o.value}
              onClick={() => setLocalRole(o.value)}
              className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', role === o.value ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[13px] text-secondary">{roleOptions.find((o) => o.value === role)?.hint}</p>
        <Button className="mt-4" block disabled={role === current} loading={setRole.isPending} onClick={() => setRole.mutate({ userId: member.userId, role })}>
          Gem rolle
        </Button>
        {setRole.isError && <p className="mt-2 px-1 text-[13px] text-danger">Rollen kunne ikke ændres. Prøv igen.</p>}
        {setRole.isSuccess && role === current && <p className="mt-2 px-1 text-[13px] font-semibold text-positive">Gemt</p>}
      </div>
    </>
  )
}

const giveKinds: Array<{ value: WalletKind; label: string }> = [
  { value: 'allowance', label: walletKindLabels.allowance },
  { value: 'deposit', label: walletKindLabels.deposit },
  { value: 'deduction', label: walletKindLabels.deduction },
  { value: 'purchase', label: walletKindLabels.purchase },
]

type ParentSheet = MoneySheet | { kind: 'give' } | { kind: 'void'; tx: WalletTransaction }

function ChildControls({ child }: { child: HouseholdMember }) {
  const navigate = useNavigate()
  const wallet = useWallet(child.userId)
  const tasks = useTasks()
  const add = useAddWalletTx()
  const voidTx = useVoidWalletTx()
  const createGoal = useCreateChildGoal()
  const [sheet, setSheet] = useState<ParentSheet>(null)
  const [kind, setKind] = useState<WalletKind>('allowance')
  const txs = wallet.data?.transactions ?? []
  const allGoals = wallet.data?.goals ?? []
  const goals = allGoals.filter((g) => !g.archived_at)
  const balance = walletBalance(txs)
  const month = walletMonth(txs, monthKey(new Date()))
  const childTasks = (tasks.data?.active ?? []).filter((t) => t.assignee_id === child.userId)
  const name = child.displayName
  const names = genitive(name)

  function close() {
    setSheet(null)
    add.reset()
    voidTx.reset()
    createGoal.reset()
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="surface" onClick={() => navigate(`/hjemmet/ny?ansvarlig=${child.userId}`)}>
          <ListPlus className="size-4.5" /> Tildel opgave
        </Button>
        <Button variant="surface" onClick={() => navigate(`/hjemmet/kalender/ny?deltager=${child.userId}`)}>
          <CalendarPlus className="size-4.5" /> Ny aftale
        </Button>
      </div>

      <SectionHeader title="Lommepenge" />
      <div className="rounded-card-lg bg-surface-inverse p-5 text-on-inverse shadow-raised">
        <p className="text-[14px] font-semibold">{names} saldo</p>
        {wallet.isPending ? <Skeleton className="mt-2 h-11 w-36" /> : <Money ore={balance} size="hero" className="mt-1 block" />}
        <p className="tabular mt-3 text-[14px]">
          Denne måned: +{formatAmount(month.inOre)} kr. ind · −{formatAmount(month.outOre)} kr. brugt
        </p>
      </div>
      <p className="mt-2 px-1 text-[13px] text-secondary">Lommepenge er helt adskilt fra familiens budgetter og udgifter.</p>
      <Button block className="mt-3" onClick={() => setSheet({ kind: 'give' })} disabled={wallet.isPending}>
        <Wallet className="size-5" /> Giv eller træk penge
      </Button>

      <SectionHeader title={`${names} opsparing`} action={<Button size="sm" variant="ghost" onClick={() => setSheet({ kind: 'new-goal' })}><Plus className="size-4" /> Nyt mål</Button>} />
      {goals.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={PiggyBank} title="Ingen mål" text={`${name} kan selv oprette mål, eller I kan gøre det her.`} />
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <ChildGoalCard key={g.id} goal={g} savedOre={goalSaved(txs, g.id)} onClick={() => setSheet({ kind: 'goal', goal: g })} />
          ))}
        </div>
      )}

      <SectionHeader title={`${names} opgaver`} />
      {childTasks.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={CheckSquare} title="Ingen åbne opgaver" />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {childTasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}

      <SectionHeader title="Bevægelser" />
      {wallet.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : txs.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Wallet} title="Ingen bevægelser endnu" />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {txs.slice(0, 60).map((t) => (
            <WalletTxRow
              key={t.id}
              tx={t}
              goals={allGoals}
              action={
                t.voided_at === null ? (
                  <button type="button" aria-label={`Fortryd ${walletKindLabels[t.kind].toLowerCase()} ${formatAmount(t.amount_ore)} kr.`} onClick={() => setSheet({ kind: 'void', tx: t })} className="pressable -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-secondary">
                    <Undo2 className="size-4.5" />
                  </button>
                ) : (
                  <span className="size-8 shrink-0" />
                )
              }
            />
          ))}
        </Card>
      )}

      <BottomSheet open={sheet?.kind === 'give'} onClose={close} title={`Penge til ${name}`}>
        {sheet?.kind === 'give' && (
          <AmountForm
            submitLabel="Gem"
            notePlaceholder="Fx ugens lommepenge"
            pending={add.isPending}
            error={add.isError ? walletErrorMessage(add.error) : null}
            onSubmit={(ore, note) => add.mutate({ childId: child.userId, kind, amountOre: ore, note }, { onSuccess: close })}
          >
            <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
              {giveKinds.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.value}
                  onClick={() => setKind(o.value)}
                  className={cn('pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', kind === o.value ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-primary')}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="px-1 text-[13px] text-secondary">{kind === 'allowance' || kind === 'deposit' ? 'Lægges til saldoen.' : 'Trækkes fra saldoen.'}</p>
          </AmountForm>
        )}
      </BottomSheet>
      <BottomSheet open={sheet?.kind === 'new-goal'} onClose={close} title={`Nyt mål for ${name}`}>
        {sheet?.kind === 'new-goal' && (
          <GoalForm
            pending={createGoal.isPending}
            error={createGoal.isError ? walletErrorMessage(createGoal.error) : null}
            onSubmit={(goalName, targetOre) => createGoal.mutate({ childId: child.userId, name: goalName, targetOre }, { onSuccess: close })}
          />
        )}
      </BottomSheet>
      <BottomSheet open={sheet?.kind === 'void'} onClose={close} title="Fortryd bevægelse?">
        {sheet?.kind === 'void' && (
          <>
            <p className="text-[15px] text-secondary">
              {walletKindLabels[sheet.tx.kind]} på {formatAmount(sheet.tx.amount_ore)} kr. fortrydes. Den bliver stående i historikken som fortrudt.
            </p>
            {voidTx.isError && <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{walletErrorMessage(voidTx.error)}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={close}>
                Annullér
              </Button>
              <Button variant="danger" loading={voidTx.isPending} onClick={() => voidTx.mutate(sheet.tx.id, { onSuccess: close })}>
                Fortryd
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
      <GoalSheets sheet={sheet?.kind === 'give' || sheet?.kind === 'void' ? null : (sheet as MoneySheet)} setSheet={setSheet} close={close} childId={child.userId} balance={balance} txs={txs} />
    </>
  )
}
