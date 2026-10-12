import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { familyComposition, type FamilyChild, type FamilyComposition } from '@/lib/family'
import { supabase } from '@/lib/supabase'

const key = (hid: string) => ['family', hid] as const

export type Family = { adults: number | null; children: FamilyChild[] }

/** Familieoplysninger: antal voksne (tomt = voksne med login) og børnene i familien */
export function useFamily() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: key(hid),
    queryFn: async (): Promise<Family> => {
      const [{ data: h, error: hErr }, { data: children, error: cErr }] = await Promise.all([
        supabase.from('households').select('adults').eq('id', hid).single(),
        supabase.from('household_children').select('*').order('born_on'),
      ])
      if (hErr) throw hErr
      if (cErr) throw cErr
      return { adults: h.adults, children }
    },
    staleTime: 5 * 60_000,
  })
}

/** Budgetmotorens input – fra familieoplysningerne, ikke fra antallet af børn med login */
export function useFamilyComposition(): FamilyComposition | null {
  const { adults } = useHousehold()
  const family = useFamily()
  if (!family.data) return null
  return familyComposition({ adults: family.data.adults, adultLogins: adults.filter((a) => !a.disabled).length, children: family.data.children })
}

function useInvalidate() {
  const qc = useQueryClient()
  const { id: hid } = useHousehold()
  return () => qc.invalidateQueries({ queryKey: key(hid) })
}

export function useSetAdults() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (adults: number | null) => {
      const { error } = await supabase.from('households').update({ adults }).eq('id', hid)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveChild() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; bornOn: string; memberUserId: string | null }) => {
      const values = { name: input.name.trim(), born_on: input.bornOn, member_user_id: input.memberUserId }
      const { error } = input.id
        ? await supabase.from('household_children').update(values).eq('id', input.id)
        : await supabase.from('household_children').insert({ ...values, household_id: hid })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRemoveChild() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('household_children').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
