import { useNavigate } from 'react-router'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import { addActions, CURRENT_PHASE } from './sections'

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Sheet open={open} onClose={onClose} title="Tilføj">
      <ul className="grid grid-cols-2 gap-3">
        {[...addActions].sort((a, b) => Number(b.key === 'receipt') - Number(a.key === 'receipt')).map((a) => {
          const ready = a.phase <= CURRENT_PHASE
          return (
            <li key={a.key} className={cn(a.key === 'receipt' && 'col-span-2')}>
              <button
                type="button"
                disabled={!ready}
                onClick={() => {
                  onClose()
                  navigate(a.path)
                }}
                className="flex h-full w-full flex-col items-start gap-3 rounded-2xl bg-fill p-4 text-left transition active:scale-[0.98] disabled:active:scale-100"
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: a.color }}>
                    <a.icon className="size-5 text-white" />
                  </span>
                  {!ready && <span className="rounded-full bg-fill-strong px-2 py-0.5 text-[11px] text-text-secondary">Snart</span>}
                </span>
                <span className="text-[16px] font-semibold">{a.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
