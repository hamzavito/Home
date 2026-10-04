import { describe, expect, it, vi } from 'vitest'
import { runCleanup, safeEqual, type CleanupDeps } from './cleanup'

/** Lille in-memory model af databasen og Storage */
function world() {
  const now = Date.now()
  const files = new Set(['h/a.jpg', 'h/perm.jpg', 'h/old-pending.jpg', 'h/orphan.jpg'])
  const receipts = [
    { id: 'a', status: 'approved', path: 'h/a.jpg' as string | null, deleteAt: now - 1000, imageDeletedAt: null as number | null },
    { id: 'gone', status: 'approved', path: 'h/gone.jpg' as string | null, deleteAt: now - 1000, imageDeletedAt: null }, // fil mangler
    { id: 'perm', status: 'approved', path: 'h/perm.jpg' as string | null, deleteAt: null as number | null, imageDeletedAt: null },
    { id: 'later', status: 'approved', path: 'h/later.jpg' as string | null, deleteAt: now + 86_400_000, imageDeletedAt: null },
    { id: 'old-pending', status: 'pending', path: 'h/old-pending.jpg' as string | null, deleteAt: null, imageDeletedAt: null, old: true },
  ] as Array<{ id: string; status: string; path: string | null; deleteAt: number | null; imageDeletedAt: number | null; old?: boolean }>
  const transactions = new Set(['tx-a', 'tx-gone', 'tx-perm', 'tx-later'])

  const deps: CleanupDeps = {
    claimExpired: async (limit) =>
      receipts
        .filter((r) => r.status === 'approved' && r.path && r.deleteAt !== null && r.deleteAt <= now)
        .slice(0, limit)
        .map((r) => {
          const p = r.path
          r.path = null
          r.imageDeletedAt = now
          return { receipt_id: r.id, storage_path: p }
        }),
    claimAbandoned: async (limit) => {
      const out = receipts.filter((r) => r.status === 'pending' && r.old).slice(0, limit)
      for (const r of out) receipts.splice(receipts.indexOf(r), 1)
      return out.map((r) => ({ receipt_id: r.id, storage_path: r.path }))
    },
    listOrphans: async () => [...files].filter((f) => !receipts.some((r) => r.path === f) && f === 'h/orphan.jpg').map((f) => ({ storage_path: f })),
    removeFiles: async (paths) => {
      for (const p of paths) files.delete(p) // manglende fil = ingen fejl
    },
  }
  return { files, receipts, transactions, deps }
}

describe('runCleanup', () => {
  it('sletter kun billeder – transaktioner og kvitteringsrækker bevares', async () => {
    const w = world()
    const s = await runCleanup(w.deps)
    expect(s).toEqual({ expiredImages: 2, abandonedUploads: 1, orphanFiles: 1, fileErrors: 0 })
    expect(w.files.has('h/a.jpg')).toBe(false)
    expect(w.receipts.find((r) => r.id === 'a')).toMatchObject({ status: 'approved', path: null })
    expect(w.receipts.find((r) => r.id === 'a')!.imageDeletedAt).not.toBeNull()
    expect(w.transactions.size).toBe(4)
  })

  it('permanent og fremtidig sletning respekteres', async () => {
    const w = world()
    await runCleanup(w.deps)
    expect(w.files.has('h/perm.jpg')).toBe(true)
    expect(w.receipts.find((r) => r.id === 'perm')!.path).toBe('h/perm.jpg')
    expect(w.receipts.find((r) => r.id === 'later')!.path).toBe('h/later.jpg')
  })

  it('manglende billede får ikke oprydningen til at fejle', async () => {
    const w = world()
    await expect(runCleanup(w.deps)).resolves.toBeTruthy()
    expect(w.receipts.find((r) => r.id === 'gone')!.imageDeletedAt).not.toBeNull()
  })

  it('er idempotent: anden kørsel gør intet', async () => {
    const w = world()
    await runCleanup(w.deps)
    const s2 = await runCleanup(w.deps)
    expect(s2).toEqual({ expiredImages: 0, abandonedUploads: 0, orphanFiles: 0, fileErrors: 0 })
  })

  it('en fejl i Storage stopper ikke resten', async () => {
    const w = world()
    const log = vi.fn()
    let calls = 0
    const s = await runCleanup({
      ...w.deps,
      log,
      removeFiles: async (p) => {
        calls++
        if (calls === 1) throw new Error('netværk')
        return w.deps.removeFiles(p)
      },
    })
    expect(s.fileErrors).toBe(2)
    expect(s.abandonedUploads).toBe(1)
    expect(log).toHaveBeenCalled()
  })

  it('kører flere omgange ved store mængder', async () => {
    let left = 450
    const claimExpired = vi.fn(async (limit: number) => {
      const n = Math.min(limit, left)
      left -= n
      return Array.from({ length: n }, (_, i) => ({ receipt_id: String(i), storage_path: `p${left}-${i}` }))
    })
    const s = await runCleanup(
      { claimExpired, claimAbandoned: async () => [], listOrphans: async () => [], removeFiles: async () => {} },
      { batchSize: 200 },
    )
    expect(s.expiredImages).toBe(450)
    expect(claimExpired).toHaveBeenCalledTimes(3)
  })
})

describe('safeEqual', () => {
  it('sammenligner korrekt', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
  })
})
