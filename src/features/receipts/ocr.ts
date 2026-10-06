// OCR i browseren med Tesseract.js. Alle filer hentes fra vores eget domæne
// (/ocr – kopieret fra npm ved build), så intet billede eller tekst forlader telefonen.
import type { Worker } from 'tesseract.js'
import { cropToReceipt } from '@/lib/receipt-crop'

type Progress = (p: number) => void

let workerPromise: Promise<Worker> | null = null
let onProgress: Progress | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js')
      const base = new URL('/ocr/', window.location.origin).href
      const worker = await createWorker('dan', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress)
        },
      })
      await worker.setParameters({
        // Én tekstblok: hver linje læses i hele bredden, så prisen i højre side følger
        // varen/TOTAL. (SINGLE_COLUMN mistede priskolonnen på rigtige, let buede kvitteringer.)
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })
      return worker
    })().catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

/** Læs tekst fra et billede. Kaster fejl, hvis OCR ikke kan køre. */
export async function recognizeReceipt(image: Blob, progress?: Progress): Promise<string> {
  clearTimeout(idleTimer)
  onProgress = progress ?? null
  try {
    const worker = await getWorker()
    // Kun selve papiret læses (hånd, bord og gulv forvirrer OCR). Fejler det, bruges hele billedet.
    const receipt = await cropToReceipt(image).catch(() => image)
    const { data } = await worker.recognize(receipt)
    return data.text
  } finally {
    onProgress = null
    // Frigør hukommelse, hvis der ikke scannes mere i et stykke tid
    idleTimer = setTimeout(() => void terminateOcr(), 120_000)
  }
}

export async function terminateOcr() {
  const p = workerPromise
  workerPromise = null
  if (p) await (await p).terminate().catch(() => {})
}
