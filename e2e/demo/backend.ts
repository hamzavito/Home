// =============================================================================
// Demo-/testbackend: en lokal efterligning af Supabase (PostgREST, RPC, Auth og
// Storage) der kører i browseren. Bruges af E2E-testene og den klikbare demo.
//
// VIGTIGT: Dette er IKKE sandhedskilden. Forretningsreglerne ligger i
// supabase/migrations (og testes i supabase/tests). Funktionerne her spejler
// SQL'en så tæt som muligt, så UI-flows kan testes uden et Supabase-projekt.
// =============================================================================
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { authStorage } from '@/lib/session-storage'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Db = Record<string, Row[]>

const URL_BASE = 'http://demo.local'
export const HID = '11111111-1111-4111-8111-111111111111'
export const ME = '00000000-0000-4000-8000-0000000000a1'
export const WIFE = '00000000-0000-4000-8000-0000000000a2'
const DB_KEY = 'hjem-demo-db-v4'
const FILES_KEY = 'hjem-demo-files-v2'
const MODE_KEY = 'hjem-demo-mode' // 'empty' = start uden demodata (bruges af tests)

const TABLES = [
  'households',
  'profiles',
  'budget_categories',
  'budget_category_defaults',
  'monthly_budgets',
  'transactions',
  'receipts',
  'fixed_groups',
  'fixed_items',
  'fixed_item_versions',
  'upcoming_expenses',
  'savings_goals',
  'savings_movements',
  'shopping_lists',
  'shopping_items',
  'household_tasks',
  'calendar_events',
] as const

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthStart = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
export const addMonths = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number)
  return monthStart(new Date(y!, mo! - 1 + n, 1, 12))
}
const addDays = (isoDate: string, n: number) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  return iso(new Date(y!, m! - 1, d! + n, 12))
}
const uuid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()
const curMonth = () => monthStart(new Date())
const today = () => iso(new Date())

class PgError extends Error {
  constructor(
    message: string,
    public code = 'P0001',
    public status = 400,
  ) {
    super(message)
  }
}

// ------------------------------------------------------------------ persistens
let db: Db
const files = new Map<string, Blob>()
const listeners = new Set<() => void>()
// Som Supabase Realtime: kun ændringer i shopping_items udsendes
let lastShopping = ''

function emptyDb(): Db {
  return Object.fromEntries(TABLES.map((t) => [t, []]))
}
function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* kun i hukommelsen */
  }
  const snap = JSON.stringify(db.shopping_items ?? [])
  if (snap !== lastShopping) {
    lastShopping = snap
    // Asynkront, ligesom en rigtig realtime-besked
    setTimeout(() => listeners.forEach((l) => l()), 0)
  }
}
async function saveFiles() {
  try {
    const out: Record<string, string> = {}
    for (const [k, b] of files)
      out[k] = await new Promise<string>((res) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.readAsDataURL(b)
      })
    localStorage.setItem(FILES_KEY, JSON.stringify(out))
  } catch {
    /* billeder for store til localStorage */
  }
}
function loadFiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(FILES_KEY) ?? '{}') as Record<string, string>
    for (const [k, dataUrl] of Object.entries(raw)) {
      const [meta, b64] = dataUrl.split(',')
      const bin = atob(b64!)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      files.set(k, new Blob([arr], { type: meta!.slice(5).split(';')[0] }))
    }
  } catch {
    /* ignorér */
  }
}

// ------------------------------------------------------------------ demodata
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function drawReceipt(lines: string[]): Promise<Blob> {
  const w = 760
  const lh = 34
  const c = document.createElement('canvas')
  c.width = w
  c.height = 90 + lines.length * lh
  const g = c.getContext('2d')!
  g.fillStyle = '#fbfaf4'
  g.fillRect(0, 0, w, c.height)
  g.fillStyle = '#222'
  g.font = '24px "DejaVu Sans Mono", Menlo, Consolas, monospace'
  lines.forEach((l, i) => g.fillText(l, 40, 60 + i * lh))
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85))
}

function baseDb(): Db {
  const d = emptyDb()
  const created = '2026-01-01T09:00:00.000Z'
  d.households = [{ id: HID, name: 'Vores hjem', default_receipt_retention: '30d', created_at: created, updated_at: created }]
  d.profiles = [
    { id: ME, display_name: 'Hamza', color: null, default_paid_by: 'me', created_at: created, updated_at: created },
    { id: WIFE, display_name: 'Sumaya', color: null, default_paid_by: 'me', created_at: created, updated_at: created },
  ]
  return d
}

const GROUPS = ['Bolig', 'Transport', 'Forsikring', 'Abonnementer', 'Gæld', 'Opsparing', 'Andet']

async function seedDemo(): Promise<Db> {
  const d = baseDb()
  const now = new Date()
  const cur = curMonth()
  const from = addMonths(cur, -3)
  const created = new Date(now.getFullYear(), now.getMonth() - 3, 2).toISOString()
  const r = rng(42)

  // Faste poster – husstandens rigtige tal (23.822,13 kr.)
  const gid: Record<string, string> = {}
  GROUPS.forEach((name, i) => {
    const id = uuid()
    gid[name] = id
    d.fixed_groups!.push({ id, household_id: HID, name, sort_order: i, archived_at: null, created_by: ME, created_at: created, updated_at: created })
  })
  const fixed: Array<[string, 'income' | 'expense', number, string | null]> = [
    ['Nettoindkomst', 'income', 3000000, null],
    ['Husleje', 'expense', 891300, 'Bolig'],
    ['El, vand og varme', 'expense', 246400, 'Bolig'],
    ['Cupra Tavascan', 'expense', 270350, 'Transport'],
    ['Bilafbetaling', 'expense', 379800, 'Transport'],
    ['Clever', 'expense', -51100, 'Transport'],
    ['Forsikringer', 'expense', 61150, 'Forsikring'],
    ['Canva', 'expense', 9588, 'Abonnementer'],
    ['Apple', 'expense', 2500, 'Abonnementer'],
    ['Mobilabonnement', 'expense', 47800, 'Abonnementer'],
    ['Legeland', 'expense', 10525, 'Abonnementer'],
    ['Bankabonnement', 'expense', 7900, 'Abonnementer'],
    ['Fagforening', 'expense', 56000, 'Andet'],
    ['Afbetaling', 'expense', 200000, 'Gæld'],
    ['Opsparing', 'expense', 150000, 'Opsparing'],
    ['Rejsegruppe', 'expense', 100000, 'Opsparing'],
  ]
  fixed.forEach(([name, kind, amount, group], i) => {
    const id = uuid()
    d.fixed_items!.push({
      id, household_id: HID, kind, name, group_id: group ? gid[group] : null,
      owner_kind: kind === 'income' ? 'member' : null, owner_user_id: kind === 'income' ? ME : null,
      payment_day: kind === 'income' ? 1 : null, note: null, sort_order: i, start_month: from, end_month: null, archived_at: null,
      created_by: ME, created_at: created, updated_at: created,
    })
    d.fixed_item_versions!.push({ id: uuid(), household_id: HID, item_id: id, valid_from: from, amount_ore: amount, frequency: 'monthly', due_month: null, created_by: ME, created_at: created, updated_at: created })
  })

  // Variable budgetter: Buffer (reserve), Mad 65 %, Hygge 35 %
  const cats: Array<[string, string, string, 'spending' | 'reserve', 'amount' | 'percent', number]> = [
    ['Mad', 'cart', '#1aa59a', 'spending', 'percent', 6500],
    ['Hygge', 'heart', '#d65a9c', 'spending', 'percent', 3500],
    ['Buffer', 'sparkles', '#5f6b7a', 'reserve', 'amount', 200000],
  ]
  const catId: Record<string, string> = {}
  cats.forEach(([name, icon, color, kind, mode, v], i) => {
    const id = uuid()
    catId[name] = id
    d.budget_categories!.push({ id, household_id: HID, name, icon, color, kind, sort_order: i, archived_at: null, created_by: ME, created_at: created, updated_at: created })
    d.budget_category_defaults!.push({
      id: uuid(), household_id: HID, category_id: id, valid_from: from, mode,
      amount_ore: mode === 'amount' ? v : null, percent_bp: mode === 'percent' ? v : null, created_by: ME, created_at: created, updated_at: created,
    })
  })

  const shops: Record<string, Array<[string, number, number]>> = {
    Mad: [['Netto', 9000, 32000], ['Føtex', 15000, 60000], ['Rema 1000', 8000, 30000], ['Lidl', 12000, 40000], ['Bilka', 30000, 90000]],
    Hygge: [['Sushi Time', 25000, 48000], ['Pizzeria Roma', 18000, 32000], ['Lagkagehuset', 6000, 14000], ['Biograf', 15000, 25000]],
  }
  const freq: Record<string, number> = { Mad: 11, Hygge: 4 }
  const payers: Array<[string, string | null]> = [['member', ME], ['member', WIFE], ['shared', null]]
  for (let back = 2; back >= 0; back--) {
    const m = addMonths(cur, -back)
    const [y, mo] = m.split('-').map(Number)
    const days = back === 0 ? now.getDate() : new Date(y!, mo!, 0).getDate()
    const scale = back === 0 ? Math.min(1, now.getDate() / 22) : 1
    for (const [name, list] of Object.entries(shops)) {
      const n = Math.max(1, Math.round(freq[name]! * scale))
      for (let i = 0; i < n; i++) {
        const [desc, min, max] = list[Math.floor(r() * list.length)]!
        const day = 1 + Math.floor(r() * days)
        const [kind, uid] = payers[Math.floor(r() * payers.length)]!
        const at = new Date(y!, mo! - 1, day, 12)
        d.transactions!.push({
          id: uuid(), household_id: HID, category_id: catId[name], amount_ore: Math.round((min + r() * (max - min)) / 25) * 25,
          occurred_on: iso(at), description: desc, note: null, paid_by_kind: kind, paid_by_user_id: uid, source: 'manual',
          created_by: r() > 0.5 ? ME : WIFE, created_at: at.toISOString(), updated_at: at.toISOString(),
        })
      }
    }
  }

  // Kvitteringer
  const y1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
  const bilka = { id: uuid(), household_id: HID, category_id: catId.Mad, amount_ore: 63875, occurred_on: iso(y1), description: 'Bilka', note: null, paid_by_kind: 'member', paid_by_user_id: ME, source: 'receipt', created_by: ME, created_at: y1.toISOString(), updated_at: y1.toISOString() }
  d.transactions!.push(bilka)
  const rid = uuid()
  const path = `${HID}/${rid}.jpg`
  files.set(
    path,
    await drawReceipt([
      '              BILKA', '           Bilka Tilst', '  Tilst Skolevej 2, 8381 Tilst', '  CVR 35954716  Tlf 89306300', '',
      'MÆLK LETMÆLK 1L            11,95', 'RUGBRØD                    22,00', 'KAFFE 400G                 54,95', 'VASKEMIDDEL                49,95',
      'KYLLING 1,2KG              89,90', 'FRUGT OG GRØNT            410,00', 'SUBTOTAL                  638,75', 'HERAF MOMS                127,75',
      'TOTAL                     638,75', '', 'DANKORT        XXXX XXXX 1234', 'BELØB DKK                 638,75',
      `${pad(y1.getDate())}.${pad(y1.getMonth() + 1)}.${y1.getFullYear()}   14:32     KASSE 7`,
    ]),
  )
  d.receipts!.push({ id: rid, household_id: HID, status: 'approved', storage_path: path, transaction_id: bilka.id, retention: '30d', delete_at: new Date(y1.getFullYear(), y1.getMonth(), y1.getDate() + 30).toISOString(), image_deleted_at: null, uploaded_by: ME, approved_at: y1.toISOString(), created_at: y1.toISOString(), updated_at: y1.toISOString() })
  const old = new Date(now.getFullYear(), now.getMonth() - 2, 3, 12)
  const fotex = { id: uuid(), household_id: HID, category_id: catId.Mad, amount_ore: 41250, occurred_on: iso(old), description: 'Føtex', note: null, paid_by_kind: 'shared', paid_by_user_id: null, source: 'receipt', created_by: WIFE, created_at: old.toISOString(), updated_at: old.toISOString() }
  d.transactions!.push(fotex)
  const delAt = new Date(old.getFullYear(), old.getMonth(), old.getDate() + 30, 4).toISOString()
  d.receipts!.push({ id: uuid(), household_id: HID, status: 'approved', storage_path: null, transaction_id: fotex.id, retention: '30d', delete_at: delAt, image_deleted_at: delAt, uploaded_by: WIFE, approved_at: old.toISOString(), created_at: old.toISOString(), updated_at: old.toISOString() })

  seedHome(d, catId)
  return d
}

/** Demodata for kommende udgifter, opsparing, indkøb, opgaver og kalender */
function seedHome(d: Db, catId: Record<string, string>) {
  const t = today()
  const created = nowIso()
  const up = (title: string, amount: number, days: number, cat: string) =>
    d.upcoming_expenses!.push({ id: uuid(), household_id: HID, title, amount_ore: amount, due_on: addDays(t, days), category_id: catId[cat], note: null, status: 'upcoming', paid_at: null, transaction_id: null, created_by: ME, created_at: created, updated_at: created })
  up('Tandlæge', 120000, 6, 'Buffer')
  up('Bilservice', 250000, 13, 'Buffer')
  up('Fødselsdagsgave', 40000, 20, 'Hygge')

  const goal = (name: string, target: number, months: number | null, deposits: number[]) => {
    const id = uuid()
    d.savings_goals!.push({ id, household_id: HID, name, target_ore: target, target_date: months ? addDays(t, months * 30) : null, note: null, archived_at: null, created_by: ME, created_at: created, updated_at: created })
    deposits.forEach((a, i) => d.savings_movements!.push({ id: uuid(), household_id: HID, goal_id: id, kind: a > 0 ? 'deposit' : 'withdrawal', amount_ore: Math.abs(a), occurred_on: addDays(t, -30 * (deposits.length - i)), note: null, created_by: i % 2 ? WIFE : ME, created_at: created }))
  }
  goal('Ferie til Marokko', 2500000, 8, [500000, 300000, 300000, 250000])
  goal('Nødbuffer', 5000000, null, [2000000, 1000000])
  goal('Umrah', 6000000, 24, [400000, 400000])

  const list = uuid()
  d.shopping_lists!.push({ id: list, household_id: HID, name: 'Indkøb', created_at: created, updated_at: created })
  ;[['Mælk', '2 l', false, ME], ['Rugbrød', null, false, WIFE], ['Bleer str. 4', null, false, WIFE], ['Bananer', '1 bundt', true, ME], ['Kaffe', null, false, ME]].forEach(([name, qty, done, by], i) =>
    d.shopping_items!.push({ id: uuid(), household_id: HID, list_id: list, name, quantity: qty, note: null, is_checked: done, checked_by: done ? ME : null, checked_at: done ? created : null, added_by: by, sort_order: i, created_at: created, updated_at: created }),
  )

  const task = (title: string, days: number | null, prio: string, assignee: string | null, recurrence: string, status = 'open') =>
    d.household_tasks!.push({ id: uuid(), household_id: HID, title, description: null, assignee_id: assignee, due_on: days === null ? null : addDays(t, days), priority: prio, status, recurrence, recurrence_interval: 1, series_id: uuid(), previous_task_id: null, completed_at: null, completed_by: null, archived_at: null, created_by: ME, created_at: created, updated_at: created })
  task('Støvsuge', 1, 'normal', WIFE, 'weekly')
  task('Bestille service til bilen', 3, 'high', ME, 'none')
  task('Skifte filter i emhætten', 10, 'low', ME, 'monthly')
  task('Rengøre ovn', null, 'normal', null, 'none')

  const ev = (title: string, days: number, start: string | null, end: string | null, type: string, by: string, forUser: string | null) =>
    d.calendar_events!.push({ id: uuid(), household_id: HID, title, event_date: addDays(t, days), end_date: type === 'vacation' ? addDays(t, days + 6) : null, start_time: start, end_time: end, all_day: start === null, description: null, type, for_user_id: forUser, created_by: by, created_at: created, updated_at: created })
  ev('Lægetid – Adam', 2, '09:30', '10:00', 'doctor', ME, WIFE)
  ev('Middag hos svigerforældre', 5, '18:00', '21:00', 'family', ME, null)
  ev('Tandlæge', 8, '10:30', '11:00', 'doctor', WIFE, ME)
  ev('Efterårsferie', 12, null, null, 'vacation', ME, null)
}

function seedEmpty(): Db {
  return baseDb()
}

const ready: Promise<void> = (async () => {
  let mode: string | null = null
  try {
    if (location.hash === '#reset') {
      localStorage.removeItem(DB_KEY)
      localStorage.removeItem(FILES_KEY)
    }
    mode = localStorage.getItem(MODE_KEY)
  } catch {
    /* ignorér */
  }
  let stored: Db | null = null
  try {
    stored = JSON.parse(localStorage.getItem(DB_KEY) ?? 'null')
  } catch {
    /* ugyldige data – start forfra */
  }
  if (stored?.profiles) {
    db = { ...emptyDb(), ...stored }
    loadFiles()
  } else {
    db = mode === 'empty' ? seedEmpty() : await seedDemo()
    save()
    void saveFiles()
  }
})()

// ------------------------------------------------------------------ forretningslogik (spejler SQL)
const monthlyEq = (amount: number, f: string) => (f === 'quarterly' ? Math.round(amount / 3) : f === 'yearly' ? Math.round(amount / 12) : amount)

function fixedItemsMonth(month: string) {
  const m = month.slice(0, 8) + '01'
  const mo = Number(m.slice(5, 7))
  return db
    .fixed_items!.filter((i) => i.start_month <= m && (!i.end_month || i.end_month >= m))
    .map((i) => {
      const v = db.fixed_item_versions!.filter((x) => x.item_id === i.id && x.valid_from <= m).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
      if (!v) return null
      return {
        item_id: i.id, kind: i.kind, name: i.name, group_id: i.group_id, owner_kind: i.owner_kind, owner_user_id: i.owner_user_id,
        payment_day: i.payment_day, frequency: v.frequency, due_month: v.due_month, amount_ore: v.amount_ore,
        monthly_ore: monthlyEq(v.amount_ore, v.frequency),
        due_this_month: v.frequency === 'monthly' ? true : v.frequency === 'quarterly' ? (mo - v.due_month + 12) % 3 === 0 : mo === v.due_month,
        version_from: v.valid_from,
        _sort: i.sort_order,
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a._sort - b._sort)
    .map((x: any) => {
      const out = { ...x }
      delete out._sort
      return out
    })
}

function categoryBudgets(month: string) {
  const m = month.slice(0, 8) + '01'
  const available = fixedItemsMonth(m).reduce((s: number, f: any) => s + (f.kind === 'income' ? f.monthly_ore : -f.monthly_ore), 0)
  const base = db.budget_categories!.map((c) => {
    const archivedBefore = c.archived_at && c.archived_at.slice(0, 10) < m
    const d = db.budget_category_defaults!.filter((x) => x.category_id === c.id && x.valid_from <= m).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
    const o = db.monthly_budgets!.find((x) => x.category_id === c.id && x.month === m)
    return { id: c.id, mode: archivedBefore ? 'none' : (d?.mode ?? 'none'), percent_bp: d?.percent_bp ?? null, default_ore: d?.amount_ore ?? null, override_ore: archivedBefore ? null : (o?.amount_ore ?? null) }
  })
  const fixedAlloc = base.filter((b) => b.mode === 'amount').reduce((s, b) => s + (b.default_ore ?? 0), 0)
  const dist = Math.max(available - fixedAlloc, 0)
  const pct = base.filter((b) => b.mode === 'percent')
  const bp = pct.reduce((s, b) => s + (b.percent_bp ?? 0), 0)
  const raw = pct.map((b) => ({ id: b.id, raw: (dist * (b.percent_bp ?? 0)) / Math.max(bp, 10000) }))
  const floors = raw.map((x) => ({ ...x, fl: Math.floor(x.raw), frac: x.raw - Math.floor(x.raw) }))
  const target = Math.round((dist * Math.min(bp, 10000)) / 10000)
  let rest = target - floors.reduce((s, x) => s + x.fl, 0)
  ;[...floors].sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id)).forEach((x) => {
    if (rest > 0) {
      x.fl += 1
      rest--
    }
  })
  const pctOre = new Map(floors.map((x) => [x.id, x.fl]))
  return base.map((b) => ({
    category_id: b.id, mode: b.mode, percent_bp: b.percent_bp, default_ore: b.default_ore, override_ore: b.override_ore,
    effective_ore: b.override_ore ?? (b.mode === 'amount' ? (b.default_ore ?? 0) : b.mode === 'percent' ? (pctOre.get(b.id) ?? 0) : 0),
    budget_source: b.override_ore !== null ? 'override' : b.mode === 'amount' || b.mode === 'percent' ? 'default' : 'none',
  }))
}

function monthPlan(month: string) {
  const f = fixedItemsMonth(month) as any[]
  const inc = f.filter((x) => x.kind === 'income').reduce((s, x) => s + x.monthly_ore, 0)
  const exp = f.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.monthly_ore, 0)
  const cb = categoryBudgets(month)
  const fixedAlloc = cb.filter((x) => x.mode === 'amount').reduce((s, x) => s + (x.default_ore ?? 0), 0)
  const bp = cb.filter((x) => x.mode === 'percent').reduce((s, x) => s + (x.percent_bp ?? 0), 0)
  const allocated = cb.reduce((s, x) => s + x.effective_ore, 0)
  return [{ income_ore: inc, fixed_expenses_ore: exp, available_ore: inc - exp, fixed_allocations_ore: fixedAlloc, distributable_ore: Math.max(inc - exp - fixedAlloc, 0), percent_total_bp: bp, allocated_ore: allocated, unallocated_ore: inc - exp - allocated }]
}

function budgetMonthSummary(month: string) {
  const m = month.slice(0, 8) + '01'
  const next = addMonths(m, 1)
  const cb = new Map(categoryBudgets(m).map((x) => [x.category_id, x]))
  return db
    .budget_categories!.map((c) => {
      const b = cb.get(c.id)!
      const t = db.transactions!.filter((x) => x.category_id === c.id && x.occurred_on >= m && x.occurred_on < next)
      const include = (!c.archived_at || c.archived_at.slice(0, 10) >= m || t.length > 0) && (c.created_at.slice(0, 10) < next || b.budget_source !== 'none' || t.length > 0)
      return {
        include,
        row: {
          category_id: c.id, name: c.name, icon: c.icon, color: c.color, sort_order: c.sort_order, archived: Boolean(c.archived_at), kind: c.kind ?? 'spending',
          budget_ore: b.effective_ore, budget_source: b.budget_source, budget_mode: b.mode, percent_bp: b.percent_bp, default_ore: b.default_ore ?? 0,
          spent_ore: t.reduce((s, x) => s + x.amount_ore, 0), transaction_count: t.length,
        },
      }
    })
    .filter((x) => x.include)
    .map((x) => x.row)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || (a.kind === b.kind ? 0 : a.kind === 'spending' ? -1 : 1) || a.sort_order - b.sort_order)
}

function deleteAtFor(retention: string, customDate: string | null, base: Date): string | null {
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  if (retention === '30d') return new Date(b.getFullYear(), b.getMonth(), b.getDate() + 30).toISOString()
  if (retention === '3m') return new Date(b.getFullYear(), b.getMonth() + 3, b.getDate()).toISOString()
  if (retention === '6m') return new Date(b.getFullYear(), b.getMonth() + 6, b.getDate()).toISOString()
  if (retention === '1y') return new Date(b.getFullYear() + 1, b.getMonth(), b.getDate()).toISOString()
  if (retention === 'custom') return new Date(`${customDate}T00:00:00`).toISOString()
  return null
}

function nextDue(due: string, recurrence: string, interval: number): string {
  const [y, m, d] = due.split('-').map(Number)
  if (recurrence === 'daily') return iso(new Date(y!, m! - 1, d! + interval, 12))
  if (recurrence === 'weekly') return iso(new Date(y!, m! - 1, d! + 7 * interval, 12))
  if (recurrence === 'monthly') {
    const target = new Date(y!, m! - 1 + interval, 1, 12)
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    target.setDate(Math.min(d!, last))
    return iso(target)
  }
  return due
}

// ------------------------------------------------------------------ RPC
const rpcs: Record<string, (a: Row) => unknown> = {
  current_household_id: () => HID,
  budget_month_summary: (a) => budgetMonthSummary(a.p_month),
  month_plan: (a) => monthPlan(a.p_month),
  fixed_items_month: (a) => fixedItemsMonth(a.p_month),
  create_budget_category: (a) => {
    if (db.budget_categories!.some((c) => !c.archived_at && c.name.toLowerCase() === String(a.p_name).toLowerCase())) throw new PgError('duplicate', '23505', 409)
    const c = { id: uuid(), household_id: HID, name: a.p_name, icon: a.p_icon, color: a.p_color, kind: a.p_kind ?? 'spending', sort_order: db.budget_categories!.length, archived_at: null, created_by: ME, created_at: nowIso(), updated_at: nowIso() }
    db.budget_categories!.push(c)
    const vf = a.p_valid_from ? a.p_valid_from.slice(0, 8) + '01' : curMonth()
    if (a.p_mode === 'percent' && a.p_percent_bp != null)
      db.budget_category_defaults!.push({ id: uuid(), household_id: HID, category_id: c.id, valid_from: vf, mode: 'percent', amount_ore: null, percent_bp: a.p_percent_bp, created_by: ME, created_at: nowIso(), updated_at: nowIso() })
    else if (a.p_default_amount_ore != null)
      db.budget_category_defaults!.push({ id: uuid(), household_id: HID, category_id: c.id, valid_from: vf, mode: 'amount', amount_ore: a.p_default_amount_ore, percent_bp: null, created_by: ME, created_at: nowIso(), updated_at: nowIso() })
    return c.id
  },
  set_category_default: (a) => {
    const vf = String(a.p_valid_from).slice(0, 8) + '01'
    if (vf < curMonth()) throw new PgError('Standardbudgettet kan kun ændres fra indeværende måned og frem', '23514')
    const mode = a.p_mode ?? 'amount'
    const values = { mode, amount_ore: mode === 'amount' ? a.p_amount_ore : null, percent_bp: mode === 'percent' ? a.p_percent_bp : null }
    const ex = db.budget_category_defaults!.find((x) => x.category_id === a.p_category_id && x.valid_from === vf)
    if (ex) Object.assign(ex, values)
    else db.budget_category_defaults!.push({ id: uuid(), household_id: HID, category_id: a.p_category_id, valid_from: vf, ...values, created_by: ME, created_at: nowIso(), updated_at: nowIso() })
    return null
  },
  set_monthly_budget: (a) => {
    const m = String(a.p_month).slice(0, 8) + '01'
    db.monthly_budgets = db.monthly_budgets!.filter((o) => !(o.category_id === a.p_category_id && o.month === m))
    if (a.p_amount_ore != null) db.monthly_budgets!.push({ id: uuid(), household_id: HID, category_id: a.p_category_id, month: m, amount_ore: a.p_amount_ore })
    return null
  },
  create_default_fixed_groups: () => {
    GROUPS.forEach((name, i) => {
      if (!db.fixed_groups!.some((g) => !g.archived_at && g.name.toLowerCase() === name.toLowerCase()))
        db.fixed_groups!.push({ id: uuid(), household_id: HID, name, sort_order: i, archived_at: null, created_by: ME, created_at: nowIso(), updated_at: nowIso() })
    })
    return null
  },
  create_fixed_item: (a) => {
    const sm = a.p_start_month ? String(a.p_start_month).slice(0, 8) + '01' : curMonth()
    if (sm < curMonth()) throw new PgError('En ny fast post kan tidligst gælde fra denne måned', '23514')
    const id = uuid()
    db.fixed_items!.push({
      id, household_id: HID, kind: a.p_kind, name: String(a.p_name).trim(), group_id: a.p_kind === 'expense' ? a.p_group_id : null,
      owner_kind: a.p_kind === 'income' ? (a.p_owner_kind ?? 'shared') : null, owner_user_id: a.p_kind === 'income' && a.p_owner_kind === 'member' ? a.p_owner_user_id : null,
      payment_day: a.p_payment_day ?? null, note: a.p_note ?? null, sort_order: db.fixed_items!.length, start_month: sm, end_month: null, archived_at: null,
      created_by: ME, created_at: nowIso(), updated_at: nowIso(),
    })
    db.fixed_item_versions!.push({ id: uuid(), household_id: HID, item_id: id, valid_from: sm, amount_ore: a.p_amount_ore, frequency: a.p_frequency ?? 'monthly', due_month: (a.p_frequency ?? 'monthly') === 'monthly' ? null : a.p_due_month, created_by: ME, created_at: nowIso(), updated_at: nowIso() })
    return id
  },
  set_fixed_item_amount: (a) => {
    const vf = String(a.p_valid_from).slice(0, 8) + '01'
    if (vf < curMonth()) throw new PgError('Beløbet kan kun ændres fra indeværende måned og frem', '23514')
    const values = { amount_ore: a.p_amount_ore, frequency: a.p_frequency ?? 'monthly', due_month: (a.p_frequency ?? 'monthly') === 'monthly' ? null : a.p_due_month }
    const ex = db.fixed_item_versions!.find((x) => x.item_id === a.p_item_id && x.valid_from === vf)
    if (ex) Object.assign(ex, values)
    else db.fixed_item_versions!.push({ id: uuid(), household_id: HID, item_id: a.p_item_id, valid_from: vf, ...values, created_by: ME, created_at: nowIso(), updated_at: nowIso() })
    return null
  },
  create_pending_receipt: () => {
    const id = uuid()
    const path = `${HID}/${id}.jpg`
    db.receipts!.push({ id, household_id: HID, status: 'pending', storage_path: path, transaction_id: null, retention: null, delete_at: null, image_deleted_at: null, uploaded_by: ME, approved_at: null, created_at: nowIso(), updated_at: nowIso() })
    return [{ receipt_id: id, storage_path: path }]
  },
  suggest_category: (a) => {
    const m = db.transactions!.filter((t) => t.description.toLowerCase().trim() === String(a.p_merchant).toLowerCase().trim() && !db.budget_categories!.find((c) => c.id === t.category_id)?.archived_at)
    const counts = new Map<string, number>()
    for (const t of m) counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1)
    return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
  },
  approve_receipt: (a) => {
    const r = db.receipts!.find((x) => x.id === a.p_receipt_id)
    if (!r) throw new PgError('Kvitteringen findes ikke', 'P0002')
    if (r.status === 'approved') return r.transaction_id
    if (!files.has(r.storage_path)) throw new PgError('Billedet er ikke uploadet endnu', '23514')
    const t = insertTransaction({ category_id: a.p_category_id, amount_ore: a.p_amount_ore, occurred_on: a.p_occurred_on, description: String(a.p_description).trim(), note: a.p_note, paid_by_kind: a.p_paid_by_kind, paid_by_user_id: a.p_paid_by_kind === 'member' ? a.p_paid_by_user_id : null, source: 'receipt' })
    Object.assign(r, { status: 'approved', transaction_id: t.id, retention: a.p_retention, delete_at: deleteAtFor(a.p_retention, a.p_custom_date, new Date()), approved_at: nowIso() })
    return t.id
  },
  set_receipt_retention: (a) => {
    const r = db.receipts!.find((x) => x.id === a.p_receipt_id)
    if (!r) throw new PgError('Kvitteringen findes ikke', 'P0002')
    r.retention = a.p_retention
    r.delete_at = deleteAtFor(a.p_retention, a.p_custom_date, new Date(r.approved_at))
    return r.delete_at
  },
  delete_transaction: (a) => {
    const r = db.receipts!.find((x) => x.transaction_id === a.p_transaction_id)
    db.receipts = db.receipts!.filter((x) => x !== r)
    for (const u of db.upcoming_expenses!) if (u.transaction_id === a.p_transaction_id) Object.assign(u, { transaction_id: null })
    db.transactions = db.transactions!.filter((t) => t.id !== a.p_transaction_id)
    return r?.storage_path ?? null
  },
  set_upcoming_status: (a) => {
    const u = db.upcoming_expenses!.find((x) => x.id === a.p_id)
    if (!u) throw new PgError('Udgiften findes ikke', 'P0002')
    if (a.p_status === 'paid') {
      if (u.status === 'paid') return u.transaction_id
      let tid = null
      if (a.p_register) {
        const t = insertTransaction({ category_id: u.category_id, amount_ore: a.p_amount_ore ?? u.amount_ore, occurred_on: a.p_paid_on ?? today(), description: u.title, note: u.note, paid_by_kind: a.p_paid_by_kind ?? 'shared', paid_by_user_id: a.p_paid_by_kind === 'member' ? a.p_paid_by_user_id : null, source: 'upcoming' })
        tid = t.id
      }
      Object.assign(u, { status: 'paid', paid_at: nowIso(), transaction_id: tid })
      return tid
    }
    if (u.transaction_id) throw new PgError('Udgiften er registreret. Fortryd betalingen først.', '23514')
    Object.assign(u, { status: a.p_status, paid_at: null })
    return null
  },
  undo_upcoming_payment: (a) => {
    const u = db.upcoming_expenses!.find((x) => x.id === a.p_id)
    if (!u) throw new PgError('Udgiften findes ikke', 'P0002')
    if (u.status !== 'paid') return null
    const tid = u.transaction_id
    Object.assign(u, { status: 'upcoming', paid_at: null, transaction_id: null })
    if (tid) db.transactions = db.transactions!.filter((t) => !(t.id === tid && t.source === 'upcoming'))
    return null
  },
  savings_goal_progress: () =>
    db.savings_goals!.map((g) => {
      const mv = db.savings_movements!.filter((m) => m.goal_id === g.id)
      const cur = mv.reduce((s, m) => s + (m.kind === 'deposit' ? m.amount_ore : -m.amount_ore), 0)
      return { goal_id: g.id, current_ore: cur, movement_count: mv.length, last_movement_on: mv.map((m) => m.occurred_on).sort().at(-1) ?? null }
    }),
  ensure_shopping_list: () => {
    let l = db.shopping_lists!.find((x) => !x.archived_at)
    if (!l) {
      l = { id: uuid(), household_id: HID, name: 'Indkøb', sort_order: 0, archived_at: null, created_at: nowIso(), updated_at: nowIso() }
      db.shopping_lists!.push(l)
    }
    return l.id
  },
  set_task_status: (a) => {
    const task = db.household_tasks!.find((x) => x.id === a.p_task_id)
    if (!task) throw new PgError('Opgaven findes ikke', 'P0002')
    if (a.p_status === 'done') {
      if (task.status !== 'done') Object.assign(task, { status: 'done', completed_at: nowIso(), completed_by: ME })
      if (task.recurrence === 'none') return null
      let next = db.household_tasks!.find((x) => x.previous_task_id === task.id)
      if (!next) {
        next = { ...task, id: uuid(), status: 'open', completed_at: null, completed_by: null, previous_task_id: task.id, due_on: nextDue(task.due_on ?? today(), task.recurrence, task.recurrence_interval ?? 1), created_at: nowIso(), updated_at: nowIso() }
        db.household_tasks!.push(next)
      }
      return next.id
    }
    if (task.status === 'done') db.household_tasks = db.household_tasks!.filter((x) => !(x.previous_task_id === task.id && x.status === 'open'))
    Object.assign(task, { status: a.p_status, completed_at: null, completed_by: null })
    return null
  },
  export_household_data: () => {
    const out: Row = { exported_at: nowIso(), household: { id: HID, name: 'Vores hjem' } }
    for (const t of TABLES) out[t] = db[t]
    return out
  },
}

function insertTransaction(v: Row): Row {
  if (db.budget_categories!.find((c) => c.id === v.category_id)?.archived_at) throw new PgError('Kategorien er arkiveret', '23514')
  const t = { id: uuid(), household_id: HID, note: null, paid_by_user_id: null, created_by: ME, created_at: nowIso(), updated_at: nowIso(), ...v }
  db.transactions!.push(t)
  return t
}

// Standardværdier som i databasen (DEFAULT-kolonner)
const DEFAULTS: Record<string, () => Row> = {
  upcoming_expenses: () => ({ status: 'upcoming', paid_at: null, transaction_id: null, note: null }),
  savings_goals: () => ({ archived_at: null, color: '#0c9467', note: null, target_date: null }),
  savings_movements: () => ({ occurred_on: today(), note: null }),
  budget_categories: () => ({ kind: 'spending', archived_at: null, icon: 'sparkles', color: '#6d5cff', sort_order: 0 }),
  fixed_groups: () => ({ archived_at: null, sort_order: 0 }),
  shopping_items: () => ({ is_checked: false, checked_by: null, checked_at: null, note: null, quantity: null, sort_order: 0 }),
  household_tasks: () => ({ status: 'open', priority: 'normal', recurrence: 'none', recurrence_interval: 1, completed_at: null, completed_by: null, previous_task_id: null, archived_at: null, description: null, assignee_id: null, due_on: null }),
  calendar_events: () => ({ start_time: null, end_time: null, end_date: null, all_day: false, description: null, type: 'family', for_user_id: null }),
  transactions: () => ({ note: null, paid_by_kind: 'shared', paid_by_user_id: null, source: 'manual' }),
}

// ------------------------------------------------------------------ PostgREST-filtre
function filterRows(rows: Row[], params: URLSearchParams) {
  let out = [...rows]
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue
    const dot = v.indexOf('.')
    const op = v.slice(0, dot)
    const val = v.slice(dot + 1)
    out = out.filter((r) => {
      if (op === 'eq') return String(r[k]) === val
      if (op === 'neq') return String(r[k]) !== val
      if (op === 'gte') return r[k] >= val
      if (op === 'gt') return r[k] > val
      if (op === 'lte') return r[k] <= val
      if (op === 'lt') return r[k] < val
      if (op === 'is') return val === 'null' ? r[k] === null || r[k] === undefined : String(r[k]) === val
      if (op === 'not') return val === 'is.null' ? r[k] !== null && r[k] !== undefined : true
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/"/g, '')).includes(String(r[k]))
      return true
    })
  }
  const order = params.get('order')
  if (order)
    for (const o of order.split(',').reverse()) {
      const [col, dir, nulls] = o.split('.')
      out.sort((a, b) => {
        const av = a[col!]
        const bv = b[col!]
        if (av == null || bv == null) return av == bv ? 0 : (av == null ? 1 : -1) * (nulls === 'nullsfirst' ? -1 : 1)
        return (dir === 'desc' ? -1 : 1) * (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv)))
      })
    }
  if (params.get('offset')) out = out.slice(Number(params.get('offset')))
  if (params.get('limit')) out = out.slice(0, Number(params.get('limit')))
  return out
}

function withEmbeds(table: string, rows: Row[], select: string | null) {
  if (table === 'shopping_items' || !select?.includes('(')) return rows
  return rows
}

// ------------------------------------------------------------------ fetch
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const empty = (status = 204) => new Response(null, { status })
const FAR = Math.floor(Date.now() / 1000) + 3600 * 24 * 365
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, exp: FAR, role: 'authenticated', aud: 'authenticated' })}.demo`
const user = { id: ME, email: 'hamza@demo.dk', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: FAR, refresh_token: 'demo', user }

async function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  await ready
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const p = url.pathname
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const accept = headers.get('accept') ?? ''
  const prefer = headers.get('prefer') ?? ''
  let body: any = null
  if (typeof init.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body)
    } catch {
      body = null
    }
  }
  await new Promise((r) => setTimeout(r, 60))

  try {
    // ---------------- Auth
    if (p === '/auth/v1/token') return json(session)
    if (p === '/auth/v1/user') return json(user)
    if (p === '/auth/v1/logout') return empty()
    if (p === '/auth/v1/recover') return json({})
    if (p === '/auth/v1/verify') return body?.token === '123456' ? json(session) : json({ code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)

    // ---------------- Husstand
    if (p === '/rest/v1/household_members') {
      if (url.searchParams.get('select') === 'household_id') return json([{ household_id: HID }])
      return json(db.profiles!.map((pr, i) => ({ user_id: pr.id, role: 'owner', created_at: `2026-01-0${i + 1}`, profiles: { display_name: pr.display_name, color: pr.color, default_paid_by: pr.default_paid_by } })))
    }

    // ---------------- RPC
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = rpcs[p.slice('/rest/v1/rpc/'.length)]
      if (!fn) return json({ code: '42883', message: `Ukendt funktion ${p}` }, 404)
      const result = fn(body ?? {})
      save()
      return result === null || result === undefined ? json(null) : json(result)
    }

    // ---------------- Storage
    if (p.startsWith('/storage/v1/object/receipts/') && method === 'POST') {
      const path = decodeURIComponent(p.slice('/storage/v1/object/receipts/'.length))
      if (!db.receipts!.some((r) => r.storage_path === path && r.status === 'pending')) return json({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 403)
      let blob: Blob | null = null
      if (init.body instanceof FormData) for (const v of init.body.values()) if (typeof v !== 'string') blob = v
      if (init.body instanceof Blob) blob = init.body
      if (!blob) return json({ statusCode: '400', error: 'Bad', message: 'no file' }, 400)
      files.set(path, blob)
      void saveFiles()
      return json({ Key: `receipts/${path}`, Id: uuid() })
    }
    if (p === '/storage/v1/object/receipts' && method === 'DELETE') {
      for (const x of (body?.prefixes ?? []) as string[]) {
        const approved = db.receipts!.some((r) => r.storage_path === x && r.status === 'approved')
        if (!approved) files.delete(x)
      }
      void saveFiles()
      return json([])
    }

    // ---------------- Tabeller (generisk PostgREST)
    const table = p.replace('/rest/v1/', '')
    const rows = db[table]
    if (rows) {
      if (method === 'GET') {
        const out = withEmbeds(table, filterRows(rows, url.searchParams), url.searchParams.get('select'))
        return json(accept.includes('object') ? (out[0] ?? null) : out)
      }
      if (method === 'POST') {
        const list = (Array.isArray(body) ? body : [body]).map((b: Row): Row => ({
          id: uuid(), created_at: nowIso(), updated_at: nowIso(),
          ...(table === 'shopping_items' ? { added_by: ME } : { created_by: ME }),
          ...(DEFAULTS[table]?.() ?? {}),
          ...b,
        }))
        for (const row of list) {
          if (table === 'transactions' && db.budget_categories!.find((c) => c.id === row.category_id)?.archived_at) throw new PgError('Kategorien er arkiveret', '23514')
          if (table === 'fixed_groups' && db.fixed_groups!.some((g) => !g.archived_at && g.name.toLowerCase() === String(row.name).toLowerCase())) throw new PgError('duplicate', '23505', 409)
          if (table === 'savings_movements' && row.kind === 'withdrawal') {
            const bal = db.savings_movements!.filter((m) => m.goal_id === row.goal_id).reduce((s2, m) => s2 + (m.kind === 'deposit' ? m.amount_ore : -m.amount_ore), 0)
            if (bal - row.amount_ore < 0) throw new PgError('Saldoen kan ikke blive negativ', '23514')
          }
          rows.push(row)
        }
        save()
        if (prefer.includes('return=minimal')) return empty(201)
        return json(accept.includes('object') ? list[0] : list, 201)
      }
      if (method === 'PATCH') {
        const hit = filterRows(rows, url.searchParams)
        for (const r of hit) {
          if (table === 'shopping_items' && body && 'is_checked' in body && body.is_checked !== r.is_checked)
            Object.assign(r, body.is_checked ? { checked_by: ME, checked_at: nowIso() } : { checked_by: null, checked_at: null })
          Object.assign(r, body, { updated_at: nowIso() })
        }
        save()
        return prefer.includes('return=representation') ? json(accept.includes('object') ? hit[0] : hit) : empty()
      }
      if (method === 'DELETE') {
        let hit = filterRows(rows, url.searchParams)
        // RLS-lignende regler
        if (table === 'receipts') hit = hit.filter((r) => r.status === 'pending')
        if (table === 'fixed_items') hit = hit.filter((r) => r.start_month >= curMonth())
        if (table === 'savings_goals' || table === 'budget_categories' || table === 'fixed_groups') hit = []
        if (table === 'savings_movements')
          for (const m of hit.filter((x) => x.kind === 'deposit')) {
            const bal = db.savings_movements!.filter((x) => x.goal_id === m.goal_id && x.id !== m.id).reduce((s2, x) => s2 + (x.kind === 'deposit' ? x.amount_ore : -x.amount_ore), 0)
            if (bal < 0) throw new PgError('Saldoen kan ikke blive negativ', '23514')
          }
        if (table === 'transactions' && hit.some((t) => db.receipts!.some((r) => r.transaction_id === t.id))) throw new PgError('fk', '23503', 409)
        const del = new Set(hit.map((r) => r.id))
        db[table] = rows.filter((r) => !del.has(r.id))
        if (table === 'fixed_items') db.fixed_item_versions = db.fixed_item_versions!.filter((v) => !del.has(v.item_id))
        save()
        return new Response(null, { status: 204, headers: { 'content-range': `*/${del.size}` } })
      }
    }
    return json({ message: `Ikke understøttet i demo: ${method} ${p}` }, 404)
  } catch (e) {
    if (e instanceof PgError) return json({ code: e.code, message: e.message, details: null, hint: null }, e.status)
    return json({ code: 'XX000', message: String(e) }, 500)
  }
}

// Log automatisk ind første gang, så demoen åbner direkte på forsiden
try {
  if (!authStorage.getItem('hjem.auth')) authStorage.setItem('hjem.auth', JSON.stringify(session))
} catch {
  /* ignorér */
}

export const supabase = createClient<Database>(URL_BASE, 'demo-anon-key', {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hjem.auth', storage: authStorage },
  global: { fetch: demoFetch as typeof fetch },
  realtime: { params: { eventsPerSecond: 0 } },
})

// Billeder vises via lokale blob-URL'er i stedet for signerede URL'er
const objectUrls = new Map<string, string>()
const origFrom = supabase.storage.from.bind(supabase.storage)
;(supabase.storage as { from: (b: string) => ReturnType<typeof origFrom> }).from = (bucket: string) => {
  const api = origFrom(bucket)
  api.createSignedUrls = (async (paths: string[]) => {
    await ready
    return {
      data: paths.map((path) => {
        const f = files.get(path)
        if (f && !objectUrls.has(path)) objectUrls.set(path, URL.createObjectURL(f))
        return { path, signedUrl: objectUrls.get(path) ?? '', signedURL: objectUrls.get(path) ?? '', error: f ? null : 'not found' }
      }),
      error: null,
    }
  }) as unknown as typeof api.createSignedUrls
  return api
}

// Realtime i demoen: ændringer i samme browser udløser "postgres_changes"-lignende kald
;(supabase as any).channel = (name: string) => {
  const handlers: Array<() => void> = []
  const ch: any = {
    on: (_type: string, _filter: unknown, cb: () => void) => {
      handlers.push(cb)
      return ch
    },
    subscribe: () => {
      const l = () => handlers.forEach((h) => h())
      listeners.add(l)
      ch._unsub = () => listeners.delete(l)
      return ch
    },
    unsubscribe: () => ch._unsub?.(),
    topic: name,
  }
  return ch
}
;(supabase as any).removeChannel = (ch: any) => ch?._unsub?.()
