import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** Fuldskærmsvisning af et kvitteringsbillede med zoom. */
export function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Kvitteringsbillede" className="fixed inset-0 z-50 bg-black [animation:fade-in_180ms_ease-out]">
      <div className="absolute inset-0 overflow-auto overscroll-contain pb-safe pt-safe">
        <img src={src} alt="Kvittering" className={zoom ? 'w-[220%] max-w-none' : 'mx-auto min-h-full w-full object-contain'} onClick={() => setZoom((z) => !z)} />
      </div>
      <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" aria-label={zoom ? 'Zoom ud' : 'Zoom ind'} onClick={() => setZoom((z) => !z)} className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
          {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
        </button>
        <button type="button" aria-label="Luk" onClick={onClose} className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
          <X className="size-5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
