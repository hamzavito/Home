# Hjem

Privat PWA til vores husstand: økonomi, budgetter, kvitteringer, opsparing, indkøb, opgaver og kalender.

**Stack:** Vite · React · TypeScript · Tailwind · TanStack Query · Supabase (Postgres, Auth, Storage) · Vercel

Arkitektur: [`docs/PLAN.md`](docs/PLAN.md) · Opsætning: [`docs/SETUP.md`](docs/SETUP.md) · Backup: [`docs/BACKUP.md`](docs/BACKUP.md) · Design: [`docs/DESIGN.md`](docs/DESIGN.md)

## Udvikling

```bash
cp .env.example .env.local   # udfyld Supabase-URL og anon key
npm install
npm run dev
```

| Kommando | Hvad |
|---|---|
| `npm run dev` | Udviklingsserver |
| `npm run build` | Typecheck + produktionsbuild |
| `npm run lint` | ESLint |
| `npm test` | Enhedstests (Vitest) |
| `npm run test:db` | Migrations, RLS-/sikkerhedsrevision, samtidighed og backup→gendannelse mod en midlertidig lokal Postgres |
| `npm run test:e2e` | Playwright-tests (iPhone 13, lyst + mørkt, axe-kontrast) mod appen med en demo-backend i browseren |
| `npm run check:contrast` | WCAG AA-tjek af alle farvetokens |
| `npm run check:pwa` | Tjek af manifest, ikoner, startskærme, service worker og at ingen hemmeligheder er i bundlen (efter build) |
| `npm run icons` | Generér ikoner og iOS-startskærme fra `public/icons/icon.svg` |

## Struktur

```
src/app/         router, layout, bundnavigation, +-menu
src/features/    én mappe pr. område (auth, dashboard, settings, …)
src/components/  genbrugelige UI-komponenter
src/lib/         supabase-klient, beløb (øre), datoer, tema
supabase/        migrations, opsætningsscript og database-tests
```

## Sikkerhed

- Frontenden kender kun Supabase-URL og den offentlige anon key. Al adgang styres af Row Level Security.
- Service-role-nøglen bruges aldrig i frontenden og må ikke have `VITE_`-præfiks.
