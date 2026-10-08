import { describe, expect, it, vi } from 'vitest'
import { handleDelete, type DeleteDeps } from './deletion'

function deps(over: Partial<DeleteDeps> = {}) {
  const files = new Map<string, string[]>([['h1', ['h1/a.jpg', 'h1/b.jpg']]])
  const calls: string[] = []
  const d: DeleteDeps = {
    callerId: async () => 'u1',
    prepare: async () => ({ household_deleted: null, child_ids: [] }),
    listFiles: async (p) => files.get(p) ?? [],
    removeFiles: async (paths) => {
      calls.push(`rm ${paths.join(',')}`)
      for (const [k, v] of files) files.set(k, v.filter((x) => !paths.includes(x)))
    },
    deleteUser: async (id, soft) => {
      calls.push(`del ${id}${soft ? ' soft' : ''}`)
    },
    ...over,
  }
  return { d, calls }
}

describe('account-delete', () => {
  it('kræver login og bekræftelse', async () => {
    expect((await handleDelete({ confirm: 'SLET' }, deps({ callerId: async () => null }).d)).status).toBe(401)
    expect((await handleDelete({}, deps().d)).status).toBe(400)
  })

  it('sidste voksne: billeder, børn og bruger slettes', async () => {
    const { d, calls } = deps({ prepare: async () => ({ household_deleted: 'h1', child_ids: ['c1'] }) })
    const r = await handleDelete({ confirm: 'SLET' }, d)
    expect(r.status).toBe(200)
    expect(calls).toEqual(['rm h1/a.jpg,h1/b.jpg', 'del c1', 'del u1'])
  })

  it('historik i en anden husstand: blød sletning', async () => {
    const { d, calls } = deps({
      deleteUser: async (id, soft) => {
        if (!soft) throw new Error('Database error deleting user')
        calls.push(`del ${id} soft`)
      },
    })
    expect((await handleDelete({ confirm: 'SLET' }, d)).status).toBe(200)
    expect(calls).toEqual(['del u1 soft'])
  })

  it('børn kan ikke slette sig selv', async () => {
    const del = vi.fn()
    const { d } = deps({ prepare: async () => Promise.reject({ code: '42501' }), deleteUser: del })
    expect((await handleDelete({ confirm: 'SLET' }, d)).status).toBe(403)
    expect(del).not.toHaveBeenCalled()
  })

  it('fejl i oprydning af billeder stopper ikke sletningen', async () => {
    const { d, calls } = deps({ prepare: async () => ({ household_deleted: 'h1', child_ids: [] }), listFiles: async () => Promise.reject(new Error('x')) })
    expect((await handleDelete({ confirm: 'SLET' }, d)).status).toBe(200)
    expect(calls).toEqual(['del u1'])
  })
})
