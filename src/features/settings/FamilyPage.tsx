import { Baby, Minus, Plus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, SelectInput, TextInput } from '@/components/ui/Field'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Spinner'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'
import { toIsoDate } from '@/lib/dates'
import { ageOn, describeFamily, familyComposition, unlinkedChildLogins, type FamilyChild } from '@/lib/family'
import { useFamily, useRemoveChild, useSaveChild, useSetAdults } from './family'

const saveError = (e: unknown) => (isReadOnlyError(e) ? READ_ONLY_MESSAGE : 'Det kunne ikke gemmes. Prøv igen.')
const years = (age: number) => `${age} år`

/**
 * Familieoplysninger: hvem bor i husstanden – uafhængigt af hvem der har login.
 * Bruges til budgetforslag. Login, roller, opgaver osv. styres under medlemmerne.
 */
export function FamilyPage() {
  const household = useHousehold()
  const family = useFamily()
  const setAdults = useSetAdults()
  const remove = useRemoveChild()
  const [sheet, setSheet] = useState<FamilyChild | 'new' | null>(null)
  const today = new Date()

  if (family.isPending)
    return (
      <>
        <PageHeader title="Familieoplysninger" back="/indstillinger" />
        <Skeleton className="mt-4 h-64 w-full rounded-card" />
      </>
    )
  if (family.isError || !family.data)
    return (
      <>
        <PageHeader title="Familieoplysninger" back="/indstillinger" />
        <p className="mt-4 text-[15px] text-danger">Oplysningerne kunne ikke hentes. Prøv igen.</p>
      </>
    )

  const data = family.data
  const adultLogins = household.adults.filter((a) => !a.disabled).length
  const composition = familyComposition({ adults: data.adults, adultLogins, children: data.children }, today)
  const shownAdults = setAdults.isPending && setAdults.variables !== undefined ? (setAdults.variables ?? adultLogins) : composition.adults
  const missing = unlinkedChildLogins(household.children, data.children)
  const loginName = (userId: string | null) => household.children.find((c) => c.userId === userId)?.displayName

  return (
    <>
      <PageHeader title="Familieoplysninger" back="/indstillinger" />

      <Card className="mt-4 p-5">
        <p className="text-[13px] font-semibold text-secondary">Familien</p>
        <p className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.02em]">{describeFamily(composition)}</p>
        <p className="mt-2 text-[13.5px] text-secondary">Bruges til budgetforslag for hele familien. Hvem der har login i appen, styres under medlemmerne i Indstillinger.</p>
      </Card>

      <SectionHeader title="Voksne" />
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] text-accent-text" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
            <Users className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium">Antal voksne</span>
            <span className="block text-[13px] text-secondary">{data.adults === null ? `Som antal voksne med login (${adultLogins})` : 'Sat af jer'}</span>
          </span>
          <div className="flex items-center gap-1" role="group" aria-label="Antal voksne">
            <Button size="sm" variant="secondary" aria-label="Færre voksne" disabled={shownAdults <= 1 || setAdults.isPending} onClick={() => setAdults.mutate(shownAdults - 1)}>
              <Minus className="size-4" />
            </Button>
            <span className="tabular w-8 text-center text-[18px] font-bold" aria-live="polite">
              {shownAdults}
            </span>
            <Button size="sm" variant="secondary" aria-label="Flere voksne" disabled={shownAdults >= 12 || setAdults.isPending} onClick={() => setAdults.mutate(shownAdults + 1)}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        {data.adults !== null && data.adults !== adultLogins && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdults.mutate(null)} disabled={setAdults.isPending}>
            Brug antal voksne med login ({adultLogins})
          </Button>
        )}
        {setAdults.isError && <p role="alert" className="mt-2 text-[13px] text-danger">{saveError(setAdults.error)}</p>}
      </Card>

      <SectionHeader title="Børn" action={<Button size="sm" variant="ghost" onClick={() => setSheet('new')}><Plus className="size-4" /> Tilføj barn</Button>} />
      {data.children.length === 0 ? (
        <Card variant="tonal">
          <EmptyState compact icon={Baby} title="Ingen børn registreret" text="Tilføj børnene i familien – også dem uden login i appen – så tæller de med i budgetforslag.">
            <Button size="sm" onClick={() => setSheet('new')}>Tilføj barn</Button>
          </EmptyState>
        </Card>
      ) : (
        <ListGroup>
          {data.children.map((c, i) => {
            const login = loginName(c.member_user_id)
            return (
              <button key={c.id} type="button" onClick={() => setSheet(c)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-secondary">
                <Avatar name={c.name} index={i + 2} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[16px] font-medium">{c.name}</span>
                  <span className="truncate text-[13px] text-secondary">
                    {years(ageOn(c.born_on, today))}
                    {login ? ` · har login som ${login}` : ' · uden login i appen'}
                  </span>
                </span>
              </button>
            )
          })}
        </ListGroup>
      )}
      {missing.length > 0 && (
        <ListGroup className="mt-3">
          {missing.map((m) => (
            <ListRow key={m.userId} icon={Baby} title={`${m.displayName} har login, men står ikke i familien`} subtitle="Tilføj barnet her, så det tæller med – kun én gang" onClick={() => setSheet('new')} />
          ))}
        </ListGroup>
      )}
      {remove.isError && <p role="alert" className="mt-2 text-[13px] text-danger">{saveError(remove.error)}</p>}

      <p className="mt-4 px-1 text-[13px] text-secondary">Et barn behøver ikke en konto i appen for at tælle med. Har barnet et login, kan du koble det til, så det aldrig tælles to gange.</p>

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'new' ? 'Tilføj barn' : (sheet?.name ?? '')}>
        {sheet && <ChildForm key={sheet === 'new' ? 'new' : sheet.id} child={sheet === 'new' ? null : sheet} existing={data.children} onDone={() => setSheet(null)} onRemove={(id) => remove.mutate(id, { onSuccess: () => setSheet(null) })} removing={remove.isPending} />}
      </BottomSheet>
    </>
  )
}

function ChildForm({ child, existing, onDone, onRemove, removing }: { child: FamilyChild | null; existing: FamilyChild[]; onDone: () => void; onRemove: (id: string) => void; removing: boolean }) {
  const household = useHousehold()
  const save = useSaveChild()
  // Børn med login, der ikke allerede er koblet til et andet barn
  const choices = unlinkedChildLogins(household.children, existing.filter((c) => c.id !== child?.id))
  const [memberUserId, setMemberUserId] = useState<string>(child?.member_user_id ?? '')
  const [name, setName] = useState(child?.name ?? '')
  const [bornOn, setBornOn] = useState(child?.born_on ?? '')
  const today = toIsoDate(new Date())
  const valid = name.trim().length > 0 && name.trim().length <= 40 && /^\d{4}-\d{2}-\d{2}$/.test(bornOn) && bornOn <= today

  const pickLogin = (userId: string) => {
    setMemberUserId(userId)
    const login = household.children.find((c) => c.userId === userId)
    if (login && !name.trim()) setName(login.displayName)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    save.mutate({ id: child?.id, name, bornOn, memberUserId: memberUserId || null }, { onSuccess: onDone })
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {choices.length > 0 && (
        <Field label="Login i appen" hint="Frivilligt. Kobl barnet til sit login, så det ikke tælles to gange.">
          <SelectInput value={memberUserId} onChange={(e) => pickLogin(e.target.value)} aria-label="Login i appen">
            <option value="">Intet login (eller tilføjes senere)</option>
            {choices.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.displayName}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
      <Field label="Navn">
        <TextInput value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Fx Lille" autoCapitalize="words" />
      </Field>
      <Field label="Fødselsdato" hint={bornOn && valid ? years(ageOn(bornOn, new Date())) : 'Alderen regnes ud fra fødselsdatoen'}>
        <TextInput type="date" value={bornOn} max={today} onChange={(e) => setBornOn(e.target.value)} />
      </Field>
      {save.isError && <p role="alert" className="text-[14px] text-danger">{saveError(save.error)}</p>}
      <Button type="submit" block disabled={!valid} loading={save.isPending}>
        {child ? 'Gem ændringer' : 'Tilføj barn'}
      </Button>
      {child && (
        <Button type="button" variant="danger" block loading={removing} onClick={() => onRemove(child.id)}>
          Fjern fra familien
        </Button>
      )}
    </form>
  )
}
