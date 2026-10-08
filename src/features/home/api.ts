import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import type { EventType, Recurrence, TablesUpdate, Tables, TaskPriority, TaskStatus } from '@/types/database'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type ShoppingItem = Tables<'shopping_items'>
export type Task = Tables<'household_tasks'>
export type CalendarEvent = Tables<'calendar_events'>

const keys = {
  shopping: (hid: string) => ['home', hid, 'shopping'] as const,
  tasks: (hid: string) => ['home', hid, 'tasks'] as const,
  events: (hid: string, from: string, to: string) => ['home', hid, 'events', from, to] as const,
}

function useInvalidateHome() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['home'] })
}

export function homeErrorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (/fetch|network/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  if (msg.includes('findes ikke')) return 'Den findes ikke længere. Den kan være slettet på den anden telefon.'
  return 'Noget gik galt. Prøv igen.'
}

// ---------------------------------------------------------------- Indkøb
export type ShoppingData = { listId: string; items: ShoppingItem[] }

export function useShopping() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.shopping(hid),
    queryFn: async (): Promise<ShoppingData> => {
      const { data: listId, error } = await supabase.rpc('ensure_shopping_list')
      if (error) throw error
      const items = await supabase.from('shopping_items').select('*').eq('list_id', listId).order('sort_order').order('created_at')
      if (items.error) throw items.error
      return { listId, items: items.data }
    },
  })
}

/** Lyt efter ændringer fra den anden telefon (Supabase Realtime – gratis i Free). */
export function useShoppingRealtime() {
  const { id: hid } = useHousehold()
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`shopping:${hid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${hid}` }, () => {
        void qc.invalidateQueries({ queryKey: keys.shopping(hid) })
      })
      .subscribe()
    // Når appen kommer i forgrunden igen, hentes listen på ny (forbindelsen kan være lukket i baggrunden)
    const onVisible = () => document.visibilityState === 'visible' && void qc.invalidateQueries({ queryKey: keys.shopping(hid) })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [hid, qc])
}

export function useAddShoppingItem() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async (i: { listId: string; name: string; quantity: string | null; sortOrder: number }) => {
      const { error } = await supabase
        .from('shopping_items')
        .insert({ household_id: hid, list_id: i.listId, name: i.name.trim(), quantity: i.quantity?.trim() || null, sort_order: i.sortOrder })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Afkrydsning opdateres med det samme på skærmen og rulles tilbage ved fejl */
export function useToggleShoppingItem() {
  const { id: hid } = useHousehold()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from('shopping_items').update({ is_checked: checked }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: keys.shopping(hid) })
      const prev = qc.getQueryData<ShoppingData>(keys.shopping(hid))
      if (prev) qc.setQueryData<ShoppingData>(keys.shopping(hid), { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, is_checked: checked } : i)) })
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.shopping(hid), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.shopping(hid) }),
  })
}

export function useUpdateShoppingItem() {
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TablesUpdate<'shopping_items'> }) => {
      const { error } = await supabase.from('shopping_items').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteShoppingItem() {
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shopping_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useClearChecked() {
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase.from('shopping_items').delete().eq('list_id', listId).eq('is_checked', true)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------- Opgaver
export type TasksData = { active: Task[]; done: Task[] }

export function useTasks() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.tasks(hid),
    queryFn: async (): Promise<TasksData> => {
      const [active, done] = await Promise.all([
        supabase.from('household_tasks').select('*').neq('status', 'done').is('archived_at', null).order('due_on', { nullsFirst: false }).order('created_at'),
        supabase.from('household_tasks').select('*').eq('status', 'done').is('archived_at', null).order('completed_at', { ascending: false }).limit(15),
      ])
      if (active.error) throw active.error
      if (done.error) throw done.error
      return { active: active.data, done: done.data }
    },
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['home', 'task', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('household_tasks').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export type TaskInput = {
  title: string
  description: string | null
  assigneeId: string | null
  /** Valgfri belønning i øre (kun opgaver til børn) */
  rewardOre?: number | null
  dueOn: string | null
  priority: TaskPriority
  recurrence: Recurrence
  interval: number
}

export function useSaveTask() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TaskInput }) => {
      const values = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        assignee_id: input.assigneeId,
        reward_ore: input.rewardOre ?? null,
        due_on: input.dueOn,
        priority: input.priority,
        recurrence: input.recurrence,
        recurrence_interval: input.recurrence === 'none' ? 1 : input.interval,
      }
      if (id) {
        const { error } = await supabase.from('household_tasks').update(values).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('household_tasks').insert({ ...values, household_id: hid }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useSetTaskStatus() {
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { data, error } = await supabase.rpc('set_task_status', { p_task_id: id, p_status: status })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('household_tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------- Kalender
/** Aftaler der overlapper perioden [from, to]. Flerdagsaftaler op til 60 dage før `from` medtages. */
export function useEvents(from: string, to: string) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.events(hid, from, to),
    queryFn: async () => {
      const d = new Date(`${from}T12:00:00`)
      d.setDate(d.getDate() - 60)
      const earliest = d.toISOString().slice(0, 10)
      const { data, error } = await supabase.from('calendar_events').select('*').gte('event_date', earliest).lte('event_date', to).order('event_date').order('start_time')
      if (error) throw error
      return data.filter((e) => (e.end_date ?? e.event_date) >= from)
    },
    placeholderData: (prev) => prev,
  })
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['home', 'event', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('calendar_events').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export type EventInput = {
  title: string
  date: string
  endDate: string | null
  allDay: boolean
  startTime: string | null
  endTime: string | null
  description: string | null
  type: EventType
  /** Hvem aftalen gælder for. Tom = hele familien */
  participantIds: string[]
  /** Minutter før start, NULL = ingen påmindelse */
  reminderMinutes: number | null
}

export function useSaveEvent() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: EventInput }) => {
      const values = {
        title: input.title.trim(),
        event_date: input.date,
        end_date: input.endDate && input.endDate > input.date ? input.endDate : null,
        all_day: input.allDay,
        start_time: input.allDay ? null : input.startTime,
        end_time: input.allDay ? null : input.endTime || null,
        description: input.description?.trim() || null,
        type: input.type,
        participant_ids: input.participantIds,
        reminder_minutes: input.reminderMinutes,
      }
      if (id) {
        const { error } = await supabase.from('calendar_events').update(values).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('calendar_events').insert({ ...values, household_id: hid }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEvent() {
  const invalidate = useInvalidateHome()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendar_events').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
