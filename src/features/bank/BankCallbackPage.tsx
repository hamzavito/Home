import { CheckCircle2, Landmark } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { FullScreenLoader } from '@/components/ui/Spinner'
import { bankErrorMessage, useBankCallback } from './api'

/** Banken sender brugeren hertil efter MitID (?code=…&state=…, eller ?error=… ved afbrud). */
export function BankCallbackPage() {
  const [params] = useSearchParams()
  const code = params.get('code')
  const state = params.get('state')
  const denied = params.get('error')
  const callback = useBankCallback()
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !code || !state) return
    started.current = true
    callback.mutate({ code, state })
  }, [code, state, callback])

  const link = (to: string, label: string) => (
    <Link to={to} className="pressable inline-flex h-11 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent">
      {label}
    </Link>
  )

  if (denied || !code || !state)
    return (
      <>
        <PageHeader title="Bank" back="/indstillinger/bank" />
        <EmptyState icon={Landmark} title="Banken blev ikke forbundet" text="Login hos banken blev afbrudt. Du kan prøve igen.">
          {link('/indstillinger/bank', 'Prøv igen')}
        </EmptyState>
      </>
    )
  if (callback.isError)
    return (
      <>
        <PageHeader title="Bank" back="/indstillinger/bank" />
        <EmptyState icon={Landmark} title="Banken blev ikke forbundet" text={bankErrorMessage(callback.error)}>
          {link('/indstillinger/bank', 'Prøv igen')}
        </EmptyState>
      </>
    )
  if (!callback.isSuccess) return <FullScreenLoader />
  const n = callback.data.imported ?? 0
  return (
    <>
      <PageHeader title="Bank" back="/indstillinger/bank" />
      <EmptyState icon={CheckCircle2} title="Banken er forbundet" text={n ? `${n} posteringer er hentet. Gennemgå dem og godkend dem, der skal med.` : 'Nye posteringer hentes automatisk hver nat.'}>
        {link('/okonomi/bank', 'Se posteringer')}
      </EmptyState>
    </>
  )
}
