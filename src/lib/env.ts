// Offentlig konfiguration. Kun VITE_-variabler er tilgængelige i browseren;
// service-role-nøglen må ALDRIG have VITE_-præfiks eller ligge i frontend-koden.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
  /** Offentlige id'er (ikke hemmelige) til Apple- og Google-login */
  appleServicesId: import.meta.env.VITE_APPLE_SERVICES_ID?.trim() ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '',
}

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
