// Slet den indloggede brugers konto (GDPR).
// 1. Databasen rydder op: er brugeren sidste voksne, slettes hele husstanden;
//    ellers forlader brugeren husstanden, og profilen anonymiseres.
// 2. Husstandens kvitteringsbilleder og børnenes logins slettes.
// 3. Login-identiteten slettes. Peger historik i en anden husstand stadig på
//    brugeren, "blød-slettes" den (kan aldrig logge ind igen, e-mail fjernet).

export type DeleteDeps = {
  callerId: () => Promise<string | null>
  prepare: (userId: string) => Promise<{ household_deleted: string | null; child_ids: string[] }>
  listFiles: (prefix: string) => Promise<string[]>
  removeFiles: (paths: string[]) => Promise<void>
  /** soft=true: identiteten bevares anonymiseret (historik peger på den) */
  deleteUser: (id: string, soft: boolean) => Promise<void>
  log?: (msg: string) => void
}

export type DeleteResponse = { status: number; body: { ok: true } | { ok: false; error: 'unauthorized' | 'bad_request' | 'not_allowed' | 'server' } }

async function deleteUserFully(deps: DeleteDeps, id: string) {
  try {
    await deps.deleteUser(id, false)
  } catch {
    await deps.deleteUser(id, true)
  }
}

export async function handleDelete(body: unknown, deps: DeleteDeps): Promise<DeleteResponse> {
  const uid = await deps.callerId().catch(() => null)
  if (!uid) return { status: 401, body: { ok: false, error: 'unauthorized' } }
  if ((body as { confirm?: unknown } | null)?.confirm !== 'SLET') return { status: 400, body: { ok: false, error: 'bad_request' } }

  let result: { household_deleted: string | null; child_ids: string[] }
  try {
    result = await deps.prepare(uid)
  } catch (e) {
    const code = (e as { code?: string } | null)?.code
    if (code === '42501') return { status: 403, body: { ok: false, error: 'not_allowed' } }
    deps.log?.(`prepare fejlede: ${(e as Error)?.message}`)
    return { status: 500, body: { ok: false, error: 'server' } }
  }

  // Herfra er data allerede slettet/anonymiseret. Oprydning der fejler, tages
  // af den daglige oprydning (forældreløse billeder) – vi fortsætter altid.
  if (result.household_deleted) {
    try {
      for (let i = 0; i < 100; i++) {
        const files = await deps.listFiles(result.household_deleted)
        if (files.length === 0) break
        await deps.removeFiles(files)
      }
    } catch (e) {
      deps.log?.(`billeder: ${(e as Error)?.message}`)
    }
    for (const child of result.child_ids) {
      await deleteUserFully(deps, child).catch((e) => deps.log?.(`barn ${child}: ${(e as Error)?.message}`))
    }
  }
  try {
    await deleteUserFully(deps, uid)
  } catch (e) {
    deps.log?.(`bruger: ${(e as Error)?.message}`)
    return { status: 500, body: { ok: false, error: 'server' } }
  }
  return { status: 200, body: { ok: true } }
}
