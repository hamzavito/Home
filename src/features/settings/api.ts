import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { householdQueryKey, useHousehold } from '@/features/household/HouseholdProvider'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/dates'
import type { DefaultPaidBy, DefaultRetention } from '@/types/database'

function useRefreshHousehold() {
  const { session } = useAuth()
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: householdQueryKey(session?.user.id) })
}

export function useUpdateProfile() {
  const { me } = useHousehold()
  const refresh = useRefreshHousehold()
  return useMutation({
    mutationFn: async (values: { display_name?: string; default_paid_by?: DefaultPaidBy }) => {
      const { error } = await supabase.from('profiles').update(values).eq('id', me.userId)
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

export function useUpdateRetentionDefault() {
  const { id } = useHousehold()
  const refresh = useRefreshHousehold()
  return useMutation({
    mutationFn: async (value: DefaultRetention) => {
      const { error } = await supabase.from('households').update({ default_receipt_retention: value }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },
  })
}

/** Henter husstandens data som JSON og gemmer/deler filen */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('export_household_data')
      if (error) throw error
      const name = `hjem-backup-${toIsoDate(new Date())}.json`
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const file = new File([blob], name, { type: 'application/json' })
      // På iPhone åbner deling "Arkiver i Filer"; ellers downloades filen
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name })
          return
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
        }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
  })
}
