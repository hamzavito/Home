import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { addActions, CURRENT_PHASE } from './sections'

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [primary, ...rest] = addActions
  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  const ready = (phase: number) => phase <= CURRENT_PHASE
  const scan = addActions.find((a) => a.key === 'receipt')!
  const others = rest.filter((a) => a.key !== 'receipt')

  return (
    <BottomSheet open={open} onClose={onClose} title="Tilføj">
      {/* De to vigtigste handlinger som store kort */}
      <div className="grid grid-cols-2 gap-3">
        {[primary!, scan].map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={!ready(a.phase)}
            onClick={() => go(a.path)}
            className="pressable flex h-[132px] flex-col justify-between rounded-[22px] p-4 text-left disabled:active:scale-100"
            style={{ background: `color-mix(in srgb, ${a.color} 14%, var(--surface-primary))` }}
          >
            <span className="flex size-11 items-center justify-center rounded-[15px]" style={{ background: a.color }}>
              <a.icon className="size-5.5 text-white" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[16px] font-bold leading-tight">{a.title}</span>
              {!ready(a.phase) && <span className="text-[12px] font-medium text-secondary">Kommer snart</span>}
            </span>
          </button>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-subtle overflow-hidden rounded-[22px] bg-surface-primary">
        {others.map((a) => (
          <li key={a.key}>
            <button
              type="button"
              disabled={!ready(a.phase)}
              onClick={() => go(a.path)}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left transition-colors active:bg-surface-secondary disabled:active:bg-transparent"
            >
              <span className="flex size-9 items-center justify-center rounded-[12px]" style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)` }}>
                <a.icon className="size-[18px]" style={{ color: a.color }} strokeWidth={2.3} />
              </span>
              <span className="flex-1 text-[16px] font-semibold">{a.title}</span>
              {ready(a.phase) ? (
                <ChevronRight className="size-5 text-muted" />
              ) : (
                <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary">Snart</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
