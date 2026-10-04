// Offentlig konfiguration. Kun VITE_-variabler er tilgængelige i browseren;
// service-role-nøglen må ALDRIG have VITE_-præfiks eller ligge i frontend-koden.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
}

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
