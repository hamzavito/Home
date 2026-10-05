# Backup og gendannelse

Alt er gratis. Der er to lag:

| | Hvad | Hvor | Hvor ofte |
|---|---|---|---|
| **Automatisk** | Hele databasen: brugere, husstand, profiler, faste poster (med historik), budgetter, udgifter, kommende udgifter, kvitteringsmetadata, opsparing, indkøb, opgaver og kalender | GitHub → Actions → *Backup* → artefakt, krypteret med AES-256 | Hver søndag nat (gemmes 90 dage ≈ 13 backups). Kan også startes manuelt med *Run workflow* |
| **Manuel** | Samme data for jeres husstand som én JSON-fil | Indstillinger → *Eksportér data* → gem i Filer/iCloud | Når I vil, fx inden store ændringer |

**Ikke med:** kvitteringsbilleder. De er midlertidige efter jeres eget valg (opbevaringstid) og slettes automatisk; udgiften og kvitteringens oplysninger er altid med i backuppen.

Supabase Free har ingen egne backups, man selv kan hente – derfor denne løsning.

## Opsætning (én gang)

1. Supabase → projektet → **Connect** → kopiér forbindelsesstrengen under **Session pooler** (IPv4 – GitHubs maskiner kan ikke bruge den direkte IPv6-forbindelse). Indsæt databasens adgangskode i strengen.
2. Lav en lang, tilfældig adgangsfrase (fx 6 tilfældige ord). **Gem den i jeres password manager** – uden den kan backuppen ikke åbnes.
3. GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = strengen fra trin 1
   - `BACKUP_PASSPHRASE` = frasen fra trin 2
4. GitHub → **Actions → Backup → Run workflow**. Efter ca. 1 minut ligger filen `hjem-backup-ÅÅÅÅ-MM-DD.tar.gz.gpg` under kørslen.

Bemærk: GitHub stopper planlagte workflows i offentlige repositories efter 60 dage uden aktivitet (de sender en mail). Klik så blot *Enable workflow*.

## Gendannelse

Kræver `gpg`, `tar` og PostgreSQL 17-klientværktøjer (`psql`) på en computer.

1. Hent artefaktet fra GitHub (Actions → Backup → vælg kørsel → *Artifacts*) og pak zip-filen ud.
2. Dekryptér og pak ud:
   ```sh
   gpg -d hjem-backup-2026-10-04.tar.gz.gpg | tar -xz
   ```
3. Opret et **nyt, tomt** Supabase-projekt (eller nulstil det gamle) og kør migrations fra backuppen i rækkefølge i SQL Editor eller med psql:
   ```sh
   for f in hjem-backup-2026-10-04/migrations/*.sql; do psql "$NY_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
4. Gendan data (alt i én transaktion – fejler noget, ændres intet):
   ```sh
   bash scripts/backup/restore.sh "$NY_DB_URL" hjem-backup-2026-10-04
   ```
5. Hvis det er et nyt projekt: opsæt resten som i `docs/SETUP.md` (Auth-indstillinger, e-mailskabelon, Storage-bucket via migrations, oprydningsfunktion, Vercel-miljøvariabler med det nye projekts URL og nøgle). I logger ind med de samme e-mails og adgangskoder som før.

Fremgangsmåden er testet automatisk: `supabase/tests/backup_restore.sh` tager en backup, gendanner den i en ny database og kontrollerer, at alle tabeller er identiske.

### Kun én tabel eller én række

Åbn `public.sql` fra backuppen og kopiér de relevante `COPY`-linjer, eller brug JSON-eksporten til at slå gamle værdier op.
