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
import { isDueOn, periodKey } from '@/lib/allowance'
import { isValidName, isValidPin, normalizeUsername, USERNAME_RE } from '../../supabase/functions/_shared/child-rules'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Db = Record<string, Row[]>

const URL_BASE = 'http://demo.local'
export const HID = '11111111-1111-4111-8111-111111111111'
export const ME = '00000000-0000-4000-8000-0000000000a1'
export const WIFE = '00000000-0000-4000-8000-0000000000a2'
const DB_KEY = 'hjem-demo-db-v9'
const FILES_KEY = 'hjem-demo-files-v2'
const MODE_KEY = 'hjem-demo-mode' // 'empty' = start uden demodata (bruges af tests)
const KIDS_KEY = 'hjem-demo-kids' // '1' = husstanden har to børn (Noah og Lina)
const BILLING_KEY = 'hjem-demo-billing' // 'trial' | 'trial-ending' | 'expired' = betaling slået til (standard: slået fra)
const AS_KEY = 'hjem-demo-as' // bruger-id der er logget ind (standard: Hamza)
/** Ny bruger uden husstand (tilmeldingstests) */
export const NEWUSER = '00000000-0000-4000-8000-0000000000a9'
export const KID1 = '00000000-0000-4000-8000-0000000000b1'
export const KID2 = '00000000-0000-4000-8000-0000000000b2'
const readLs = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
/** Brugeren der logges ind automatisk, når demoen åbnes (standard: Hamza) */
const DEFAULT_USER: string = readLs(AS_KEY) ?? ME
/** Den indloggede bruger for den aktuelle forespørgsel (alle "auth.uid()" i demoen). Sættes ud fra JWT'en. */
let CUR: string = DEFAULT_USER
export const DEMO_LOGIN_CODE = 'HJEM42'

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
  'recipes',
  'recipe_ingredients',
  'meal_plan_entries',
  'ingredient_prices',
  'household_members',
  'child_savings_goals',
  'child_wallet_transactions',
  'child_allowance_schedules',
  'child_allowance_payouts',
  'income_entries',
  'bank_transactions',
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
  d.households = [{ id: HID, name: 'Vores hjem', default_receipt_retention: '30d', grocery_category_id: null, created_at: created, updated_at: created }]
  d.profiles = [
    { id: ME, display_name: 'Hamza', color: null, default_paid_by: 'me', notify_calendar: true, notify_shopping: true, created_at: created, updated_at: created },
    { id: WIFE, display_name: 'Sumaya', color: null, default_paid_by: 'me', notify_calendar: true, notify_shopping: true, created_at: created, updated_at: created },
  ]
  d.household_members = [
    { household_id: HID, user_id: ME, role: 'owner', child_username: null, disabled_at: null, created_at: '2026-01-01T00:00:00Z' },
    { household_id: HID, user_id: WIFE, role: 'adult', child_username: null, disabled_at: null, created_at: '2026-01-02T00:00:00Z' },
  ]
  // Private tabeller (kan ikke hentes via REST – se demoFetch)
  d['private.login_codes'] = [{ household_id: HID, code: DEMO_LOGIN_CODE }]
  d['private.child_credentials'] = []
  d['private.login_throttle'] = []
  if (readLs(KIDS_KEY) === '1')
    for (const [i, [id, name]] of ([[KID1, 'Noah'], [KID2, 'Lina']] as const).entries()) {
      d.profiles.push({ id, display_name: name, color: null, default_paid_by: 'me', notify_calendar: true, notify_shopping: true, created_at: created, updated_at: created })
      d.household_members.push({ household_id: HID, user_id: id, role: 'child', child_username: name.toLowerCase(), disabled_at: null, created_at: `2026-01-0${i + 3}T00:00:00Z` })
    }
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
  d.households![0]!.grocery_category_id = catId.Mad

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
    d.calendar_events!.push({ id: uuid(), household_id: HID, title, event_date: addDays(t, days), end_date: type === 'vacation' ? addDays(t, days + 6) : null, start_time: start, end_time: end, all_day: start === null, description: null, type, participant_ids: forUser ? [forUser] : [], for_user_id: forUser, reminder_minutes: start === null ? null : 60, created_by: by, created_at: created, updated_at: created })
  ev('Lægetid – Adam', 2, '09:30', '10:00', 'doctor', ME, WIFE)
  ev('Middag hos svigerforældre', 5, '18:00', '21:00', 'family', ME, null)
  ev('Tandlæge', 8, '10:30', '11:00', 'doctor', WIFE, ME)
  ev('Efterårsferie', 12, null, null, 'vacation', ME, null)

  // Madplan: et par opskrifter og denne uges aftensmad
  const recipe = (name: string, category: string, servings: number, minutes: number, tags: string[], fav: boolean, ings: Array<[string, number | null, string | null]>) => {
    const id = uuid()
    d.recipes!.push({ id, household_id: HID, name, description: null, servings, prep_minutes: minutes, steps: '1. Forbered ingredienserne.\n2. Tilbered retten.', category, tags, is_favorite: fav, note: null, archived_at: null, created_by: ME, created_at: created, updated_at: created })
    ings.forEach(([n, a, u], i) => d.recipe_ingredients!.push({ id: uuid(), household_id: HID, recipe_id: id, sort_order: i, name: n, amount_milli: a, unit: u, note: null, created_at: created }))
    return { id, name, servings }
  }
  const karry = recipe('Kylling i karry', 'Kylling', 4, 40, ['Børnevenlig', 'Halal'], true, [['Kyllingebryst', 700000, 'g'], ['Ris', 400000, 'g'], ['Løg', 2000, 'stk'], ['Karry', 2000, 'tsk'], ['Salt', null, null]])
  const bolognese = recipe('Pasta bolognese', 'Pasta', 4, 30, ['Hurtig', 'Børnevenlig'], false, [['Hakket oksekød', 500000, 'g'], ['Pasta', 500000, 'g'], ['Hakkede tomater', 2000, 'dåse'], ['Løg', 1000, 'stk']])
  recipe('Linsesuppe', 'Suppe', 4, 35, ['Vegetar', 'Fryseegnet'], false, [['Røde linser', 300000, 'g'], ['Gulerødder', 3000, 'stk'], ['Løg', 1000, 'stk']])
  const monday = (() => {
    const dt = new Date()
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
    return iso(dt)
  })()
  const plan = (day: number, title: string, r: { id: string; servings: number } | null) =>
    d.meal_plan_entries!.push({ id: uuid(), household_id: HID, plan_date: addDays(monday, day), meal: 'dinner', recipe_id: r?.id ?? null, title, servings: r?.servings ?? null, note: null, sort_order: 0, created_by: ME, created_at: created, updated_at: created })
  plan(0, karry.name, karry)
  plan(1, bolognese.name, bolognese)
  plan(2, 'Rester', null)
}

function seedEmpty(): Db {
  return baseDb()
}

/** 'fresh': ingen husstand endnu – brugerne skal oprette eller tage imod en invitation */
function seedFresh(): Db {
  const d = baseDb()
  d.households = []
  d.household_members = []
  d['private.login_codes'] = []
  d.profiles!.push({ id: NEWUSER, display_name: 'ny', color: null, default_paid_by: 'me', notify_calendar: true, notify_shopping: true, created_at: nowIso(), updated_at: nowIso() })
  return d
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
    db = mode === 'fresh' ? seedFresh() : mode === 'empty' ? seedEmpty() : await seedDemo()
    // Demo-børn kan logge ind: HJEM42 + noah/lina + PIN
    if (readLs(KIDS_KEY) === '1')
      db['private.child_credentials'] = [
        { user_id: KID1, pin_hash: await pinHash('482611'), pin_length: 6, pin_view: '482611' },
        { user_id: KID2, pin_hash: await pinHash('7395'), pin_length: 4, pin_view: '7395' },
      ]
    save()
    void saveFiles()
  }
  // Som det daglige udbetalingsjob (pg_cron) i rigtig drift (efter at modulet er indlæst)
  await Promise.resolve()
  runAllowances()
  save()
})()

// ------------------------------------------------------------------ roller (spejler RLS)
/** Aktivt medlemskab (tidligere medlemmer har left_at) */
const activeMember = (uid: string) => db.household_members!.find((m) => m.user_id === uid && !m.left_at)
const roleOf = (uid: string) => activeMember(uid)?.role as string | undefined
const isAdult = () => roleOf(CUR) !== 'child'
/** Hvad et barn må læse. Alt andet er usynligt for børn (som i databasen). */
const CHILD_READ: Record<string, (r: Row) => boolean> = {
  households: () => true,
  profiles: () => true,
  household_members: () => true,
  meal_plan_entries: () => true,
  recipes: () => true,
  recipe_ingredients: () => true,
  household_tasks: (r) => r.assignee_id === CUR,
  calendar_events: (r) => (r.participant_ids ?? []).length === 0 || r.participant_ids.includes(CUR),
  child_wallet_transactions: (r) => r.child_id === CUR,
  child_savings_goals: (r) => r.child_id === CUR,
}
// Uden aktivt medlemskab ses intet (som i databasen)
const isDisabled = (uid: string) => {
  const m = activeMember(uid)
  return !m || Boolean(m.disabled_at)
}
// Deaktiverede medlemmer ser intet (som i databasen)
const visibleRows = (table: string, rows: Row[]) =>
  isDisabled(CUR)
    ? table === 'profiles' ? rows.filter((r) => r.id === CUR) : []
    : table === 'bank_transactions' // kun egne bankposteringer
      ? isAdult() ? rows.filter((r) => r.user_id === CUR) : []
      : isAdult() ? rows : rows.filter((r) => CHILD_READ[table]?.(r) ?? false)

// ------------------------------------------------------------------ barnelogin (spejler child_login_verify m.fl.)
async function pinHash(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`demo-salt:${pin}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const credentials = () => db['private.child_credentials']!
const throttle = () => db['private.login_throttle']!
const loginCode = () => db['private.login_codes']![0]!.code as string
const isOwner = () => roleOf(CUR) === 'owner' && !isDisabled(CUR)
const rlsError = () => new PgError('new row violates row-level security policy', '42501', 403)

// ------------------------------------------------------------------ tilmelding (spejler household_create, invite_* m.fl.)
// ------------------------------------------------------------------ abonnement (spejler subscription_info / has_write_access)
function subscription(): Row {
  const mode = readLs(BILLING_KEY)
  const stored = db['private.subscription']?.[0]
  if (stored) return stored
  const days = mode === 'expired' ? -1 : mode === 'trial-ending' ? 3 : 30
  const sub = { billing_enabled: Boolean(mode), status: 'trialing', plan: null, trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString(), current_period_end: null, cancel_at_period_end: false, payer_user_id: null, has_customer: false }
  db['private.subscription'] = [sub]
  return sub
}
const writeAccess = () => {
  const s = subscription()
  return !s.billing_enabled || s.status === 'active' || s.status === 'comped' || (s.trial_ends_at && s.trial_ends_at > nowIso())
}
const readOnlyError = () => new PgError('Abonnementet er udløbet. I kan se og eksportere jeres data, men ikke ændre noget, før abonnementet er fornyet.', 'PT402', 402)

// ------------------------------------------------------------------ bank (spejler bank_* funktionerne)
const bankConnections = () => (db['private.bank_connections'] ??= [])
const bankRules = () => (db['private.bank_rules'] ??= [])
const merchantKey = (b: Row) => String(b.counterparty || b.description).toLowerCase().replace(/[0-9#*/.,:-]+/g, ' ').replace(/\s+/g, ' ').trim()
/** Som bank_auto_income: indtægter (undtagen MobilePay) godkendes automatisk efter hentningen */
function demoAutoIncome() {
  if (!writeAccess()) return 0
  let n = 0
  for (const b of db.bank_transactions!)
    if (b.user_id === CUR && b.state === 'new' && b.amount_ore > 0 && !/mobile ?pay|mobilpay/.test(`${b.counterparty ?? ''} ${b.description ?? ''}`.toLowerCase())) {
      const id = uuid()
      db.income_entries!.push({ id, household_id: HID, amount_ore: b.amount_ore, received_on: b.booked_on, description: b.counterparty || b.description, note: null, received_by_kind: 'member', received_by_user_id: b.user_id, source: 'bank', created_by: b.user_id, created_at: nowIso(), updated_at: nowIso() })
      Object.assign(b, { state: 'imported', income_id: id })
      n++
    }
  return n
}
function demoImportExpense(b: Row, category: string, descr: string | null) {
  const t = insertTransaction({ category_id: category, amount_ore: -b.amount_ore, occurred_on: b.booked_on, description: descr || b.counterparty || b.description, note: null, paid_by_kind: 'member', paid_by_user_id: b.user_id, source: 'bank' })
  Object.assign(b, { state: 'imported', transaction_id: t.id })
  return t
}
function demoBankIngest(conn: Row) {
  const d = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
  const cat = db.budget_categories!.find((c) => c.name === 'Dagligvarer' && !c.archived_at)?.id ?? null
  const rows = [
    { key: 'netto', booked_on: d(0), amount_ore: -14995, description: 'NETTO 1234 AARHUS C', counterparty: 'Netto', state: 'new', suggested_category_id: cat },
    { key: 'netto2', booked_on: d(0), amount_ore: -5000, description: 'NETTO 5678 AARHUS N', counterparty: 'Netto', state: 'new', suggested_category_id: cat },
    { key: 'husleje', booked_on: d(0), amount_ore: -950000, description: 'HUSLEJE', counterparty: 'Boligselskabet', state: 'new', suggested_category_id: null },
    { key: 'lon', booked_on: d(0), amount_ore: 2850000, description: 'LØN', counterparty: 'Arbejdsgiver A/S', state: 'new', suggested_category_id: null },
    { key: 'mobilepay', booked_on: d(0), amount_ore: 25000, description: 'MobilePay Sara', counterparty: 'MobilePay', state: 'new', suggested_category_id: null },
    { key: 'opsparing', booked_on: d(0), amount_ore: -200000, description: 'Overførsel til opsparing', counterparty: null, state: 'transfer', suggested_category_id: null },
    { key: 'reserveret', booked_on: d(0), amount_ore: -4500, description: 'Reservation', counterparty: null, state: 'pending', suggested_category_id: null },
  ]
  let n = 0
  for (const r of rows) {
    if (r.state === 'pending') continue // reservationer springes over
    const ext = `${conn.id}:${r.key}`
    if (db.bank_transactions!.some((x) => x.external_id === ext)) continue
    db.bank_transactions!.push({ id: uuid(), household_id: HID, user_id: conn.user_id, account_id: conn.id, external_id: ext, booked_on: r.booked_on, amount_ore: r.amount_ore, description: r.description, counterparty: r.counterparty, state: r.state, suggested_category_id: r.suggested_category_id, possible_duplicate_id: null, transaction_id: null, income_id: null, created_at: nowIso(), updated_at: nowIso() })
    n++
  }
  conn.last_synced_at = nowIso()
  return n
}

const invites = () => (db['private.invites'] ??= [])
const findInvite = (code: unknown) => {
  const c = String(code ?? '').toUpperCase().replace(/[\s-]/g, '')
  return invites().find((i) => i.code === c && !i.used_at && !i.revoked_at && i.expires_at > nowIso())
}
function setDisplayName(uid: string, name: unknown) {
  const n = String(name ?? '').trim()
  const pr = db.profiles!.find((x) => x.id === uid)
  if (n && pr) pr.display_name = n.slice(0, 40)
}
const otherActiveAdults = (uid: string) => db.household_members!.filter((m) => m.user_id !== uid && !m.left_at && !m.disabled_at && m.role !== 'child').length
function memberDepart(uid: string) {
  const m = activeMember(uid)!
  if (!db.household_members!.some((x) => x.user_id !== uid && x.role === 'owner' && !x.left_at && !x.disabled_at)) {
    const next = db.household_members!.filter((x) => x.user_id !== uid && x.role === 'adult' && !x.left_at && !x.disabled_at).sort((x, y) => x.created_at.localeCompare(y.created_at))[0]
    if (next) next.role = 'owner'
  }
  Object.assign(m, { left_at: nowIso(), disabled_at: nowIso(), role: m.role === 'owner' ? 'adult' : m.role })
  for (const i of invites()) if (i.created_by === uid && !i.used_at && !i.revoked_at) i.revoked_at = nowIso()
}

const walletEffect = (t: Row) => (['allowance', 'deposit', 'from_goal'].includes(t.kind) ? t.amount_ore : -t.amount_ore)
const childBalance = (child: string) => db.child_wallet_transactions!.filter((t) => t.child_id === child && !t.voided_at).reduce((s2, t) => s2 + walletEffect(t), 0)
const goalSavedDemo = (goal: string) =>
  db.child_wallet_transactions!.filter((t) => t.goal_id === goal && !t.voided_at).reduce((s2, t) => s2 + (t.kind === 'to_goal' ? t.amount_ore : t.kind === 'from_goal' ? -t.amount_ore : 0), 0)
function addWalletTx(child: string, kind: string, amount: number, note: string | null, goal: string | null, by = CUR) {
  const id = uuid()
  db.child_wallet_transactions!.push({ id, household_id: HID, child_id: child, kind, amount_ore: amount, note: note?.trim() || null, goal_id: goal, task_id: null, occurred_on: today(), voided_at: null, voided_by: null, created_by: by, created_at: nowIso() })
  return id
}

/** Som triggeren private.calendar_participants: sortér, valider og hold for_user_id i takt */
function syncParticipants(r: Row) {
  const ids = [...new Set<string>(r.participant_ids ?? (r.for_user_id ? [r.for_user_id] : []))].sort()
  if (ids.some((id) => !roleOf(id))) throw new PgError('Deltageren er ikke medlem af husstanden', '23503', 409)
  r.participant_ids = ids
  r.for_user_id = ids.length === 1 ? ids[0] : null
}

/** Som triggeren private.task_reward_status */
function rewardStatus(r: Row, old?: Row) {
  if (!old) {
    r.reward_status = r.reward_ore == null ? 'none' : r.status === 'done' ? 'awaiting_approval' : 'awaiting_completion'
    return
  }
  if (old.reward_status === 'paid') {
    r.reward_status = 'paid'
    return
  }
  if (r.reward_ore == null) r.reward_status = 'none'
  else if (old.reward_status === 'none' || (r.status === 'done') !== (old.status === 'done'))
    Object.assign(r, { reward_status: r.status === 'done' ? 'awaiting_approval' : 'awaiting_completion', reward_decided_at: null, reward_decided_by: null })
}

// ------------------------------------------------------------------ faste lommepenge (spejler pay_allowance)
function dkToday() {
  return today()
}
function payAllowance(s: Row, until: string) {
  if (s.paused_at || s.stopped_at || roleOf(s.child_id) !== 'child') return
  let d = [s.pay_from, s.start_on, addDays(until, -62)].sort().at(-1)!
  for (; d <= until; d = addDays(d, 1)) {
    if (s.end_on && d > s.end_on) break
    if (!isDueOn(s as never, d)) continue
    const key = periodKey(s.frequency, d)
    if (db.child_allowance_payouts!.some((p) => p.schedule_id === s.id && p.period_key === key)) continue
    const tx = addWalletTx(s.child_id, 'allowance', s.amount_ore, 'Fast lommepenge', null, s.created_by)
    db.child_wallet_transactions!.find((t) => t.id === tx)!.occurred_on = d
    db.child_allowance_payouts!.push({ schedule_id: s.id, household_id: HID, period_key: key, due_on: d, amount_ore: s.amount_ore, tx_id: tx, created_at: nowIso() })
  }
}
function runAllowances() {
  db.child_allowance_schedules!.forEach((s) => payAllowance(s, dkToday()))
}

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
const pushSubscriptions = new Map<string, boolean>()

const rpcs: Record<string, (a: Row) => unknown | Promise<unknown>> = {
  current_household_id: () => HID,
  budget_month_summary: (a) => budgetMonthSummary(a.p_month),
  month_plan: (a) => monthPlan(a.p_month),
  fixed_items_month: (a) => fixedItemsMonth(a.p_month),
  create_budget_category: (a) => {
    if (db.budget_categories!.some((c) => !c.archived_at && c.name.toLowerCase() === String(a.p_name).toLowerCase())) throw new PgError('duplicate', '23505', 409)
    const c = { id: uuid(), household_id: HID, name: a.p_name, icon: a.p_icon, color: a.p_color, kind: a.p_kind ?? 'spending', sort_order: db.budget_categories!.length, archived_at: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso() }
    db.budget_categories!.push(c)
    const vf = a.p_valid_from ? a.p_valid_from.slice(0, 8) + '01' : curMonth()
    if (a.p_mode === 'percent' && a.p_percent_bp != null)
      db.budget_category_defaults!.push({ id: uuid(), household_id: HID, category_id: c.id, valid_from: vf, mode: 'percent', amount_ore: null, percent_bp: a.p_percent_bp, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    else if (a.p_default_amount_ore != null)
      db.budget_category_defaults!.push({ id: uuid(), household_id: HID, category_id: c.id, valid_from: vf, mode: 'amount', amount_ore: a.p_default_amount_ore, percent_bp: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    return c.id
  },
  set_category_default: (a) => {
    const vf = String(a.p_valid_from).slice(0, 8) + '01'
    if (vf < curMonth()) throw new PgError('Standardbudgettet kan kun ændres fra indeværende måned og frem', '23514')
    const mode = a.p_mode ?? 'amount'
    const values = { mode, amount_ore: mode === 'amount' ? a.p_amount_ore : null, percent_bp: mode === 'percent' ? a.p_percent_bp : null }
    const ex = db.budget_category_defaults!.find((x) => x.category_id === a.p_category_id && x.valid_from === vf)
    if (ex) Object.assign(ex, values)
    else db.budget_category_defaults!.push({ id: uuid(), household_id: HID, category_id: a.p_category_id, valid_from: vf, ...values, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
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
        db.fixed_groups!.push({ id: uuid(), household_id: HID, name, sort_order: i, archived_at: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
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
      created_by: CUR, created_at: nowIso(), updated_at: nowIso(),
    })
    db.fixed_item_versions!.push({ id: uuid(), household_id: HID, item_id: id, valid_from: sm, amount_ore: a.p_amount_ore, frequency: a.p_frequency ?? 'monthly', due_month: (a.p_frequency ?? 'monthly') === 'monthly' ? null : a.p_due_month, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    return id
  },
  set_fixed_item_amount: (a) => {
    const vf = String(a.p_valid_from).slice(0, 8) + '01'
    if (vf < curMonth()) throw new PgError('Beløbet kan kun ændres fra indeværende måned og frem', '23514')
    const values = { amount_ore: a.p_amount_ore, frequency: a.p_frequency ?? 'monthly', due_month: (a.p_frequency ?? 'monthly') === 'monthly' ? null : a.p_due_month }
    const ex = db.fixed_item_versions!.find((x) => x.item_id === a.p_item_id && x.valid_from === vf)
    if (ex) Object.assign(ex, values)
    else db.fixed_item_versions!.push({ id: uuid(), household_id: HID, item_id: a.p_item_id, valid_from: vf, ...values, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
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
  bank_connection_list: () =>
    bankConnections()
      .filter((c) => c.user_id === CUR && c.status === 'active')
      .map((c) => ({ id: c.id, aspsp_name: c.aspsp_name, status: 'active', valid_until: c.valid_until, last_synced_at: c.last_synced_at, last_error: null, accounts: ['Lønkonto'] })),
  bank_import: (a) => {
    const b = db.bank_transactions!.find((x) => x.id === a.p_id && x.user_id === CUR)
    if (!b) throw new PgError('Posteringen findes ikke', 'P0002')
    if (b.state === 'imported') return b.transaction_id ?? b.income_id
    if (!writeAccess()) throw readOnlyError()
    const descr = String(a.p_description ?? '').trim() || b.counterparty || b.description
    if (b.amount_ore < 0) {
      if (!a.p_category_id) throw new PgError('Vælg en kategori', '23514')
      const t = demoImportExpense(b, a.p_category_id, descr)
      // Husk butikken og tag de ventende fra samme butik med
      const key = merchantKey(b)
      const rules = bankRules()
      const rule = rules.find((r) => r.user_id === CUR && r.key === key)
      if (rule) Object.assign(rule, { kind: 'category', category_id: a.p_category_id, fixed_item_id: null, active: true })
      else rules.push({ id: uuid(), user_id: CUR, key, label: b.counterparty || descr, kind: 'category', category_id: a.p_category_id, fixed_item_id: null, active: true })
      for (const x of db.bank_transactions!) if (x.user_id === CUR && x.state === 'new' && x.amount_ore < 0 && !x.possible_duplicate_id && merchantKey(x) === key) demoImportExpense(x, a.p_category_id, null)
      return t.id
    }
    const id = uuid()
    db.income_entries!.push({ id, household_id: HID, amount_ore: b.amount_ore, received_on: b.booked_on, description: descr, note: null, received_by_kind: 'member', received_by_user_id: CUR, source: 'bank', created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    Object.assign(b, { state: 'imported', income_id: id })
    return id
  },
  bank_link_existing: (a) => {
    const b = db.bank_transactions!.find((x) => x.id === a.p_id && x.user_id === CUR)
    if (!b) throw new PgError('Posteringen findes ikke', 'P0002')
    Object.assign(b, { state: 'imported', transaction_id: a.p_transaction_id, possible_duplicate_id: null })
    return null
  },
  bank_set_ignored: (a) => {
    const b = db.bank_transactions!.find((x) => x.id === a.p_id && x.user_id === CUR && x.state !== 'imported')
    if (!b) throw new PgError('Posteringen findes ikke', 'P0002')
    if (!writeAccess()) throw readOnlyError()
    Object.assign(b, { state: a.p_ignored ? 'ignored' : 'new', fixed_item_id: null })
    return null
  },
  bank_import_suggested: () => {
    if (!writeAccess()) throw readOnlyError()
    let n = 0
    for (const x of db.bank_transactions!)
      if (x.user_id === CUR && x.state === 'new' && x.amount_ore < 0 && x.suggested_category_id && !x.possible_duplicate_id) {
        demoImportExpense(x, x.suggested_category_id, null)
        n++
      }
    return n
  },
  bank_rules: () =>
    bankRules()
      .filter((r) => r.user_id === CUR && r.active)
      .map((r) => ({ id: r.id, label: r.label, kind: r.kind ?? 'category', category_id: r.category_id, fixed_item_id: r.fixed_item_id ?? null, updated_at: nowIso() })),
  bank_mark_fixed: (a) => {
    const b = db.bank_transactions!.find((x) => x.id === a.p_id && x.user_id === CUR)
    if (!b) throw new PgError('Posteringen findes ikke', 'P0002')
    if (b.amount_ore >= 0) throw new PgError('Kun udgifter kan være faste udgifter', '23514')
    if (!writeAccess()) throw readOnlyError()
    let item = a.p_item_id
    if (!item) {
      if (!a.p_group_id) throw new PgError('Vælg en gruppe', '23514')
      item = rpcs.create_fixed_item!({ p_kind: 'expense', p_name: a.p_name || b.counterparty || b.description, p_amount_ore: -b.amount_ore, p_frequency: a.p_frequency ?? 'monthly', p_due_month: Number(b.booked_on.slice(5, 7)), p_group_id: a.p_group_id, p_payment_day: Number(b.booked_on.slice(8, 10)) })
    }
    const key = merchantKey(b)
    const rules = bankRules()
    const rule = rules.find((r) => r.user_id === CUR && r.key === key)
    if (rule) Object.assign(rule, { kind: 'fixed', fixed_item_id: item, category_id: null, active: true })
    else rules.push({ id: uuid(), user_id: CUR, key, label: b.counterparty || b.description, kind: 'fixed', category_id: null, fixed_item_id: item, active: true })
    for (const x of db.bank_transactions!) if (x.id === b.id || (x.user_id === CUR && x.state === 'new' && x.amount_ore < 0 && merchantKey(x) === key)) Object.assign(x, { state: 'fixed', fixed_item_id: item })
    return item
  },
  bank_rule_disable: (a) => {
    const r = bankRules().find((x) => x.id === a.p_id && x.user_id === CUR)
    if (!r) throw new PgError('Reglen findes ikke', 'P0002')
    r.active = false
    return null
  },
  bank_ignore_all: () => {
    if (!writeAccess()) throw readOnlyError()
    let n = 0
    for (const b of db.bank_transactions!) if (b.user_id === CUR && b.state === 'new') {
      b.state = 'ignored'
      n++
    }
    return n
  },
  subscription_info: () => {
    const s = subscription()
    return { ...s, grace_ends_at: null, write_access: Boolean(writeAccess()) }
  },
  household_create: (a) => {
    if (activeMember(CUR)) throw new PgError('Du er allerede med i en husstand', '23505', 409)
    const name = String(a.p_name ?? '').trim()
    if (name.length < 1 || name.length > 80) throw new PgError('Skriv et navn på husstanden', '23514')
    // Demoen har én husstand ad gangen (alle data hører til HID)
    if (db.households!.some((h) => h.id === HID)) throw new PgError('Demo: der findes allerede en husstand', '23514')
    setDisplayName(CUR, a.p_display_name)
    db.households!.push({ id: HID, name, default_receipt_retention: '30d', grocery_category_id: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    db.household_members!.push({ household_id: HID, user_id: CUR, role: 'owner', child_username: null, disabled_at: null, left_at: null, created_at: nowIso() })
    db['private.login_codes'] = [{ household_id: HID, code: DEMO_LOGIN_CODE }]
    return HID
  },
  invite_create: () => {
    if (!isAdult() || isDisabled(CUR)) throw rlsError()
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => alphabet[b % 31]).join('')
    const inv = { id: uuid(), code, household_id: HID, created_by: CUR, created_at: nowIso(), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), used_at: null, revoked_at: null }
    invites().push(inv)
    return [{ invite_id: inv.id, code, expires_at: inv.expires_at }]
  },
  invite_list: () =>
    isAdult() && !isDisabled(CUR)
      ? invites()
          .filter((i) => !i.used_at && !i.revoked_at && i.expires_at > nowIso())
          .map((i) => ({ invite_id: i.id, created_by: i.created_by, created_at: i.created_at, expires_at: i.expires_at }))
      : [],
  invite_revoke: (a) => {
    const i = invites().find((x) => x.id === a.p_invite_id && !x.revoked_at && !x.used_at)
    if (!i || !isAdult() || isDisabled(CUR)) throw new PgError('Invitationen findes ikke', 'P0002')
    i.revoked_at = nowIso()
    return null
  },
  invite_preview: (a) => {
    const i = findInvite(a.p_code)
    if (!i) return []
    return [{ household_name: db.households!.find((h) => h.id === i.household_id)?.name ?? '', invited_by: db.profiles!.find((x) => x.id === i.created_by)?.display_name ?? 'Et medlem', expires_at: i.expires_at }]
  },
  invite_accept: (a) => {
    if (activeMember(CUR)) throw new PgError('Du er allerede med i en husstand', '23505', 409)
    const i = findInvite(a.p_code)
    if (!i) return null
    setDisplayName(CUR, a.p_display_name)
    const old = db.household_members!.find((m) => m.household_id === i.household_id && m.user_id === CUR)
    if (old) Object.assign(old, { left_at: null, disabled_at: null, role: 'adult' })
    else db.household_members!.push({ household_id: i.household_id, user_id: CUR, role: 'adult', child_username: null, disabled_at: null, left_at: null, created_at: nowIso() })
    Object.assign(i, { used_at: nowIso(), used_by: CUR })
    return i.household_id
  },
  household_leave: () => {
    const m = activeMember(CUR)
    if (!m || m.role === 'child') throw new PgError('Du er ikke med i en husstand', 'P0002')
    if (otherActiveAdults(CUR) === 0) throw new PgError('Du er den eneste voksne. Slet kontoen for at slette husstanden.', '23514')
    memberDepart(CUR)
    return null
  },
  household_remove_member: (a) => {
    if (!isOwner()) throw new PgError('Kun ejere kan fjerne medlemmer', '42501', 403)
    const m = activeMember(a.p_user)
    if (!m || a.p_user === CUR || m.role === 'child') throw new PgError('Medlemmet findes ikke', 'P0002')
    memberDepart(a.p_user)
    return null
  },
  attach_receipt: (a) => {
    const r = db.receipts!.find((x) => x.id === a.p_receipt_id)
    if (!r || !isAdult()) throw new PgError('Kvitteringen findes ikke', 'P0002')
    if (r.status === 'approved') {
      if (r.transaction_id === a.p_transaction_id) return null
      throw new PgError('Kvitteringen er allerede brugt', '23514')
    }
    if (!files.has(r.storage_path)) throw new PgError('Billedet er ikke uploadet endnu', '23514')
    if (!db.transactions!.some((t) => t.id === a.p_transaction_id)) throw new PgError('Udgiften findes ikke', 'P0002')
    const old = db.receipts!.find((x) => x.transaction_id === a.p_transaction_id)
    db.receipts = db.receipts!.filter((x) => x !== old)
    Object.assign(r, { status: 'approved', transaction_id: a.p_transaction_id, retention: a.p_retention, delete_at: deleteAtFor(a.p_retention, a.p_custom_date, new Date()), approved_at: nowIso() })
    return old?.storage_path ?? null
  },
  remove_receipt_image: (a) => {
    const r = db.receipts!.find((x) => x.id === a.p_receipt_id)
    if (!r || !isAdult()) throw new PgError('Kvitteringen findes ikke', 'P0002')
    if (r.status !== 'approved') throw new PgError('Kvitteringen er ikke godkendt', '23514')
    if (!r.storage_path) return null
    const path = r.storage_path
    Object.assign(r, { storage_path: null, image_deleted_at: nowIso() })
    return path
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
  // Notifikationer: demoen har ingen push-tjeneste – tilmeldinger gemmes kun i hukommelsen
  push_public_key: () => 'BDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoDemoA',
  save_push_subscription: (a) => {
    pushSubscriptions.set(String(a.p_endpoint), true)
  },
  disable_push_subscription: (a) => {
    pushSubscriptions.delete(String(a.p_endpoint))
  },
  send_test_notification: () => pushSubscriptions.size > 0,
  // Madplan (spejler save_recipe, copy_meal_week og add_meal_ingredients_to_shopping)
  save_recipe: (a) => {
    const r = a.p_recipe ?? {}
    if (!String(r.name ?? '').trim()) throw new PgError('navn mangler', '23514')
    const values = {
      name: String(r.name).trim(), description: r.description || null, servings: r.servings ?? 4, prep_minutes: r.prep_minutes ?? null,
      steps: r.steps || null, category: r.category || null, tags: r.tags ?? [], is_favorite: Boolean(r.is_favorite), note: r.note || null,
    }
    let id = a.p_id as string | null
    if (id) {
      const row = db.recipes!.find((x) => x.id === id)
      if (!row) throw new PgError('Opskriften findes ikke', 'P0002')
      Object.assign(row, values, { updated_at: nowIso() })
      db.recipe_ingredients = db.recipe_ingredients!.filter((x) => x.recipe_id !== id)
    } else {
      id = uuid()
      db.recipes!.push({ id, household_id: HID, ...values, archived_at: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    }
    ;((a.p_ingredients ?? []) as Row[])
      .filter((i) => String(i.name ?? '').trim())
      .forEach((i, n) => db.recipe_ingredients!.push({ id: uuid(), household_id: HID, recipe_id: id, sort_order: n, name: String(i.name).trim(), amount_milli: i.amount_milli ?? null, unit: i.unit || null, note: i.note || null, created_at: nowIso() }))
    return id
  },
  copy_meal_week: (a) => {
    const diff = Math.round((new Date(`${a.p_to}T12:00:00`).getTime() - new Date(`${a.p_from}T12:00:00`).getTime()) / 86_400_000)
    const src = db.meal_plan_entries!.filter((e) => e.plan_date >= a.p_from && e.plan_date < addDays(a.p_from, 7))
    let n = 0
    for (const e of src) {
      const date = addDays(e.plan_date, diff)
      if (db.meal_plan_entries!.some((t) => t.plan_date === date && t.meal === e.meal)) continue
      db.meal_plan_entries!.push({ ...e, id: uuid(), plan_date: date, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
      n++
    }
    return n
  },
  add_meal_ingredients_to_shopping: (a) => {
    const list = (rpcs.ensure_shopping_list!({}) as string)
    let order = db.shopping_items!.reduce((m, i) => Math.max(m, i.sort_order), 0)
    let n = 0
    for (const it of (a.p_items ?? []) as Row[]) {
      const key = `meal:${a.p_week}:${String(it.key).toLowerCase()}`
      const hit = db.shopping_items!.find((i) => i.list_id === list && i.source_key === key)
      if (hit) {
        if (!hit.is_checked) {
          Object.assign(hit, { name: it.name, quantity: it.quantity || null, updated_at: nowIso() })
          n++
        }
        continue
      }
      db.shopping_items!.push({ id: uuid(), household_id: HID, list_id: list, name: it.name, quantity: it.quantity || null, note: null, is_checked: false, checked_by: null, checked_at: null, added_by: CUR, sort_order: ++order, source: 'meal_plan', source_key: key, meal_week: a.p_week, created_at: nowIso(), updated_at: nowIso() })
      n++
    }
    return n
  },
  ensure_shopping_list: () => {
    let l = db.shopping_lists!.find((x) => !x.archived_at)
    if (!l) {
      l = { id: uuid(), household_id: HID, name: 'Indkøb', sort_order: 0, archived_at: null, created_at: nowIso(), updated_at: nowIso() }
      db.shopping_lists!.push(l)
    }
    return l.id
  },
  set_task_status: (a) => {
    const task = visibleRows('household_tasks', db.household_tasks!).find((x) => x.id === a.p_task_id)
    if (!task) throw new PgError('Opgaven findes ikke', 'P0002')
    if (a.p_status === 'done') {
      if (task.status !== 'done') {
        const old = { ...task }
        Object.assign(task, { status: 'done', completed_at: nowIso(), completed_by: CUR })
        rewardStatus(task, old)
      }
      if (task.recurrence === 'none') return null
      let next = db.household_tasks!.find((x) => x.previous_task_id === task.id)
      if (!next) {
        next = { ...task, id: uuid(), status: 'open', completed_at: null, completed_by: null, previous_task_id: task.id, due_on: nextDue(task.due_on ?? today(), task.recurrence, task.recurrence_interval ?? 1), created_at: nowIso(), updated_at: nowIso() }
        rewardStatus(next)
        db.household_tasks!.push(next)
      }
      return next.id
    }
    if (task.status === 'done') db.household_tasks = db.household_tasks!.filter((x) => !(x.previous_task_id === task.id && x.status === 'open'))
    const old = { ...task }
    Object.assign(task, { status: a.p_status, completed_at: null, completed_by: null })
    rewardStatus(task, old)
    return null
  },
  child_reward_decide: (a) => {
    const t = db.household_tasks!.find((x) => x.id === a.p_task)
    if (!t || !isAdult()) throw new PgError('Opgaven findes ikke', 'P0002')
    if (t.reward_status === 'paid') {
      if (a.p_approve) return db.child_wallet_transactions!.find((x) => x.task_id === t.id)?.id ?? null
      throw new PgError('Belønningen er allerede udbetalt', '23514')
    }
    if (t.reward_status !== 'awaiting_approval' || t.reward_ore == null) throw new PgError('Opgaven venter ikke på godkendelse', '23514')
    if (roleOf(t.assignee_id) !== 'child') throw new PgError('Kun børn kan få belønning', '23514')
    if (!a.p_approve) {
      Object.assign(t, { reward_status: 'rejected', reward_decided_at: nowIso(), reward_decided_by: CUR })
      return null
    }
    const id = addWalletTx(t.assignee_id, 'deposit', t.reward_ore, `Opgave: ${t.title}`.slice(0, 100), null)
    db.child_wallet_transactions!.find((x) => x.id === id)!.task_id = t.id
    Object.assign(t, { reward_status: 'paid', reward_decided_at: nowIso(), reward_decided_by: CUR })
    return id
  },
  child_pin: (a) => {
    const c = credentials().find((x) => x.user_id === a.p_child)
    if (!c || !isAdult()) throw new PgError('Barnet findes ikke', 'P0002')
    return c.pin_view ?? null
  },
  child_allowance_create: (a) => {
    if (!isAdult()) throw new PgError('Kun voksne kan oprette faste lommepenge', '42501', 403)
    if (roleOf(a.p_child) !== 'child') throw new PgError('Barnet findes ikke', 'P0002')
    const t = dkToday()
    const start = a.p_start_on ?? t
    const s = {
      id: uuid(), household_id: HID, child_id: a.p_child, amount_ore: a.p_amount_ore, frequency: a.p_frequency,
      weekday: a.p_frequency === 'weekly' ? a.p_weekday : null, month_day: a.p_frequency === 'monthly' ? a.p_month_day : null,
      start_on: start, end_on: a.p_end_on ?? null, pay_from: start > t ? start : t, paused_at: null, stopped_at: null,
      created_by: CUR, created_at: nowIso(), updated_at: nowIso(),
    }
    db.child_allowance_schedules!.push(s)
    payAllowance(s, t)
    return s.id
  },
  child_allowance_update: (a) => {
    const s = db.child_allowance_schedules!.find((x) => x.id === a.p_schedule)
    if (!s || !isAdult()) throw new PgError('Ordningen findes ikke', 'P0002')
    if (s.stopped_at) throw new PgError('Ordningen er stoppet', '23514')
    Object.assign(s, { amount_ore: a.p_amount_ore ?? s.amount_ore, end_on: a.p_clear_end ? null : (a.p_end_on ?? s.end_on), updated_at: nowIso() })
    return null
  },
  child_allowance_set_state: (a) => {
    const s = db.child_allowance_schedules!.find((x) => x.id === a.p_schedule)
    if (!s || !isAdult()) throw new PgError('Ordningen findes ikke', 'P0002')
    if (s.stopped_at) throw new PgError('Ordningen er stoppet', '23514')
    const t = dkToday()
    if (a.p_action === 'pause') s.paused_at = s.paused_at ?? nowIso()
    else if (a.p_action === 'resume' && s.paused_at) {
      Object.assign(s, { paused_at: null, pay_from: t > s.start_on ? t : s.start_on })
      payAllowance(s, t)
    } else if (a.p_action === 'stop') s.stopped_at = nowIso()
    return null
  },
  child_wallet_add: (a) => {
    const adult = isAdult()
    if (roleOf(a.p_child) !== 'child') throw new PgError('Barnet findes ikke', 'P0002')
    if (!adult && (a.p_child !== CUR || !['purchase', 'to_goal', 'from_goal'].includes(a.p_kind))) throw new PgError('Ikke tilladt', '42501', 403)
    if (!(a.p_amount_ore > 0)) throw new PgError('Beløbet skal være større end 0', '23514')
    if (a.p_kind === 'to_goal' || a.p_kind === 'from_goal') {
      const g = db.child_savings_goals!.find((x) => x.id === a.p_goal && x.child_id === a.p_child)
      if (!g) throw new PgError('Målet findes ikke', 'P0002')
      if (a.p_kind === 'to_goal' && g.archived_at) throw new PgError('Målet er afsluttet', '23514')
      if (a.p_kind === 'from_goal' && a.p_amount_ore > goalSavedDemo(g.id)) throw new PgError('Der er ikke så mange penge på målet', '23514')
    } else if (a.p_goal) throw new PgError('Kun flytning til/fra mål har et mål', '23514')
    if (a.p_kind === 'to_goal' && a.p_amount_ore > childBalance(a.p_child)) throw new PgError('Der er ikke penge nok på saldoen', '23514')
    if (a.p_kind === 'purchase' && !adult && a.p_amount_ore > childBalance(a.p_child)) throw new PgError('Der er ikke penge nok på saldoen', '23514')
    return addWalletTx(a.p_child, a.p_kind, a.p_amount_ore, a.p_note ?? null, a.p_goal ?? null)
  },
  child_wallet_void: (a) => {
    const t = db.child_wallet_transactions!.find((x) => x.id === a.p_tx)
    if (!t || !isAdult()) throw new PgError('Bevægelsen findes ikke', 'P0002')
    if (t.kind === 'to_goal' && goalSavedDemo(t.goal_id) - t.amount_ore < 0) throw new PgError('Pengene er allerede taget fra målet', '23514')
    if (!t.voided_at) Object.assign(t, { voided_at: nowIso(), voided_by: CUR })
    return null
  },
  child_goal_create: (a) => {
    if (roleOf(a.p_child) !== 'child') throw new PgError('Barnet findes ikke', 'P0002')
    if (!isAdult() && a.p_child !== CUR) throw new PgError('Ikke tilladt', '42501', 403)
    if (db.child_savings_goals!.filter((g) => g.child_id === a.p_child && !g.archived_at).length >= 20) throw new PgError('Højst 20 aktive mål', '23514')
    const id = uuid()
    db.child_savings_goals!.push({ id, household_id: HID, child_id: a.p_child, name: String(a.p_name).trim(), target_ore: a.p_target_ore, archived_at: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso() })
    return id
  },
  child_goal_update: (a) => {
    const g = db.child_savings_goals!.find((x) => x.id === a.p_goal)
    if (!g || !(isAdult() || g.child_id === CUR)) throw new PgError('Målet findes ikke', 'P0002')
    const wasActive = !g.archived_at
    Object.assign(g, { name: a.p_name?.trim() || g.name, target_ore: a.p_target_ore ?? g.target_ore, archived_at: a.p_archive ? (g.archived_at ?? nowIso()) : g.archived_at, updated_at: nowIso() })
    if (a.p_archive && wasActive) {
      const saved = goalSavedDemo(g.id)
      if (saved > 0) addWalletTx(g.child_id, 'from_goal', saved, `Mål afsluttet: ${g.name}`, g.id)
    }
    return null
  },
  household_login_code: () => {
    if (!isOwner()) throw new PgError('Kun ejere kan se husstandskoden', '42501', 403)
    return loginCode()
  },
  child_set_pin: async (a) => {
    if (!isOwner()) throw new PgError('Kun ejere kan ændre PIN', '42501', 403)
    if (!isValidPin(String(a.p_pin ?? ''), a.p_pin_length)) throw new PgError('Ugyldig PIN', '23514')
    const c = credentials().find((x) => x.user_id === a.p_child)
    if (!c) throw new PgError('Barnet findes ikke', 'P0002')
    Object.assign(c, { pin_hash: await pinHash(a.p_pin), pin_length: a.p_pin_length, pin_view: a.p_pin })
    const m = db.household_members!.find((x) => x.user_id === a.p_child)
    db['private.login_throttle'] = throttle().filter((t) => t.key !== `${loginCode()}:${m?.child_username}`)
    return null
  },
  child_set_username: (a) => {
    if (!isOwner()) throw new PgError('Kun ejere kan ændre brugernavne', '42501', 403)
    const u = normalizeUsername(String(a.p_username ?? ''))
    if (!USERNAME_RE.test(u)) throw new PgError('Ugyldigt brugernavn', '23514')
    if (db.household_members!.some((m) => m.child_username === u && m.user_id !== a.p_child)) throw new PgError('Brugernavnet er optaget', '23505', 409)
    const m = db.household_members!.find((x) => x.user_id === a.p_child && x.role === 'child')
    if (!m || !credentials().some((c) => c.user_id === a.p_child)) throw new PgError('Barnet findes ikke', 'P0002')
    m.child_username = u
    return null
  },
  set_member_role: (a) => {
    if (roleOf(CUR) !== 'owner') throw new PgError('Kun ejere kan ændre roller', '42501', 403)
    if (a.p_role !== 'child' && credentials().some((c) => c.user_id === a.p_user)) throw new PgError('Et barns login kan ikke gøres til voksen', '23514')
    if (a.p_user === CUR) throw new PgError('Du kan ikke ændre din egen rolle', '42501', 403)
    if (!['owner', 'adult', 'child'].includes(a.p_role)) throw new PgError('Ugyldig rolle', '23514')
    const m = db.household_members!.find((x) => x.user_id === a.p_user)
    if (!m) throw new PgError('Medlemmet findes ikke', 'P0002')
    m.role = a.p_role
    return null
  },
  export_household_data: () => {
    if (!isAdult()) throw new PgError('Kun voksne kan eksportere', '42501', 403)
    const out: Row = { exported_at: nowIso(), household: { id: HID, name: 'Vores hjem' } }
    for (const t of TABLES) out[t] = db[t]
    return out
  },
}

function insertTransaction(v: Row): Row {
  if (db.budget_categories!.find((c) => c.id === v.category_id)?.archived_at) throw new PgError('Kategorien er arkiveret', '23514')
  const t = { id: uuid(), household_id: HID, note: null, paid_by_user_id: null, created_by: CUR, created_at: nowIso(), updated_at: nowIso(), ...v }
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
  shopping_items: () => ({ is_checked: false, checked_by: null, checked_at: null, note: null, quantity: null, sort_order: 0, source: 'manual', source_key: null, meal_week: null }),
  household_tasks: () => ({ status: 'open', priority: 'normal', recurrence: 'none', recurrence_interval: 1, completed_at: null, completed_by: null, previous_task_id: null, archived_at: null, description: null, assignee_id: null, due_on: null, reward_ore: null, reward_status: 'none', reward_decided_at: null, reward_decided_by: null }),
  recipes: () => ({ description: null, servings: 4, prep_minutes: null, steps: null, category: null, tags: [], is_favorite: false, note: null, archived_at: null }),
  meal_plan_entries: () => ({ meal: 'dinner', recipe_id: null, servings: null, note: null, sort_order: 0 }),
  calendar_events: () => ({ start_time: null, end_time: null, end_date: null, all_day: false, description: null, type: 'family', participant_ids: [], for_user_id: null, reminder_minutes: null }),
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
const jwtFor = (uid: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp: FAR, role: 'authenticated', aud: 'authenticated' })}.demo`
const emailFor = (uid: string) =>
  uid === ME ? 'hamza@demo.dk' : uid === WIFE ? 'sumaya@demo.dk' : uid === NEWUSER ? 'ny@demo.dk' : db?.['private.child_credentials']?.some((c) => c.user_id === uid) ? `child-${uid}@internal.home` : `${uid.slice(-2)}@demo.dk`
const userFor = (uid: string) => ({ id: uid, email: emailFor(uid), aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
const sessionFor = (uid: string) => ({ access_token: jwtFor(uid), token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: FAR, refresh_token: `demo:${uid}`, user: userFor(uid) })
const uidForEmail = (email: unknown) => {
  const e = String(email ?? '').trim().toLowerCase()
  return e === 'sumaya@demo.dk' ? WIFE : e === 'ny@demo.dk' ? NEWUSER : ME
}
/** Bruger-id fra "Authorization: Bearer <jwt>" (anon-nøglen giver null) */
function subOf(auth: string | null): string | null {
  const part = auth?.replace(/^Bearer\s+/i, '').split('.')[1]
  if (!part) return null
  try {
    return (JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }).sub ?? null
  } catch {
    return null
  }
}

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
  // Herfra kører resten synkront for denne forespørgsel (ingen await før svaret), så CUR er sikker
  CUR = subOf(headers.get('authorization')) ?? DEFAULT_USER

  try {
    // ---------------- Auth
    if (p === '/auth/v1/token') {
      const refresh = typeof body?.refresh_token === 'string' && body.refresh_token.startsWith('demo:') ? body.refresh_token.slice(5) : null
      return json(sessionFor(refresh ?? uidForEmail(body?.email)))
    }
    if (p === '/auth/v1/user') return json(userFor(CUR))
    if (p === '/auth/v1/logout') return empty()
    if (p === '/auth/v1/recover') return json({})
    if (p === '/auth/v1/otp') return json({})
    if (p === '/auth/v1/verify') return body?.token === '123456' ? json(sessionFor(body?.type === 'email' ? uidForEmail(body?.email) : ME)) : json({ code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)

    // ---------------- Husstand
    if (p === '/rest/v1/household_members') {
      if (isDisabled(CUR)) return json([])
      if (url.searchParams.get('select') === 'household_id') return json([{ household_id: activeMember(CUR)!.household_id }])
      return json(
        [...db.household_members!.filter((m) => !m.left_at)]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((m) => {
            const pr = db.profiles!.find((x) => x.id === m.user_id)!
            return { user_id: m.user_id, role: m.role, created_at: m.created_at, child_username: m.child_username ?? null, disabled_at: m.disabled_at ?? null, profiles: { display_name: pr.display_name, color: pr.color, default_paid_by: pr.default_paid_by } }
          }),
      )
    }

    // ---------------- Edge Function: bank (demo: "Demo Bank" uden MitID)
    if (p === '/functions/v1/bank') {
      if (!subOf(headers.get('authorization'))) return json({ ok: false, error: 'unauthorized' }, 401)
      if (!isAdult()) return json({ ok: false, error: 'not_allowed' }, 403)
      if (body?.action === 'banks') return json({ ok: true, banks: ['Danske Bank', 'Nordea', 'Jyske Bank', 'Lunar', 'Sydbank'].map((name) => ({ name, logo: null })) })
      if (body?.action === 'connect') {
        if (!writeAccess()) return json({ ok: false, error: 'read_only' }, 402)
        const state = uuid()
        bankConnections().push({ id: uuid(), user_id: CUR, aspsp_name: String(body.aspsp), state, status: 'pending', valid_until: new Date(Date.now() + 179 * 86_400_000).toISOString(), last_synced_at: null })
        save()
        return json({ ok: true, url: `/bank/callback?code=demo&state=${state}` })
      }
      if (body?.action === 'callback') {
        const c = bankConnections().find((x) => x.state === body.state && x.user_id === CUR && x.status === 'pending')
        if (!c) return json({ ok: false, error: 'not_found' }, 404)
        c.status = 'active'
        const imported = demoBankIngest(c)
        const income = demoAutoIncome()
        save()
        return json({ ok: true, accounts: 1, imported, failed: 0, income })
      }
      if (body?.action === 'sync') {
        let imported = 0
        for (const c of bankConnections().filter((x) => x.user_id === CUR && x.status === 'active')) imported += demoBankIngest(c)
        const income = demoAutoIncome()
        save()
        return json({ ok: true, imported, failed: 0, income })
      }
      if (body?.action === 'disconnect') {
        const c = bankConnections().find((x) => x.id === body.id && x.user_id === CUR)
        if (!c) return json({ ok: false, error: 'not_found' }, 404)
        c.status = 'revoked'
        db.bank_transactions = db.bank_transactions!.filter((x) => !(x.account_id === c.id && x.state !== 'imported'))
        save()
        return json({ ok: true })
      }
      return json({ ok: false, error: 'bad_request' }, 400)
    }

    // ---------------- Edge Function: abonnement (demo: betalingen gennemføres med det samme)
    if (p === '/functions/v1/billing') {
      if (!subOf(headers.get('authorization'))) return json({ ok: false, error: 'unauthorized' }, 401)
      const sub = subscription()
      if (!isAdult()) return json({ ok: false, error: 'not_allowed' }, 403)
      if (body?.action === 'checkout') {
        if (sub.status === 'active') return json({ ok: false, error: 'already_active' }, 409)
        const yearly = body.plan === 'yearly'
        Object.assign(sub, { status: 'active', plan: yearly ? 'yearly' : 'monthly', current_period_end: new Date(Date.now() + (yearly ? 365 : 30) * 86_400_000).toISOString(), payer_user_id: CUR, has_customer: true })
        save()
        return json({ ok: true, url: '/indstillinger/abonnement?betaling=ok' })
      }
      if (body?.action === 'portal') {
        if (sub.payer_user_id && sub.payer_user_id !== CUR) return json({ ok: false, error: 'not_payer' }, 403)
        return json({ ok: true, url: '/indstillinger/abonnement' })
      }
      return json({ ok: false, error: 'bad_request' }, 400)
    }

    // ---------------- Edge Function: slet konto
    if (p === '/functions/v1/account-delete') {
      if (!subOf(headers.get('authorization'))) return json({ ok: false, error: 'unauthorized' }, 401)
      if (body?.confirm !== 'SLET') return json({ ok: false, error: 'bad_request' }, 400)
      const m = activeMember(CUR)
      if (m?.role === 'child') return json({ ok: false, error: 'not_allowed' }, 403)
      if (m && otherActiveAdults(CUR) === 0) {
        // Sidste voksne: hele husstanden slettes
        const fresh = seedFresh()
        for (const t of TABLES) db[t] = fresh[t] ?? []
        db['private.login_codes'] = []
        db['private.invites'] = []
        files.clear()
        void saveFiles()
      } else if (m) memberDepart(CUR)
      const pr = db.profiles!.find((x) => x.id === CUR)
      if (pr) Object.assign(pr, { display_name: 'Tidligere medlem', color: null })
      save()
      return json({ ok: true })
    }

    // ---------------- Edge Function: barnelogin
    if (p === '/functions/v1/child-login') {
      const code = String(body?.code ?? '').replace(/\s/g, '').toUpperCase()
      const username = normalizeUsername(String(body?.username ?? ''))
      const key = `${code}:${username}`
      let t = throttle().find((x) => x.key === key)
      if (t?.locked_until && t.locked_until > Date.now()) return json({ ok: false, error: 'locked' }, 429)
      const m = code === loginCode() ? db.household_members!.find((x) => x.child_username === username && x.role === 'child' && !x.disabled_at) : undefined
      const c = m ? credentials().find((x) => x.user_id === m.user_id) : undefined
      const hash = await pinHash(String(body?.pin ?? ''))
      if (m && c && c.pin_hash === hash) {
        db['private.login_throttle'] = throttle().filter((x) => x.key !== key)
        save()
        const sess = sessionFor(m.user_id)
        return json({ ok: true, session: { access_token: sess.access_token, refresh_token: sess.refresh_token, expires_in: sess.expires_in, expires_at: sess.expires_at } })
      }
      if (!t) throttle().push((t = { key, failures: 0, locked_until: null, level: 0 }))
      t.failures += 1
      if (t.failures >= 5) Object.assign(t, { failures: 0, locked_until: Date.now() + 10 * 60_000 * 2 ** t.level, level: t.level + 1 })
      save()
      return json({ ok: false, error: 'invalid' }, 401)
    }
    // ---------------- Edge Function: ejerens administration af børns login
    if (p === '/functions/v1/child-admin') {
      if (!subOf(headers.get('authorization'))) return json({ ok: false, error: 'unauthorized' }, 401)
      if (!isOwner()) return json({ ok: false, error: 'not_owner' }, 403)
      if (body?.action === 'create') {
        const name = String(body.name ?? '').trim()
        const username = normalizeUsername(String(body.username ?? ''))
        if (!isValidName(name)) return json({ ok: false, error: 'invalid_name' }, 400)
        if (!USERNAME_RE.test(username)) return json({ ok: false, error: 'invalid_username' }, 400)
        if (!isValidPin(String(body.pin ?? ''), body.pinLength)) return json({ ok: false, error: 'invalid_pin' }, 400)
        if (db.household_members!.some((m) => m.child_username === username)) return json({ ok: false, error: 'username_taken' }, 409)
        const id = uuid()
        const created = nowIso()
        db.profiles!.push({ id, display_name: name, color: null, default_paid_by: 'me', notify_calendar: true, notify_shopping: true, created_at: created, updated_at: created })
        db.household_members!.push({ household_id: HID, user_id: id, role: 'child', child_username: username, disabled_at: null, created_at: created })
        credentials().push({ user_id: id, pin_hash: await pinHash(body.pin), pin_length: body.pinLength, pin_view: body.pin })
        save()
        return json({ ok: true, userId: id })
      }
      if (body?.action === 'disable' || body?.action === 'enable') {
        const m = db.household_members!.find((x) => x.user_id === body.childId && x.role === 'child')
        if (!m) return json({ ok: false, error: 'not_found' }, 404)
        m.disabled_at = body.action === 'disable' ? (m.disabled_at ?? nowIso()) : null
        save()
        return json({ ok: true })
      }
      return json({ ok: false, error: 'bad_request' }, 400)
    }

    // ---------------- Edge Function: opskrift fra link (demo: fast eksempel)
    if (p === '/functions/v1/import-recipe') {
      const link = String(body?.url ?? '')
      if (!/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(link)) return json({ ok: false, error: 'invalid_url' })
      if (!link.includes('kylling')) return json({ ok: false, error: 'no_recipe' })
      return json({
        ok: true,
        source: link,
        recipe: {
          name: 'Kylling i karry',
          description: 'Mild og cremet familieret',
          servings: 4,
          prepMinutes: 45,
          ingredients: ['25 g smør', '2 tsk karry', '3 finthakkede løg', '300 g kyllingeinderfileter', '2½ dl grøntsagsbouillon', 'friskkværnet peber', '4 dl løse ris, parboiled - koges'],
          steps: '1. Smelt smørret og svits karry.\n2. Tilsæt løg og kylling.',
        },
      })
    }

    // ---------------- RPC
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = rpcs[p.slice('/rest/v1/rpc/'.length)]
      if (!fn) return json({ code: '42883', message: `Ukendt funktion ${p}` }, 404)
      const result = await fn(body ?? {})
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
    const rows = table.startsWith('private.') ? undefined : db[table]
    if (rows) {
      // Børn må kun skrive i egen profil – alt andet går via RPC'er (som i databasen)
      if (method !== 'GET' && !isAdult() && table !== 'profiles') throw rlsError()
      // Skrivebeskyttet uden gyldigt abonnement (sletning er altid tilladt)
      if ((method === 'POST' || method === 'PATCH') && !['profiles', 'households', 'household_members'].includes(table) && !writeAccess()) throw readOnlyError()
      if (method === 'GET') {
        const out = withEmbeds(table, filterRows(visibleRows(table, rows), url.searchParams), url.searchParams.get('select'))
        return json(accept.includes('object') ? (out[0] ?? null) : out)
      }
      if (method === 'POST') {
        const list = (Array.isArray(body) ? body : [body]).map((b: Row): Row => ({
          id: uuid(), created_at: nowIso(), updated_at: nowIso(),
          ...(table === 'shopping_items' ? { added_by: CUR } : { created_by: CUR }),
          ...(DEFAULTS[table]?.() ?? {}),
          ...b,
        }))
        for (const row of list) {
          if (table === 'calendar_events') syncParticipants(row)
          if (table === 'household_tasks') rewardStatus(row)
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
          const old = { ...r }
          if (table === 'shopping_items' && body && 'is_checked' in body && body.is_checked !== r.is_checked)
            Object.assign(r, body.is_checked ? { checked_by: CUR, checked_at: nowIso() } : { checked_by: null, checked_at: null })
          Object.assign(r, body, { updated_at: nowIso() })
          if (table === 'household_tasks') rewardStatus(r, old)
          if (table === 'calendar_events') {
            // Ældre app-versioner sender kun for_user_id
            if (body && !('participant_ids' in body) && 'for_user_id' in body) r.participant_ids = body.for_user_id ? [body.for_user_id] : []
            syncParticipants(r)
          }
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
  // Ny session, hvis der ikke er en – eller hvis testen har skiftet bruger (hjem-demo-as)
  const stored = JSON.parse(authStorage.getItem('hjem.auth') ?? 'null') as { user?: { id?: string } } | null
  // 'fresh': ingen automatisk login – tilmeldingen testes fra login-siden
  if (readLs(MODE_KEY) !== 'fresh' && (!stored || (stored.user?.id && stored.user.id !== DEFAULT_USER && readLs(AS_KEY)))) authStorage.setItem('hjem.auth', JSON.stringify(sessionFor(DEFAULT_USER)))
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
  api.download = (async (path: string) => {
    await ready
    const f = files.get(path)
    return f ? { data: f, error: null } : { data: null, error: new Error('not found') }
  }) as unknown as typeof api.download
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
