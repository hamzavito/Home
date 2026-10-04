import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** Bottom sheet bygget på <dialog>, så fokus, Esc og skærmlæsere virker korrekt. */
export function BottomSheet({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-[2px] backdrop:[animation:fade-in_200ms_ease-out] open:[animation:sheet-in_320ms_var(--ease-spring)] sm:mx-auto sm:max-w-lg"
    >
      <div className="rounded-t-[32px] bg-surface-sheet px-5 pb-safe pt-2 text-primary">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-surface-tertiary" aria-hidden />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
            <button type="button" aria-label="Luk" onClick={onClose} className="pressable flex size-9 items-center justify-center rounded-full bg-surface-secondary">
              <X className="size-4.5" strokeWidth={2.5} />
            </button>
          </div>
        )}
        <div className="pb-5">{children}</div>
      </div>
    </dialog>
  )
}
