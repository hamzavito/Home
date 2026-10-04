# Opsætning (engangsopgaver)

Disse trin kræver din egen konto hos Supabase og Vercel. Alt sker på gratis-planerne.

## 1. Supabase-projekt

1. Opret et projekt på <https://supabase.com/dashboard> (Free plan).
   Vælg region **Central EU (Frankfurt)** eller **North EU (Stockholm)**. Gem database-adgangskoden i din password manager.
2. **Slå offentlig tilmelding fra:**
   *Authentication → Sign In / Providers → "Allow new users to sign up" = OFF*.
   Lad **Email**-provideren være slået til (bruges til login med adgangskode).
3. **Kør migrationen:** Åbn *SQL Editor*, indsæt indholdet af
   `supabase/migrations/20261004000001_household_core.sql` og tryk *Run*.
   (Alternativ med CLI: `npx supabase link --project-ref <ref>` og `npx supabase db push`.)
4. **Opret jer to brugere:** *Authentication → Users → Add user → Create new user*.
   Udfyld e-mail og adgangskode, og sæt flueben i **Auto Confirm User**.
5. **Opret husstanden:** Åbn `supabase/setup/create_household.sql`, ret navne og e-mails øverst
   og kør scriptet i *SQL Editor*. Det kan køres igen uden at lave dubletter.
6. **Find nøglerne:** *Project Settings → API* (eller *API Keys*):
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` / publishable key → `VITE_SUPABASE_ANON_KEY`
   - **Brug ikke** `service_role` / secret key i Vercel eller frontend.

## 2. Vercel-projekt

1. Gå til <https://vercel.com/new> og importér GitHub-repoet `hamzavito/home`.
2. Framework preset: **Vite** (findes automatisk). Build command `npm run build`, output `dist`.
3. Under *Environment Variables* tilføjes (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Uden variablerne viser appen en side om, at konfigurationen mangler. Det er forventet.
5. *Settings → Git → Production Branch*: vælg den branch, der skal være "live"
   (fx `main`, når fase 1 er merget).
6. Tilbage i Supabase: *Authentication → URL Configuration → Site URL* = jeres Vercel-URL.

## 3. Installér på iPhone

1. Åbn Vercel-URL'en i **Safari**.
2. Tryk på **Del** → **Føj til hjemmeskærm** → **Tilføj**.
3. Åbn appen fra hjemmeskærmen og log ind. Den installerede app har sin egen login-session,
   adskilt fra Safari. Med "Husk mig" slået til forbliver I logget ind.

## Lokal udvikling

```bash
cp .env.example .env.local   # indsæt URL og anon key
npm install
npm run dev
```
