# Hjem – arkitektur og byggeplan

Privat PWA til to personer (én husstand): økonomi, budgetter, kvitteringer,
kommende udgifter, opsparing, indkøb, opgaver og kalender.

Status: **godkendt.** Fase 1 er bygget. Beslutningerne nedenfor har forrang for de detaljer i resten af dokumentet, der siger noget andet.

## Beslutninger (godkendt 4. okt. 2026)

1. **Budget:** Hver kategori har `default_monthly_amount_ore`. `monthly_budgets` er en overstyring for én måned.
   Effektivt budget = overstyring for måneden, ellers standardbeløbet. Ændres standardbeløbet,
   gælder det alle måneder uden overstyring.
   *Teknisk note (fase 2):* Så ældre måneder ikke ændrer sig med tilbagevirkende kraft, når standardbeløbet ændres,
   gemmes standardbeløbet med gyldighedsdato (`budget_category_defaults(category_id, valid_from, amount_ore)`).
   Det sikrer, at historikken aldrig ændrer sig.
2. **Betalt af:** `paid_by_kind in ('member','shared')` + `paid_by_user_id`. Fremmednøglen `(household_id, paid_by_user_id)` peger på
   `household_members`, og en check-constraint kræver bruger-id, præcis når typen er `member`. Navne kommer fra medlemmerne,
   så intet er hardcodet.
3. **Udløbne kvitteringer:** Rækken bevares. Billedfilen slettes fra Storage, `storage_path` sættes til `NULL`, og `image_deleted_at` sættes.
   Metadata (butik, beløb, købsdato, transaction_id, uploaded_by, created_at, delete_at) bevares. Transaktionen røres aldrig.
4. **Login:** e-mail + adgangskode, ingen offentlig tilmelding, "Husk mig", korrekt logout.
   Nulstilling af adgangskode laves med en 6-cifret kode i appen (ikke et link). Afventer godkendelse.
5. **Oprydning:** Supabase Cron (`pg_cron`) kører dagligt og kalder Edge Function `cleanup-receipts` via `pg_net`.
   Alt ligger i Supabase. Der bruges ingen GitHub Actions-keep-alive. Funktionen er idempotent.
6. **Backup (fase 6):** gratis, regelmæssig eksport af databasens data. Kvitteringsbilleder med kort levetid er ikke med.
7. **OCR** er kun en hjælp: Scan → OCR → vis → ret → vælg budget → *Godkend og gem*. Ingen transaktion før godkendelse.
8. **Soft delete:** `archived_at` på kategorier, opsparingsmål og andre elementer, som historik afhænger af.
   Fremmednøgler fra historik bruger `on delete restrict`, så historiske data ikke kan gå i stykker.


---

## 1. Anbefalet arkitektur

### Frontend

| Valg | Begrundelse |
|---|---|
| **Vite + React 19 + TypeScript** (SPA) | Appen er bag login, så SEO/SSR giver intet. En ren SPA er enklest at gøre til PWA, deployes som statiske filer på Vercel (ingen serverless-forbrug) og har færrest bevægelige dele. Next.js er unødvendig kompleksitet her. |
| **React Router** | Klient-routing, fungerer med Vercel via én rewrite til `index.html`. |
| **TanStack Query** | Caching, loading-states, refetch når appen kommer i forgrunden, optimistiske opdateringer (fx indkøbsliste). |
| **@supabase/supabase-js** | Direkte adgang til Postgres via RLS – ingen egen backend. |
| **Tailwind CSS v4** + få headless komponenter (Radix/vaul til bottom sheets) | Hurtigt at lave et roligt Apple-agtigt design med glas/blur, CSS-variabler til light/dark. |
| **react-hook-form + zod** | Formularer og validering. |
| **date-fns** med `da`-locale + `Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' })` | Danske datoer og kr.-format. |
| **vite-plugin-pwa** (Workbox) | Manifest, service worker, precache af app-shell. |
| **Tesseract.js** (lazy-loaded, i web worker) | Gratis OCR i browseren – se afsnit 4. |
| **Vitest** + **Playwright** (let) | Enhedstests af beregninger/parsing + et par E2E-flows. |

### Backend (Supabase Free)

- **Postgres** med RLS på alle tabeller.
- **Auth** (email + adgangskode, offentlig tilmelding slået fra).
- **Storage**: privat bucket `receipts`.
- **Edge Function** `cleanup-receipts` (Deno) – den eneste kode, der bruger service-role-nøglen.
- **SQL-funktioner (RPC)** til handlinger, der skal være atomare (godkend kvittering, markér kommende udgift som betalt, færdiggør gentagende opgave).
- **Migrations** i repoet under `supabase/migrations/` (Supabase CLI), og genererede TypeScript-typer (`supabase gen types`).

### Hosting / drift

- **Vercel Hobby**: statisk build fra GitHub, preview-deploys på branches.
- **GitHub Actions** (privat repo): CI (lint, typecheck, test) + daglig planlagt kørsel af oprydningen.

### Mappestruktur (forslag)

```
src/
  app/            # router, providers, layout, bottom-nav
  features/
    auth/ dashboard/ finance/ budgets/ receipts/ upcoming/
    savings/ shopping/ tasks/ calendar/ settings/
  components/ui/  # Card, ProgressBar, Sheet, AmountInput, ...
  lib/            # supabase-klient, money.ts, dates.ts, query-keys
  types/          # database.types.ts (genereret)
supabase/
  migrations/
  functions/cleanup-receipts/
  seed.sql
.github/workflows/
docs/
```

### Miljøvariabler og secrets

| Variabel | Hvor | Hemmelig? |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel + `.env.local` | Nej |
| `VITE_SUPABASE_ANON_KEY` (publishable key) | Vercel + `.env.local` | Nej – den er beregnet til browseren; sikkerheden ligger i RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Kun** Supabase Edge Function secrets | **Ja – aldrig i frontend/Vercel** |
| `CLEANUP_CRON_SECRET` | Edge Function secrets + GitHub Actions secret | Ja |

`.env.local` er i `.gitignore`; `.env.example` committes uden værdier.
Kun variabler med `VITE_`-præfiks kommer med i browser-bundlet, så service-role-nøglen kan ikke ved et uheld lække via Vite.

---

## 2. Database-schema

Generelle principper:

- Alle id'er er `uuid default gen_random_uuid()`.
- **Alle domænetabeller har `household_id`** (også underliggende tabeller som `shopping_items`), så RLS-policies er ens og simple overalt.
- **Beløb gemmes som heltal i øre (`bigint`)**, fx 638,75 kr. = `63875`. Ingen afrundingsfejl. Konvertering sker ét sted i `lib/money.ts`.
- **Sammensatte fremmednøgler** `(household_id, x_id) → x(household_id, id)` sikrer, at en transaktion aldrig kan pege på en kategori fra en anden husstand – selv hvis klienten sender forkerte data.
- `created_at`/`updated_at` (`timestamptz`), `updated_at` sættes af en fælles trigger.
- `created_by` default `auth.uid()`.
- Check constraints i stedet for Postgres-enums (lettere at ændre senere via migration).
- **"Forbrugt" gemmes ikke** – det beregnes altid ud fra transaktioner (view). Budgettet "opdateres automatisk", fordi der ikke er noget at holde synkront.

### Tabeller

```sql
-- Husstand og brugere ---------------------------------------------------
households (
  id uuid pk,
  name text not null,
  created_at, updated_at
)

profiles (                      -- 1:1 med auth.users
  id uuid pk references auth.users on delete cascade,
  display_name text not null,
  color text,                   -- farve/initialer i UI
  created_at, updated_at
)

household_members (
  household_id uuid references households on delete cascade,
  user_id uuid references profiles on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at,
  primary key (household_id, user_id),
  unique (user_id)              -- én husstand pr. bruger (forenkler appen)
)

-- Budgetter og økonomi ---------------------------------------------------
budget_categories (
  id uuid pk,
  household_id uuid not null references households,
  name text not null,
  icon text, color text,
  default_monthly_amount_ore bigint not null default 0 check (>= 0),
  sort_order int not null default 0,
  archived_at timestamptz,      -- arkivér i stedet for at slette (historik bevares)
  created_at, updated_at,
  unique (household_id, id),
  unique (household_id, name)
)

monthly_budgets (               -- budget pr. kategori pr. måned
  id uuid pk,
  household_id uuid not null,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount_ore bigint not null check (amount_ore >= 0),
  created_at, updated_at,
  unique (category_id, month),
  foreign key (household_id, category_id) references budget_categories (household_id, id)
)

receipts (
  id uuid pk,
  household_id uuid not null references households,
  storage_path text not null,   -- '{household_id}/{receipt_id}.jpg'
  uploaded_by uuid not null default auth.uid() references profiles,
  status text not null default 'pending'
        check (status in ('pending','approved','discarded')),
  -- OCR-forslag (kun forslag – bliver aldrig til en transaktion automatisk)
  ocr_status text not null default 'none'
        check (ocr_status in ('none','processing','done','failed')),
  ocr_merchant text, ocr_date date, ocr_total_ore bigint, ocr_raw_text text,
  suggested_category_id uuid,
  -- Levetid
  retention text not null default '30d'
        check (retention in ('30d','3m','6m','1y','custom','permanent')),
  delete_at timestamptz,        -- NULL = behold permanent
  check ((retention = 'permanent') = (delete_at is null)),
  created_at, updated_at,
  unique (household_id, id)
)

transactions (
  id uuid pk,
  household_id uuid not null references households,
  category_id uuid not null,
  amount_ore bigint not null check (amount_ore > 0),
  occurred_on date not null,
  description text not null,    -- fx 'Bilka'
  note text,
  paid_by uuid references profiles,      -- NULL = fælles
  created_by uuid not null default auth.uid() references profiles,
  source text not null default 'manual'
        check (source in ('manual','receipt','upcoming')),
  receipt_id uuid references receipts on delete set null,  -- billedet kan udløbe, transaktionen består
  created_at, updated_at,
  foreign key (household_id, category_id) references budget_categories (household_id, id)
)

upcoming_expenses (
  id uuid pk,
  household_id uuid not null,
  title text not null,
  amount_ore bigint not null check (amount_ore > 0),
  due_on date not null,
  category_id uuid not null,
  note text,
  status text not null default 'upcoming'
        check (status in ('upcoming','paid','cancelled')),
  created_by uuid not null default auth.uid() references profiles,
  paid_at timestamptz,
  transaction_id uuid unique references transactions on delete set null,
  created_at, updated_at,
  foreign key (household_id, category_id) references budget_categories (household_id, id)
)

-- Opsparing ---------------------------------------------------------------
savings_goals (
  id uuid pk,
  household_id uuid not null references households,
  name text not null,
  target_amount_ore bigint not null check (> 0),
  target_date date,
  note text,
  archived_at timestamptz,
  created_by, created_at, updated_at,
  unique (household_id, id)
)

savings_transactions (          -- indbetalinger; nuværende beløb = sum
  id uuid pk,
  household_id uuid not null,
  goal_id uuid not null,
  amount_ore bigint not null check (amount_ore > 0),
  occurred_on date not null default current_date,
  note text,
  created_by, created_at,
  foreign key (household_id, goal_id) references savings_goals (household_id, id) on delete cascade
)
-- Startbeløb ved oprettelse registreres som første indbetaling.

-- Indkøb ------------------------------------------------------------------
shopping_lists (
  id uuid pk, household_id uuid not null references households,
  name text not null, created_at, updated_at,
  unique (household_id, id)
)  -- seedes med én liste "Indkøb"; UI viser kun én liste i v1

shopping_items (
  id uuid pk, household_id uuid not null, list_id uuid not null,
  name text not null, quantity text, note text,
  is_checked boolean not null default false,
  checked_by uuid references profiles, checked_at timestamptz,
  added_by uuid not null default auth.uid() references profiles,
  sort_order int not null default 0,
  created_at, updated_at,
  foreign key (household_id, list_id) references shopping_lists (household_id, id) on delete cascade
)

-- Opgaver -----------------------------------------------------------------
household_tasks (
  id uuid pk, household_id uuid not null references households,
  title text not null, description text,
  assignee_id uuid references profiles,
  due_on date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','in_progress','done')),
  recurrence text not null default 'none'
        check (recurrence in ('none','daily','weekly','monthly','yearly')),
  completed_at timestamptz,
  created_by, created_at, updated_at
)
-- Gentagelse: når en gentagende opgave sættes til 'done', opretter RPC'en
-- complete_task() næste forekomst med ny due_on. Simpelt og uden cron.

-- Kalender ----------------------------------------------------------------
calendar_events (
  id uuid pk, household_id uuid not null references households,
  title text not null,
  event_date date not null,
  start_time time, end_time time,          -- begge NULL = heldagsbegivenhed
  check (end_time is null or start_time is null or end_time > start_time),
  description text,
  type text not null default 'family'
        check (type in ('family','work','doctor','vacation','kids','other')),
  created_by, created_at, updated_at
)
```

### Views (med `security_invoker = true`, så RLS gælder)

- `v_budget_month` – pr. kategori og måned: budget (`monthly_budgets` → ellers `default_monthly_amount_ore`), forbrug (sum af transaktioner), tilbage, procent.
- `v_savings_goal_progress` – mål + nuværende beløb (sum) + procent.

### Indekser

`transactions (household_id, occurred_on)`, `transactions (category_id, occurred_on)`,
`receipts (delete_at) where delete_at is not null`, `upcoming_expenses (household_id, status, due_on)`,
`calendar_events (household_id, event_date)`, `household_tasks (household_id, status)`.

### Små designforslag (afviger lidt fra din liste – forklaret)

1. **`default_monthly_amount_ore` på kategorien** + `monthly_budgets` som månedlig overstyring. Så behøver I ikke indtaste alle budgetter igen hver måned, men kan stadig sætte et særligt beløb for fx december. Hvis I hellere vil have, at hver måned altid sættes eksplicit, fjerner vi feltet.
2. **"Nuværende beløb" på opsparing er beregnet** (sum af indbetalinger) i stedet for et felt, der kan komme ud af sync.
3. **Kvitteringen slettes helt ved udløb** (ikke anonymiseres). Transaktionen har allerede butik, dato, beløb og kategori, og `receipt_id` sættes automatisk til NULL. Det er den enkleste og mest privatlivsvenlige løsning.

---

## 3. Authentication og household-adgang

### Login

- **Email + adgangskode.** Offentlig tilmelding slås fra i Supabase (*Auth → Allow new users to sign up = off*).
- I to oprettes manuelt i Supabase-dashboardet (*Invite user* / *Add user*).
- **Hvorfor ikke magic link?** På iPhone åbner et link fra mail i Safari – ikke i den installerede PWA, som har sin egen separate lagring. Man ville altså blive logget ind i det forkerte "vindue". Supabases indbyggede mailafsendelse er desuden kraftigt rate-limitet på free. Adgangskode (gemt i iCloud-nøgleringen) er den mest friktionsfri løsning.
- Sessionen huskes (refresh token i `localStorage` i PWA'en), så I sjældent skal logge ind igen.

### Husstand

- En engangs-SQL (`supabase/seed.sql` / et lille admin-script) opretter husstanden og indsætter jer begge i `household_members`. Ingen "opret husstand"/"inviter"-UI i v1 – det er ikke nødvendigt for to faste brugere.
- En trigger på `auth.users` opretter automatisk en `profiles`-række.
- Hvis en bruger er logget ind men ikke er medlem af en husstand, viser appen blot "Din konto er ikke tilknyttet en husstand".

### RLS-strategi

1. `alter table ... enable row level security` på **alle** tabeller i `public`.
2. To hjælpefunktioner (`security definer`, `stable`, `search_path` låst):

   ```sql
   create function public.is_household_member(hid uuid) returns boolean
   language sql stable security definer set search_path = '' as $$
     select exists (
       select 1 from public.household_members
       where household_id = hid and user_id = (select auth.uid())
     );
   $$;

   create function public.current_household_id() returns uuid ...  -- bruges som default
   ```

   `security definer` forhindrer rekursion, når `household_members` selv har RLS.

3. Samme fire policies på hver domænetabel (kun for rollen `authenticated`):

   ```sql
   create policy "select own household" on public.transactions
     for select to authenticated using (public.is_household_member(household_id));
   create policy "insert own household" on public.transactions
     for insert to authenticated with check (public.is_household_member(household_id));
   create policy "update own household" on public.transactions
     for update to authenticated
     using (public.is_household_member(household_id))
     with check (public.is_household_member(household_id));
   create policy "delete own household" on public.transactions
     for delete to authenticated using (public.is_household_member(household_id));
   ```

4. Særtilfælde:
   - `households`: kun `select` (og `update` af navn) for medlemmer; ingen insert/delete fra klienten.
   - `household_members`: kun `select` for medlemmer af samme husstand; ændringer kun via SQL/dashboard.
   - `profiles`: læs egne og husstandsmedlemmers profiler; opdatér kun egen.
   - `anon`-rollen har ingen adgang til noget.
5. Sammensatte fremmednøgler (afsnit 2) forhindrer krydshenvisninger mellem husstande.
6. RPC-funktioner (`approve_receipt`, `mark_upcoming_paid`, `complete_task`) er `security invoker`, så de kører med brugerens rettigheder og RLS gælder også inde i dem.
7. **Tests af RLS**: pgTAP-tests (`supabase test db`) med en "fremmed" testbruger, der skal få 0 rækker og fejl ved insert.

---

## 4. Kvitteringssystemet

### Upload-flow

1. Knap **"Scan kvittering"** → `<input type="file" accept="image/*" capture="environment">`.
   På iPhone giver det valget *Tag billede* / *Fotobibliotek* – virker også i standalone-PWA.
2. Billedet **komprimeres i browseren** (canvas → JPEG, max ca. 1600 px, kvalitet ~0,8 ⇒ typisk 200–400 KB). Det håndterer også HEIC fra iPhone og holder os langt under 1 GB storage-grænsen.
3. Der oprettes en `receipts`-række (`status = 'pending'`, `delete_at = now() + 30 dage`), og filen uploades til den **private** bucket `receipts` under `{household_id}/{receipt_id}.jpg`.
4. OCR kører (se nedenfor), og formularen udfyldes med forslag.
5. Brugeren retter butik/dato/beløb, vælger kategori, vælger levetid.
6. **"Godkend og gem"** → RPC `approve_receipt(receipt_id, merchant, date, amount_ore, category_id, retention, delete_at)` opretter transaktionen (`source = 'receipt'`) og sætter `status = 'approved'` i **én databasetransaktion**.
7. Først nu tæller beløbet i budgettet. Annullerer brugeren, sættes `status = 'discarded'` og billedet slettes.

Billeder vises via **signed URLs** med kort levetid (fx 10 min.) – aldrig offentlige links.

Storage-policies på `storage.objects` (bucket `receipts`): læs/upload/slet kun når
`public.is_household_member(((storage.foldername(name))[1])::uuid)`.

### OCR – undersøgelse af gratis muligheder

| Løsning | Pris | Vurdering |
|---|---|---|
| **Tesseract.js i browseren** | **Gratis**, intet sendes ud af telefonen | Realistisk til privat brug. Har dansk sprogdata. Kvalitet på kvitteringer er *middel*: totalbeløb og dato fanges ofte, butiksnavn er mere svingende. Tager typisk få sekunder til ~15 sek. på en iPhone. Sprogdata (få MB) caches efter første brug. |
| Apple Live Text | Gratis | Ingen web-API – kan ikke kaldes fra en PWA. |
| Google Cloud Vision / Azure / AWS Textract | Gratis kvote, men **kræver kreditkort/betalingskonto** | Bedre kvalitet, men kan medføre omkostninger. **Bruges ikke uden din godkendelse.** |
| LLM-baseret (Claude, Gemini, OpenAI vision) | Typisk betalt pr. kald; evt. gratis kvoter har vilkår om databrug | Bedst kvalitet + kan foreslå kategori. **Bruges ikke uden din godkendelse.** |

**Anbefaling:** Tesseract.js nu, bag et lille interface:

```ts
interface ReceiptAnalyzer {
  analyze(image: Blob): Promise<{ merchant?: string; date?: string; totalOre?: number; rawText: string }>;
}
```

Så kan en anden analyzer (fx en Edge Function med en betalt API) skiftes ind senere uden at røre flowet.
Efter OCR kører en dansk **parser** (ren TypeScript, enhedstestet):

- **Beløb**: linjer med `TOTAL`, `I ALT`, `AT BETALE`, `BELØB`, `DANKORT`, `KORT` → største passende beløb; dansk talformat (`1.234,50`).
- **Dato**: `dd.mm.yy`, `dd-mm-yyyy`, `dd/mm/yyyy` m.m.; datoer i fremtiden eller >1 år gamle ignoreres.
- **Butik**: match mod en liste over kendte kæder (Netto, Føtex, Bilka, Rema 1000, Lidl, Coop 365, Meny, Kvickly, SuperBrugsen, Salling, Normal, Matas, IKEA …) – ellers første tekstlinje.
- **Kategoriforslag**: den kategori, I senest brugte for samme butik (opslag i jeres egne transaktioner – ingen ny tabel), ellers en lille indbygget mapping (dagligvarekæder → Dagligvarer).

Fejler OCR helt, vises tomme felter, og billedet er stadig gemt – flowet virker uanset.

### Levetid og automatisk sletning

Valg i UI → `delete_at`:

| Valg | `retention` | `delete_at` |
|---|---|---|
| 30 dage (standard) | `30d` | `created_at + 30 days` |
| 3 måneder | `3m` | `+ 3 months` |
| 6 måneder | `6m` | `+ 6 months` |
| 1 år | `1y` | `+ 1 year` |
| Vælg dato | `custom` | valgt dato (slutningen af dagen, dansk tid) |
| Behold permanent | `permanent` | `NULL` |

Levetiden kan ændres senere fra kvitteringens detaljevisning.

**Oprydning (mindst dagligt):**

- Edge Function `cleanup-receipts` (Deno, bruger service-role-nøglen, kræver header `x-cron-secret`):
  1. Hent op til 200 `receipts` hvor `delete_at < now()` (inkl. `pending`/`discarded`, så forladte uploads også ryddes).
  2. Slet filerne via Storage-API'et (`storage.from('receipts').remove(paths)`). *Bemærk: man må ikke slette direkte i `storage.objects` med SQL – så ligger filen tilbage.*
  3. Slet `receipts`-rækkerne. `transactions.receipt_id` sættes automatisk til NULL (`on delete set null`), så **transaktionen bevares** ("Bilka – 638,75 kr. – Dagligvarer").
  4. Gentag til der ikke er flere; idempotent, så en fejlet kørsel bare tages med næste dag.
- **Planlægning: GitHub Actions** workflow med `schedule: cron` én gang i døgnet kalder funktionen.
  - Gratis i et privat repo (2.000 min./md.; dette bruger ~1 min./md.).
  - Fungerer samtidig som "keep-alive", så Supabase Free-projektet ikke pauses efter 7 dages inaktivitet (fx når I er på ferie).
  - Alternativ: `pg_cron` + `pg_net` direkte i Supabase. Virker også gratis, men holder ikke projektet "aktivt" på samme måde. Vi kan sagtens bruge begge.
- Appen skjuler desuden kvitteringer, hvor `delete_at` er passeret, selv hvis oprydningen ikke har kørt endnu.

---

## 5. Gratis drift

| Tjeneste | Plan | Forventet forbrug for 2 brugere | Pris |
|---|---|---|---|
| Vercel | Hobby (privat, ikke-kommerciel brug) | Statisk SPA, ingen serverless | 0 kr. |
| Supabase | Free (ca. 500 MB database, 1 GB filer, 5 GB trafik/md.) | Database: få MB pr. år. Kvitteringer á ~300 KB ⇒ ~3.000 billeder før 1 GB – og med 30 dages standardlevetid bliver det langt færre | 0 kr. |
| Supabase Edge Functions | Free-kvote | 1 kald/dag | 0 kr. |
| GitHub | Privat repo + Actions | CI + daglig cron | 0 kr. |
| OCR | Tesseract.js i browseren | Kører på telefonen | 0 kr. |
| Domæne | `*.vercel.app` | – | 0 kr. (eget domæne ville koste ~100 kr./år – valgfrit) |

**Ting I skal kende til (ingen af dem koster penge):**

- **Pause ved inaktivitet**: Supabase Free pauser projekter efter ca. 7 dage uden aktivitet. Den daglige GitHub Action forhindrer det i praksis; ellers kan man genstarte projektet med ét klik.
- **Ingen automatiske backups** på Supabase Free. Forslag (valgfrit, senere): en ugentlig GitHub Action, der laver `pg_dump` af databasen til en privat artifact. Siger I til, tilføjer vi det i fase 6.
- **Vercel Hobby** må kun bruges ikke-kommercielt – det passer til jer.
- Grænser og vilkår hos Supabase/Vercel kan ændre sig; vi tjekker dem igen ved opsætningen.

**Ting der _kan_ koste penge, og som vi ikke gør uden at spørge:**
betalt OCR/AI-API, Supabase Pro (fx for backups/ingen pause), eget domæne, push-notifikationer via tredjepart.

---

## 6. Byggeplan i faser

Hver fase afsluttes med: kørende app på Vercel, migrations i repoet, kort gennemgang med jer før næste fase.

### Fase 1 – Fundament
- Vite + React + TS, Tailwind, ESLint/Prettier, Vitest, GitHub Actions CI.
- Supabase-projekt, CLI, første migration: `households`, `profiles`, `household_members`, `updated_at`-trigger, hjælpefunktioner, RLS.
- Seed-script til jeres husstand; tilmelding slået fra.
- Login-skærm (email + adgangskode), "glemt adgangskode", log ud.
- `HouseholdProvider` (henter jeres household_id én gang).
- App-shell: bottom navigation (Hjem · Økonomi · **+** · Hjemmet · Mere), "Tilføj"-sheet (knapper findes, men peger på "kommer snart" indtil faserne er bygget), "Mere"-side.
- Designsystem: farver/tokens for light + dark, Card, ProgressBar, AmountInput, Sheet, tomme tilstande, skeleton-loading.
- Vercel-projekt koblet til GitHub, miljøvariabler sat.
- Basis-manifest + viewport/safe-area, så I allerede kan lægge den på hjemmeskærmen og teste.

### Fase 2 – Budgetter, transaktioner, dashboard
- Migration: `budget_categories`, `monthly_budgets`, `transactions`, `v_budget_month`.
- Budgetter: opret/redigér/arkivér kategorier, sæt beløb pr. måned, progress bars.
- Økonomi: ny/redigér/slet transaktion, månedsvælger, total + pr. kategori + pr. person.
- Dashboard: tilbage/forbrugt/samlet budget for måneden, top-kategorier, genvej "Ny udgift".
- Tests: øre-konvertering, månedsberegninger, RLS-tests.

### Fase 3 – Kvitteringer
- Migration: `receipts`, storage-bucket + policies, `approve_receipt`-RPC.
- Kamera/upload, komprimering, upload med progress.
- Tesseract.js-analyzer + dansk parser (med enhedstests på eksempeltekster).
- Gennemse-og-godkend-skærm, levetidsvalg, kvitteringsliste og -visning (signed URLs).
- Edge Function `cleanup-receipts` + GitHub Actions-cron.
- Dashboard-genvej "Scan kvittering".

### Fase 4 – Kommende udgifter og opsparing
- Migration: `upcoming_expenses`, `mark_upcoming_paid`-RPC, `savings_goals`, `savings_transactions`, `v_savings_goal_progress`.
- Kommende udgifter: liste, opret/redigér, status; ved "Betalt" → dialog *"Vil du registrere denne som en udgift?"* → opretter transaktion atomisk.
- Opsparing: mål, indbetalinger, progress og procent.
- Dashboard: kommende udgifter og aktive opsparingsmål.

### Fase 5 – Indkøb, opgaver, kalender
- Migration: `shopping_lists` (+ seed af én liste), `shopping_items`, `household_tasks`, `complete_task`-RPC, `calendar_events`.
- Indkøb: hurtig tilføjelse, afkryds, redigér, slet, "tilføjet af".
- Opgaver: liste filtreret på status/ansvarlig, prioritet, gentagelse.
- Kalender: månedsoversigt + dagsliste, opret/redigér, typer med farver.
- Dashboard: kommende aftaler og åbne opgaver.

### Fase 6 – PWA, polish og tests
- Fuld PWA: ikoner (inkl. `apple-touch-icon`), splash/statusbar-farver, service worker med app-shell-cache, "ingen forbindelse"-tilstand, opdateringsprompt ved ny version.
- iPhone-finpudsning: safe-areas, tastatur over formularer, haptisk-agtige animationer, pull-to-refresh hvor naturligt.
- Dark mode-gennemgang, tilgængelighed (kontrast, størrelser).
- Playwright-E2E for de vigtigste flows (login, ny udgift, godkend kvittering).
- Valgfrit: ugentlig backup-workflow (kun hvis I ønsker det).

---

## Åbne spørgsmål til jer

1. Skal budgetter have et **standardbeløb pr. kategori** (anbefalet), eller vil I sætte hver måned manuelt?
2. Skal **"Betalt af"** også kunne være *"Fælles"* (anbefalet: ja = tomt felt)?
3. Er det i orden, at en udløbet kvittering **slettes helt** (transaktionen bevares)?
4. Er **email + adgangskode** ok som login?
