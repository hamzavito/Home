/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Apple "Services ID" til "Log ind med Apple" (tom = knappen vises ikke) */
  readonly VITE_APPLE_SERVICES_ID?: string
  /** Google OAuth Client ID (Web) til "Log ind med Google" (tom = knappen vises ikke) */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
