import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { OfflineBanner, UpdatePrompt } from './app/PwaStatus'
import { router } from './app/router'
import { AuthProvider } from './features/auth/AuthProvider'
import { ConfigMissingScreen } from './features/auth/StatusScreens'
import { isConfigured } from './lib/env'
import { applyTheme, getThemePreference } from './lib/theme'
import './index.css'

applyTheme(getThemePreference())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true, // opdatér når appen kommer frem igen på telefonen
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
        <UpdatePrompt />
        <OfflineBanner />
      </QueryClientProvider>
    ) : (
      <ConfigMissingScreen />
    )}
  </StrictMode>,
)
