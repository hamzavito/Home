# Opsætning (engangsopgaver)

Disse trin kræver din egen konto hos Supabase og Vercel. Alt sker på gratis-planerne.

## 1. Supabase-projekt

1. Opret et projekt på <https://supabase.com/dashboard> (Free plan).
   Vælg region **Central EU (Frankfurt)** eller **North EU (Stockholm)**. Gem database-adgangskoden i din password manager.
2. **Slå offentlig tilmelding fra:**
   *Authentication → Sign In / Providers → "Allow new users to sign up" = OFF*.
   Lad **Email**-provideren være slået til (bruges til login med adgangskode).
3. **Kør migrationerne** i rækkefølge: Åbn *SQL Editor*, indsæt indholdet af hver fil i
   `supabase/migrations/` (sorteret efter navn) og tryk *Run*:
   1. `20261004000001_household_core.sql`
   2. `20261005000001_budgets_transactions.sql`
   3. `20261006000001_receipts.sql` (opretter også den private Storage-bucket `receipts`)
   4. `20261007000001_fixed_economy.sql`
   5. `20261008000001_upcoming_savings.sql`
   6. `20261009000001_home.sql` (slår også Realtime til for indkøbslisten)
   7. `20261010000001_settings_export.sql`
   8. `20261011000001_cleanup_secret.sql`
   9. `20261012000001_calendar_for_user.sql`
   10. `20261013000001_push_notifications.sql`
   (Alternativ med CLI: `npx supabase link --project-ref <ref>` og `npx supabase db push`.)
4. **Opret jer to brugere:** *Authentication → Users → Add user → Create new user*.
   Udfyld e-mail og adgangskode, og sæt flueben i **Auto Confirm User**.
5. **Opret husstanden:** Åbn `supabase/setup/create_household.sql`, ret navne og e-mails øverst
   og kør scriptet i *SQL Editor*. Det kan køres igen uden at lave dubletter.
6. **Find nøglerne:** *Project Settings → API* (eller *API Keys*):
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` / publishable key → `VITE_SUPABASE_ANON_KEY`
   - **Brug ikke** `service_role` / secret key i Vercel eller frontend.

7. **Nulstilling af adgangskode med kode (i stedet for link):**
   *Authentication → Emails → Templates → Reset Password*. Udskift indholdet med fx:

   ```html
   <h2>Nulstil adgangskode</h2>
   <p>Skriv denne kode i Hjem-appen:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Koden udløber om lidt. Har du ikke bedt om den, kan du se bort fra mailen.</p>
   ```

   Emnelinje fx: `Din kode til Hjem`. Linket (`{{ .ConfirmationURL }}`) skal **ikke** med,
   for det ville åbne Safari i stedet for den installerede app.
   *Bemærk:* Supabases indbyggede mailafsendelse er kraftigt begrænset (få mails i timen),
   og på nyere projekter sender den kun til e-mails, der er medlemmer af jeres Supabase-organisation.
   Inviter derfor også din kones e-mail til organisationen (*Organization → Team*). Gratis.
   Alternativet er en egen SMTP-udbyder, men det gør vi kun efter aftale.

8. **Daglig oprydning af kvitteringsbilleder:**
   1. Kør migration `20261011000001_cleanup_secret.sql` (følger med de øvrige migrations).
   2. Deploy Edge Function `cleanup-receipts` med **verify_jwt slået fra** (den tjekker selv
      headeren `x-cleanup-secret`): `npx supabase functions deploy cleanup-receipts --no-verify-jwt`.
   3. Ret projektets ref øverst i `supabase/setup/schedule_cleanup.sql` og kør scriptet i *SQL Editor*.
      Det slår pg_cron og pg_net til, genererer en hemmelighed på 256 bit direkte i Supabase Vault
      og planlægger jobbet. Hemmeligheden skal ikke kopieres nogen steder hen.
   4. Kontrollér med forespørgslerne nederst i scriptet.

   Oprydningen sletter kun billedfiler: udløbne billeder, forladte uploads (> 24 t) og forældreløse filer.
   Transaktioner og kvitteringsoplysninger bevares altid. Den kan køres flere gange uden problemer.

9. **Notifikationer (påmindelser om aftaler og nye varer på indkøbslisten):**
   1. Kør migration `20261013000001_push_notifications.sql` (følger med de øvrige migrations).
   2. Deploy Edge Function `send-push` med **verify_jwt slået fra** (den tjekker selv headeren
      `x-push-secret`): `npx supabase functions deploy send-push --no-verify-jwt`.
   3. Ret projektets ref og appens adresse øverst i `supabase/setup/schedule_push.sql` og kør scriptet
      i *SQL Editor*. Det gemmer en hemmelighed i Vault, planlægger et cron-job hvert minut (kalder kun
      Edge Functionen, når der er noget at sende) og laver VAPID-nøglerne. Intet skal kopieres.
   4. På iPhone: Hjem skal være føjet til hjemmeskærmen (iOS 16.4+). Slå til under
      *Indstillinger → Notifikationer → På denne telefon* og tryk *Send en testnotifikation*.

10. **Backup:** følg [docs/BACKUP.md](BACKUP.md) (to GitHub-secrets, ca. 5 minutter).

> **Custom SMTP senere:** Appen bruger kun Supabase Auth-kaldene (`resetPasswordForEmail`, `verifyOtp`,
> `updateUser`). Skift af mailserver sker under *Authentication → Emails → SMTP Settings* og kræver
> ingen ændringer i appen. Mailskabelonen med `{{ .Token }}` beholdes.

## 2. Vercel-projekt

> **Om 403-fejlen:** Den Vercel-forbindelse, Claude har adgang til, må ikke oprette projekter i teamet
> "Kava's projects". Det er en rettighed, der ikke skal omgås. Den nemmeste løsning er, at du selv
> opretter projektet (trinene nedenfor). Hvis Claude senere skal kunne læse deploy-status og logs, skal
> din rolle i teamet være *Owner* eller *Member* (*Team Settings → Members*), og Vercel-forbindelsen
> til Claude skal godkendes for hele teamet. Ellers kan du blot dele deploy-URL'en.


1. Gå til <https://vercel.com/new> og importér GitHub-repoet `hamzavito/home`.
2. Framework preset: **Vite** (findes automatisk). Build command `npm run build`, output `dist`.
3. Under *Environment Variables* tilføjes (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Uden variablerne viser appen en side om, at konfigurationen mangler. Det er forventet.
5. *Settings → Git → Production Branch*: vælg den branch, der skal være "live"
   (fx `main`, når branchen er merget).
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
