import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { householdQueryKey } from '@/features/household/HouseholdProvider'
import { clearPendingInvite, normalizeInviteCode } from '@/lib/invite'
import { supabase } from '@/lib/supabase'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type InvitePreview = { householdName: string; invitedBy: string; expiresAt: string }

export function onboardingError(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (msg.includes('For mange')) return msg
  if (msg.includes('allerede med i en husstand')) return 'Du er allerede med i en husstand.'
  if (msg.includes('Skriv et navn')) return 'Skriv et navn på husstanden.'
  if (msg.includes('højst 40')) return 'Dit navn må højst være 40 tegn.'
  if (/fetch|network|Failed/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  return 'Noget gik galt. Prøv igen.'
}

function useReloadHousehold() {
  const { session } = useAuth()
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: householdQueryKey(session?.user.id) })
}

export function useCreateHousehold() {
  const reload = useReloadHousehold()
  return useMutation({
    mutationFn: async (input: { name: string; displayName: string }) => {
      const { data, error } = await supabase.rpc('household_create', { p_name: input.name.trim(), p_display_name: input.displayName.trim() || null })
      if (error) throw error
      clearPendingInvite()
      return data
    },
    onSuccess: reload,
  })
}

/** null = koden er ugyldig, brugt eller udløbet */
export function usePreviewInvite() {
  return useMutation({
    mutationFn: async (code: string): Promise<InvitePreview | null> => {
      const { data, error } = await supabase.rpc('invite_preview', { p_code: normalizeInviteCode(code) })
      if (error) throw error
      const row = data?.[0]
      return row ? { householdName: row.household_name, invitedBy: row.invited_by, expiresAt: row.expires_at } : null
    },
  })
}

export function useAcceptInvite() {
  const reload = useReloadHousehold()
  return useMutation({
    mutationFn: async (input: { code: string; displayName: string }) => {
      const { data, error } = await supabase.rpc('invite_accept', { p_code: normalizeInviteCode(input.code), p_display_name: input.displayName.trim() || null })
      if (error) throw error
      if (!data) throw new Error('invalid_invite')
      clearPendingInvite()
      return data
    },
    onSuccess: reload,
  })
}
