import { BellRing, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Toggle } from '@/components/ui/Toggle'
import { disablePush, enablePush, isPushEnabled, permission, PushSetupError, pushSupport } from '@/lib/push'
import { useNotificationPrefs, useSendTestNotification, useUpdateNotificationPrefs } from './api'

export function NotificationSettings() {
  const [support] = useState(pushSupport)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [blocked, setBlocked] = useState(() => permission() === 'denied')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prefs = useNotificationPrefs()
  const updatePrefs = useUpdateNotificationPrefs()
  const test = useSendTestNotification()

  useEffect(() => {
    if (support !== 'supported') return
    let active = true
    void isPushEnabled().then((v) => active && setEnabled(v))
    return () => {
      active = false
    }
  }, [support])

  async function toggleDevice(on: boolean) {
    setBusy(true)
    setError(null)
    test.reset()
    try {
      if (on) {
        const result = await enablePush()
        if (result === 'granted') setEnabled(true)
        else {
          setBlocked(result === 'denied')
          setError(result === 'denied' ? null : 'Du skal tillade notifikationer for at få besked.')
        }
      } else {
        await disablePush()
        setEnabled(false)
      }
    } catch (e) {
      setError(e instanceof PushSetupError ? e.message : on ? 'Notifikationer kunne ikke slås til. Prøv igen.' : 'Notifikationer kunne ikke slås fra. Prøv igen.')
    } finally {
      setBusy(false)
    }
  }

  const p = prefs.data

  return (
    <>
      <SectionHeader title="Notifikationer" />
      {support === 'needs-install' ? (
        <div className="flex gap-3 rounded-card bg-surface-primary p-5 shadow-card">
          <Share className="mt-0.5 size-5 shrink-0 text-accent" />
          <p className="text-[15px] text-secondary">
            Notifikationer virker kun, når Hjem er føjet til hjemmeskærmen: tryk på <span className="font-semibold text-primary">Del</span> i Safari, vælg{' '}
            <span className="font-semibold text-primary">Føj til hjemmeskærm</span>, og åbn Hjem derfra.
          </p>
        </div>
      ) : support === 'unsupported' ? (
        <p className="rounded-card bg-surface-primary p-5 text-[15px] text-secondary shadow-card">Denne browser kan ikke vise notifikationer.</p>
      ) : (
        <ListGroup>
          <Toggle
            label="På denne telefon"
            hint={
              blocked
                ? 'Blokeret. Slå dem til i iPhonens Indstillinger → Notifikationer → Hjem.'
                : enabled
                  ? 'Du får notifikationer her.'
                  : 'Slå til for at få påmindelser og besked om nye varer.'
            }
            checked={enabled === true}
            disabled={busy || enabled === null || (blocked && !enabled)}
            onChange={(v) => void toggleDevice(v)}
          />
          {enabled && (
            <ListRow
              icon={BellRing}
              title="Send en testnotifikation"
              subtitle={test.isSuccess ? (test.data ? 'Sendt – den kommer om et øjeblik' : 'Telefonen er ikke tilmeldt. Slå til igen.') : test.isError ? 'Kunne ikke sendes. Prøv igen om lidt.' : undefined}
              onClick={() => !test.isPending && test.mutate()}
              trailing={test.isPending ? <span className="text-[13px] text-secondary">Sender …</span> : undefined}
            />
          )}
        </ListGroup>
      )}
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}

      <ListGroup className="mt-3">
        <Toggle
          label="Påmindelser om aftaler"
          hint="Til den aftalen gælder for. Tidspunktet vælges på aftalen."
          checked={p?.notify_calendar ?? true}
          disabled={!p}
          onChange={(v) => updatePrefs.mutate({ notify_calendar: v })}
        />
        <Toggle
          label="Nye varer på indkøbslisten"
          hint="Når en anden i husstanden tilføjer noget."
          checked={p?.notify_shopping ?? true}
          disabled={!p}
          onChange={(v) => updatePrefs.mutate({ notify_shopping: v })}
        />
      </ListGroup>
      <p className="mt-2 px-1 text-[13px] text-secondary">
        {updatePrefs.isError ? (
          <span className="text-danger">Det kunne ikke gemmes. Prøv igen.</span>
        ) : (
          <>
            Gælder alle dine telefoner.
            {updatePrefs.isSuccess && <span className="font-semibold text-positive"> Gemt</span>}
          </>
        )}
      </p>
    </>
  )
}
