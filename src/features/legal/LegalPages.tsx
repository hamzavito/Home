import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'

// Offentlige sider (kræver ikke login). Ret her, når der kommer et firma/CVR og en offentlig e-mail.
export const LEGAL = {
  owner: 'Hamza Chahade',
  email: 'hamza6610@gmail.com',
  updated: '8. oktober 2026',
}

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh px-safe pb-safe pt-safe">
      <main className="mx-auto max-w-lg pb-16">
        <PageHeader title={title} back="/login" />
        <p className="mb-6 text-[14px] text-secondary">Sidst opdateret {LEGAL.updated}</p>
        <div className="space-y-6 text-[15px] leading-relaxed [&_h2]:mb-2 [&_h2]:text-[18px] [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
      </main>
    </div>
  )
}

const Mail = () => (
  <a className="font-semibold text-accent-text underline" href={`mailto:${LEGAL.email}`}>
    {LEGAL.email}
  </a>
)

export function PrivacyPage() {
  return (
    <LegalLayout title="Privatlivspolitik">
      <section>
        <h2>Hvem er ansvarlig</h2>
        <p>
          Hjem drives af {LEGAL.owner}, som er dataansvarlig for de oplysninger, der behandles i appen. Kontakt: <Mail />.
        </p>
      </section>
      <section>
        <h2>Hvilke oplysninger</h2>
        <ul>
          <li>Konto: e-mailadresse, navn og login (adgangskode gemmes kun krypteret; ved Apple/Google får vi kun e-mail og evt. navn).</li>
          <li>Det, I selv registrerer i husstanden: udgifter, budgetter, faste poster, indtægter, opsparing, kalender, opgaver, indkøb, madplan og børns lommepenge.</li>
          <li>Kvitteringsbilleder, hvis I vælger at gemme dem. De slettes automatisk efter den periode, I vælger.</li>
          <li>
            Bankdata, hvis du selv forbinder din bank: dato, beløb, tekst og modpartens navn på dine posteringer. Vi henter ikke saldo og gemmer ikke kontonumre (kun en
            uigenkendelig kode, så overførsler mellem egne konti kan genkendes). Kun du kan se dine bankposteringer, indtil du selv godkender dem til husstanden.
          </li>
          <li>Abonnement: status og plan. Kortoplysninger håndteres udelukkende af Stripe og gemmes aldrig hos os.</li>
        </ul>
      </section>
      <section>
        <h2>Formål og grundlag</h2>
        <p>
          Oplysningerne bruges kun til at levere appen til dig og din husstand (GDPR art. 6, stk. 1, litra b – opfyldelse af aftalen). Vi sælger ikke data, viser ikke
          reklamer og bruger ingen sporing eller analyse-cookies. Appen gemmer kun dit login og dine indstillinger lokalt på din enhed.
        </p>
      </section>
      <section>
        <h2>Hvem behandler data for os</h2>
        <ul>
          <li>Supabase (database, login og filer) – servere i EU (Irland).</li>
          <li>Vercel (hosting af selve appen).</li>
          <li>Enable Banking (godkendt udbyder af kontoinformation under PSD2) – kun hvis du forbinder din bank.</li>
          <li>Stripe (betaling af abonnement) – kun hvis husstanden betaler.</li>
          <li>Apple og Google – kun hvis du vælger at logge ind med dem.</li>
        </ul>
      </section>
      <section>
        <h2>Hvor længe</h2>
        <p>
          Data gemmes, så længe din konto og husstand findes. Adgangen til din bank gælder højst 180 dage ad gangen og kan fjernes når som helst under Indstillinger →
          Bank. Sletter du din konto, slettes dine oplysninger. Er du den sidste voksne i husstanden, slettes hele husstanden med alle data og billeder. Det, du har
          registreret i en husstand, der fortsætter, bliver i husstanden som "Tidligere medlem".
        </p>
      </section>
      <section>
        <h2>Dine rettigheder</h2>
        <p>
          Du kan få indsigt i, rette og slette dine oplysninger og få dem udleveret. Meget kan du selv: Indstillinger → Eksportér data og Indstillinger → Slet min konto.
          Ellers skriv til <Mail />. Du kan klage til Datatilsynet (datatilsynet.dk).
        </p>
      </section>
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Vilkår">
      <section>
        <h2>Tjenesten</h2>
        <p>
          Hjem er en app til husstandens økonomi, kalender, opgaver, indkøb og madplan, leveret af {LEGAL.owner} (<Mail />). Ved at oprette en konto accepterer du
          disse vilkår og vores privatlivspolitik.
        </p>
      </section>
      <section>
        <h2>Konto og husstand</h2>
        <ul>
          <li>Du skal være mindst 18 år for at oprette en konto. Børn får adgang gennem en voksen i husstanden.</li>
          <li>Du har én husstand ad gangen. Alle voksne i husstanden kan se og ændre husstandens data, også økonomien.</li>
          <li>Du er ansvarlig for at holde dit login hemmeligt og for, hvem du inviterer.</li>
        </ul>
      </section>
      <section>
        <h2>Bankforbindelse</h2>
        <p>
          Bankforbindelsen er frivillig og giver kun læseadgang til dine egne konti via Enable Banking. Hjem kan ikke flytte penge. Du kan fjerne forbindelsen når som
          helst.
        </p>
      </section>
      <section>
        <h2>Abonnement</h2>
        <p>
          Hvis og når der tages betaling, gælder det pris og den periode, der vises i appen, før du betaler. Betaling sker via Stripe, og du kan opsige når som helst;
          abonnementet løber så perioden ud. Uden gyldigt abonnement kan husstandens data stadig ses og eksporteres, men ikke ændres.
        </p>
      </section>
      <section>
        <h2>Ansvar</h2>
        <p>
          Hjem er et hjælpeværktøj og ikke økonomisk rådgivning. Vi gør vores bedste for, at appen virker og at data er sikre, men kan ikke garantere, at tjenesten altid
          er tilgængelig eller fejlfri. Tag gerne en eksport af jeres data en gang imellem. Ansvaret er begrænset til det beløb, du har betalt for tjenesten de seneste 12
          måneder, medmindre andet følger af ufravigelig lovgivning.
        </p>
      </section>
      <section>
        <h2>Ophør og ændringer</h2>
        <p>
          Du kan slette din konto når som helst under Indstillinger. Vi kan ændre vilkårene; væsentlige ændringer varsles i appen. Dansk ret gælder.
        </p>
      </section>
    </LegalLayout>
  )
}
