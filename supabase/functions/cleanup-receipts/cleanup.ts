// Oprydningslogik for kvitteringsbilleder – uafhængig af Deno, så den kan testes.
//
// Rækkefølge pr. trin: databasen "claimer" først (atomisk), derefter slettes
// filerne. Fejler en filsletning, er filen ikke længere refereret og bliver
// fanget som forældreløs ved næste kørsel. Ingen trin fejler, hvis en fil
// allerede mangler, og en ekstra kørsel finder blot intet at gøre.

export type ClaimedRow = { receipt_id: string; storage_path: string | null }

export type CleanupDeps = {
  /** Udløbne billeder: nulstiller sti + sætter image_deleted_at. Returnerer de claimede stier. */
  claimExpired: (limit: number) => Promise<ClaimedRow[]>
  /** Forladte ventende uploads (> 24 t): sletter rækkerne. */
  claimAbandoned: (limit: number) => Promise<ClaimedRow[]>
  /** Filer i bucket uden kvitteringsrække (> 24 t). */
  listOrphans: (limit: number) => Promise<Array<{ storage_path: string }>>
  /** Sletter filer. Manglende filer må ikke give fejl. */
  removeFiles: (paths: string[]) => Promise<void>
  log?: (msg: string) => void
}

export type CleanupSummary = {
  expiredImages: number
  abandonedUploads: number
  orphanFiles: number
  fileErrors: number
}

export async function runCleanup(deps: CleanupDeps, opts: { batchSize?: number; maxRounds?: number } = {}): Promise<CleanupSummary> {
  const batch = opts.batchSize ?? 200
  const maxRounds = opts.maxRounds ?? 20
  const log = deps.log ?? (() => {})
  const summary: CleanupSummary = { expiredImages: 0, abandonedUploads: 0, orphanFiles: 0, fileErrors: 0 }

  const remove = async (paths: string[]) => {
    const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))]
    if (unique.length === 0) return
    try {
      await deps.removeFiles(unique)
    } catch (e) {
      summary.fileErrors += unique.length
      log(`Kunne ikke slette ${unique.length} filer (prøves igen som forældreløse): ${String(e)}`)
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    const rows = await deps.claimExpired(batch)
    summary.expiredImages += rows.length
    await remove(rows.map((r) => r.storage_path ?? ''))
    if (rows.length < batch) break
  }

  for (let round = 0; round < maxRounds; round++) {
    const rows = await deps.claimAbandoned(batch)
    summary.abandonedUploads += rows.length
    await remove(rows.map((r) => r.storage_path ?? ''))
    if (rows.length < batch) break
  }

  // Forældreløse filer: én omgang pr. kørsel er nok (de venter blot til i morgen).
  const orphans = await deps.listOrphans(batch * 2)
  summary.orphanFiles = orphans.length
  await remove(orphans.map((o) => o.storage_path))

  log(`Oprydning: ${JSON.stringify(summary)}`)
  return summary
}

/** Sammenligning der ikke afslører hemmeligheden via tidsforskelle. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
