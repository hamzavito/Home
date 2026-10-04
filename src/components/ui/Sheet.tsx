import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** Bottom sheet bygget på <dialog>, så fokus, Esc og skærmlæsere virker korrekt. */
export function Sheet({ open, onClose, title, children }: Props) {
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
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/35 backdrop:[animation:fade-in_200ms_ease-out] open:[animation:sheet-in_280ms_cubic-bezier(0.32,0.72,0,1)] sm:mx-auto sm:max-w-lg"
    >
      <div className="rounded-t-[28px] bg-elevated px-4 pb-safe pt-2 text-text">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-fill-strong" aria-hidden />
        {title && <h2 className="mb-3 px-1 text-[20px] font-semibold">{title}</h2>}
        <div className="pb-4">{children}</div>
      </div>
    </dialog>
  )
}
