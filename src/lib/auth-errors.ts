// Danske fejltekster for Supabase Auth. Afslører aldrig om en e-mail findes.
export function authErrorMessage(e: { status?: number; code?: string; message?: string }): string {
  if (e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit')
    return 'For mange forsøg. Vent et øjeblik og prøv igen.'
  if (e.code === 'otp_expired' || /expired|invalid|token/i.test(e.message ?? '')) return 'Koden er forkert eller udløbet. Tjek koden, eller send en ny.'
  if (e.code === 'weak_password') return 'Adgangskoden er for svag. Brug mindst 8 tegn.'
  if (e.code === 'same_password') return 'Vælg en anden adgangskode end den nuværende.'
  return 'Noget gik galt. Tjek forbindelsen og prøv igen.'
}
