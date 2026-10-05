import { RefreshCw, WifiOff } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60 * 1000

/**
 * Ny version: brugeren vælger selv hvornår der opdateres, så en halvudfyldt
 * formular aldrig forsvinder. Der tjekkes for opdateringer hver time og når
 * appen kommer i forgrunden (iPhone-PWA'er kan leve længe i baggrunden).
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine && registration.installing === null) void registration.update().catch(() => {})
      }
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })
  const [updating, setUpdating] = useState(false)

  if (!needRefresh || dismissed) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 px-4 [animation:sheet-in_320ms_var(--ease-spring)]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface-inverse px-4 py-3 text-on-inverse shadow-raised">
        <RefreshCw className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 text-[14px] font-semibold">Ny version af Hjem er klar</p>
        <button type="button" onClick={() => setDismissed(true)} className="h-9 rounded-full px-3 text-[14px] font-semibold text-on-inverse">
          Senere
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => {
            setUpdating(true)
            void updateServiceWorker(true)
            // Sikkerhedsnet: genindlæs hvis den nye service worker ikke tager over
            setTimeout(() => location.reload(), 4000)
          }}
          className="h-9 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
        >
          {updating ? 'Opdaterer …' : 'Opdatér'}
        </button>
      </div>
    </div>
  )
}

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Tydelig besked når telefonen er uden net – data hentes og gemmes kun online. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-md items-center gap-2.5 rounded-2xl bg-surface-inverse px-4 py-2.5 text-on-inverse shadow-raised">
        <WifiOff className="size-4.5 shrink-0" />
        <p className="text-[13px] font-semibold">Ingen forbindelse. Ændringer kan ikke gemmes, før nettet er tilbage.</p>
      </div>
    </div>
  )
}
