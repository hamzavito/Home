// Komprimering af kvitteringsbilleder på telefonen før upload.
// Prioritet: læsbar tekst. Bredden styrer læsbarheden, så den holdes høj,
// og lange kvitteringer må være høje.

export const IMAGE_LIMITS = {
  /** Maks bredde (px) for almindelige billeder */
  maxWidth: 1600,
  /** Maks højde (px) – lange kvitteringer bevarer opløsning op til hertil */
  maxHeight: 4800,
  /** Maks antal pixels (iOS-lærreder har en øvre grænse; dette holder god margin) */
  maxPixels: 6_500_000,
  /** Bredden går aldrig under dette, medmindre originalen er smallere */
  minWidth: 900,
}

/** Beregn målstørrelse. Bevarer formatet og skalerer aldrig op. */
export function targetSize(width: number, height: number, limits = IMAGE_LIMITS): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  let scale = Math.min(1, limits.maxWidth / width, limits.maxHeight / height, Math.sqrt(limits.maxPixels / (width * height)))
  // Meget lange kvitteringer: hellere smal og høj end ulæselig – men respektér pixelgrænsen
  if (width * scale < limits.minWidth && width >= limits.minWidth) {
    scale = Math.min(1, limits.minWidth / width, Math.sqrt(limits.maxPixels / (width * height)))
  }
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

/** JPEG-kvalitet: start højt; sænk kun hvis filen bliver meget stor – aldrig under læsbarhedsgrænsen. */
export const QUALITY_STEPS = [0.85, 0.78, 0.72] as const
export const SOFT_MAX_BYTES = 900_000

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // createImageBitmap respekterer EXIF-orientering i moderne browsere
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // fx HEIC i browsere hvor createImageBitmap ikke kan – prøv <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('Billedet kunne ikke læses. Prøv at tage billedet igen.')
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Komprimering mislykkedes'))), 'image/jpeg', quality),
  )
}

export type CompressedImage = { blob: Blob; width: number; height: number }

/**
 * Konverterer (også HEIC/HEIF fra iPhone, når browseren kan vise det) til JPEG
 * – det format der virker stabilt i alle browsere, Storage og OCR.
 */
export async function compressReceiptImage(file: Blob): Promise<CompressedImage> {
  const img = await decode(file)
  try {
    const { width, height } = targetSize(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Komprimering mislykkedes')
    ctx.fillStyle = '#fff' // gennemsigtighed → hvid (kvitteringspapir)
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img.source, 0, 0, width, height)

    let blob = await toBlob(canvas, QUALITY_STEPS[0])
    for (const q of QUALITY_STEPS.slice(1)) {
      if (blob.size <= SOFT_MAX_BYTES) break
      blob = await toBlob(canvas, q)
    }
    // Frigør lærredets hukommelse (vigtigt på iOS)
    canvas.width = 0
    canvas.height = 0
    return { blob, width, height }
  } finally {
    img.close()
  }
}

/** Drej et billede 90° med uret (til kvitteringer, der er fotograferet på skrå/ned ad). */
export async function rotateImage(file: Blob): Promise<Blob> {
  const img = await decode(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.height
    canvas.height = img.width
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Billedet kunne ikke drejes')
    ctx.translate(canvas.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(img.source, 0, 0, img.width, img.height)
    const blob = await toBlob(canvas, QUALITY_STEPS[0])
    canvas.width = 0
    canvas.height = 0
    return blob
  } finally {
    img.close()
  }
}
