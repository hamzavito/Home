# Kalenderintegrationer og familietavle

## Implementeret i denne PR
- Ugeoversigt på den eksisterende kalenderside, uden ændringer i eksisterende aftaler.
- Beskyttet fuldbreddevisning på `/tavle` med kalender, opgaver og indkøb.
- Tavlen anvender eksisterende Supabase-query hooks og henter ændringer løbende.
- Intet nyt databasedesign eller eksterne adgangsoplysninger kræves.

## Vigtig sikkerhedsbegrænsning
`calendar_events` giver allerede medlemmer af en husstand læseadgang. Filtreringen af eventtyper på tavlen er kun visuel, ikke adgangskontrol. Tavlen kræver derfor almindeligt login på en betroet enhed og må ikke bruges som anonym/kiosk-login eller modtage private kalenderdata i den fælles tabel. Del aldrig personlige sessions eller bank- og helbredsoplysninger til en Nest Hub.

## Næste PR'er
1. Privat eksternt kalenderlager med ejerbaseret RLS; deling som eksplicit opt-in, samt sikre visningsprojektioner.
2. Google Calendar OAuth + kontrollerede ICS-feeds til fx Aula, DBU og KavaPlan, hvis tilgængelige. Serverbaseret synkronisering, deduplikering, tidszoner/DST og aflysninger. Feed-URL og tokens skal beskyttes mod lækage og SSRF.
3. Skærmparring med tidsbegrænsede engangskoder og særskilte, tilbagekaldelige tilladelser.
4. Nest Hub Cast-kompatibilitet undersøges separat; tablet-browser er primær skærm.

## Verifikation før merge
Kør `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` og `npm run test:e2e`. Kontrollér især dataadgang og at tavlen ikke viser beskrivelser eller lægebegivenheder.
