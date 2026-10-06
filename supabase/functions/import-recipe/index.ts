// Edge Function: hent en opskrift fra et link (schema.org/Recipe på siden).
// Kun for indloggede brugere. Beskyttet mod misbrug: kun almindelige web-adresser
// (ingen interne/lokale adresser, heller ikke via omdirigering), højst 3 MB, 10 sek.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractRecipe, safeUrl } from './extract.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_BYTES = 3_000_000
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS })

async function fetchPage(start: URL): Promise<string> {
  let url = start
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'da-DK,da;q=0.9,en;q=0.5',
        },
      })
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel()
        // Hver omdirigering kontrolleres igen
        const next = safeUrl(new URL(res.headers.get('location') ?? '', url).href)
        if (!next) throw new Error('unsafe_redirect')
        url = next
        continue
      }
      if (!res.ok) {
        await res.body?.cancel()
        throw new Error(`http_${res.status}`)
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('empty')
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_BYTES) {
          await reader.cancel()
          break // opskriften står næsten altid i toppen – brug det vi har
        }
        chunks.push(value)
      }
      const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let i = 0
      for (const c of chunks) {
        all.set(c, i)
        i += c.length
      }
      return new TextDecoder('utf-8').decode(all)
    }
    throw new Error('too_many_redirects')
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405)

  // Kun indloggede brugere (ikke den offentlige anon-nøgle alene)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { data: user, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_url' })
  }
  const url = safeUrl(body.url)
  if (!url) return json({ ok: false, error: 'invalid_url' })

  try {
    const html = await fetchPage(url)
    const recipe = extractRecipe(html)
    if (!recipe) return json({ ok: false, error: 'no_recipe' })
    return json({ ok: true, recipe, source: url.href })
  } catch (e) {
    console.error('import-recipe', url.hostname, String(e))
    return json({ ok: false, error: 'fetch_failed' })
  }
})
