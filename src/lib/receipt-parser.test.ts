import { describe, expect, it } from 'vitest'
import { amountsInLine, parseReceiptText } from './receipt-parser'
import { parseKr } from './money'

const today = new Date(2026, 9, 5, 12)

const BILKA = `
BILKA
Bilka Tilst
Tilst Skolevej 2, 8381 Tilst
CVR 35954716   Tlf 89 30 63 00
SALG
MÆLK LETMÆLK 1L        11,95
RUGBRØD                22,00
KAFFE 400G             54,95
BANANER 1,234 KG       24,68
SUBTOTAL              638,75
HERAF MOMS 25%        127,75
TOTAL                 638,75
DANKORT
BELØB DKK             638,75
04.10.2026  14:32   KASSE 7
`

const NETTO_OCR_NOISE = `
netto
Holmevej 12
8000 Aarhus C
ÆBLER                   1O,OO
BRØD                    18,5O
I ALT                  2O3,5O
Kontant modtaget       500,00
Byttepenge             296,50
Dato: 03-10-26 Kl. 09:12
`

const UNKNOWN_SHOP = `
Café Solsikken
Strandvejen 4, 3000 Helsingør
Cappuccino x2           90,00
Kage                    45,00
AT BETALE              135,00
Moms                    27,00
3. okt. 2026
`

const NO_KEYWORD = `
SOME SHOP
VARE 1    12,00
VARE 2    48,50
VARE 3    9,95
`

// Rigtig OCR-tekst (Tesseract, enkelt tekstblok) fra et foto af en Netto-kvittering.
// OCR-fejl er bevaret: "axel 9195 17,90" er "2 x 18,95 37,90", rabatter står med minus EFTER beløbet.
const NETTO_REAL = `
Netto O
ø
Bjerggårds Alle 4
5740 Odense NØ
DANONINO 6X50G
axel 9195              17,90
RABAT  p                 18,96
CHEASY SKYR VAN. 1KG
2 x 30,95                61,90
RABA [                                 11,90
ÆBLESKIVER 18 STK         20,00
VITAMIN WELL ANTIOXI        16,00
PANT                     3,00
PINK DONUT                 7,00
Aftenrabat                3,50-
TOTAL                  111,44
BETALINGSKORT                    111,44
MOMS UDGØR       22,29
Du blev betjent af:
Kassen
at |  1086 06 10 26 19:14
Butik 7574  MOMSNR. 35954716
KIG FORBI WWW. NETTO. DK
`

// Samme kvittering, hvor beløbet er gledet ned på linjen under TOTAL (buet papir)
const NETTO_REAL_SPLIT = `
Netto 03
DANONINO 6X50G
CHEASY SKYR VAN. 1KG       19,20
TOTAL                           11
111,44
BETAL INGSKORI                   $
MOMS UDGØR       22,29
41   1 1086 DD 10 26 19:14
`

describe('parseReceiptText', () => {
  it('rigtig Netto-kvittering: total, butik og dato', () => {
    const r = parseReceiptText(NETTO_REAL, new Date(2026, 9, 6, 21))
    expect(r.total).toEqual({ ore: 11144, confidence: 'high' })
    expect(r.merchant?.value).toBe('Netto')
    expect(r.date?.value).toBe('2026-10-06')
  })

  it('rigtig Netto-kvittering hvor beløbet står på linjen under TOTAL', () => {
    expect(parseReceiptText(NETTO_REAL_SPLIT, new Date(2026, 9, 6, 21)).total?.ore).toBe(11144)
  })

  it('rabat med minus efter beløbet ("18,96-") trækkes fra i varesummen', () => {
    const r = parseReceiptText('VARE 2 x 18,95 37,90\nRABAT 18,96-\nVARE 20,00\nTOTAL 38,94', today)
    expect(r.total).toEqual({ ore: 3894, confidence: 'high' })
    expect(amountsInLine('RABAT 18,96-')).toEqual([1896])
  })

  it('Bilka: butik, dato og total med høj sikkerhed', () => {
    const r = parseReceiptText(BILKA, today)
    expect(r.merchant).toEqual({ value: 'Bilka', confidence: 'high' })
    expect(r.date).toEqual({ value: '2026-10-04', confidence: 'high' })
    expect(r.total).toEqual({ ore: 63875, confidence: 'high' })
  })

  it('ignorerer SUBTOTAL og MOMS som total', () => {
    const r = parseReceiptText('SUBTOTAL 100,00\nMOMS 20,00\nTOTAL 125,00', today)
    expect(r.total?.ore).toBe(12500)
  })

  it('Netto med OCR-støj (O i stedet for 0, små bogstaver, kort år)', () => {
    const r = parseReceiptText(NETTO_OCR_NOISE, today)
    expect(r.merchant?.value).toBe('Netto')
    expect(r.total?.ore).toBe(20350)
    expect(r.date?.value).toBe('2026-10-03')
  })

  it('ukendt butik: intet butiksnavn, men et forslag', () => {
    const r = parseReceiptText(UNKNOWN_SHOP, today)
    expect(r.merchant).toBeNull()
    expect(r.merchantHint).toBe('Café Solsikken')
    expect(r.total?.ore).toBe(13500)
    expect(r.date?.value).toBe('2026-10-03')
  })

  it('uden nøgleord: største beløb med lav sikkerhed', () => {
    const r = parseReceiptText(NO_KEYWORD, today)
    expect(r.total).toEqual({ ore: 4850, confidence: 'low' })
  })

  it('beløb på linjen efter nøgleordet', () => {
    const r = parseReceiptText('TOTALT\n249,00\n', today)
    expect(r.total?.ore).toBe(24900)
  })

  it.each([
    ['TOTAL 1.234,50', 123450],
    ['I ALT 99,95', 9995],
    ['IALT 12,00', 1200],
    ['AT BETALE 638.75', 63875],
    ['BELOB 50,00', 5000],
    ['TOTAL 638, 75', 63875],
  ])('total i "%s" → %i øre', (line, ore) => {
    expect(parseReceiptText(line, today).total?.ore).toBe(ore)
  })

  it('AT BETALE vinder over BELØB', () => {
    const r = parseReceiptText('BELØB 10,00\nAT BETALE 120,00\nBELØB 120,00', today)
    expect(r.total).toEqual({ ore: 12000, confidence: 'high' })
  })

  it('Rema: "NETTO" i momslinjen er ikke butikken, og nettobeløbet er ikke totalen', () => {
    const r = parseReceiptText('REMA 1000\nAGURK 8,00\nOST 42,00\nTOTAL 50,00\nKORT 50,00\nMOMS 25% 10,00\nNETTO 40,00', today)
    expect(r.merchant?.value).toBe('Rema 1000')
    expect(r.total).toEqual({ ore: 5000, confidence: 'high' })
  })

  it('OCR-fejl i nøgleordet: T0TAL, IOTAL og I AIT', () => {
    expect(parseReceiptText('VARE 10,00\nT0TAL 99,00\nDANKORT 99,00', today).total?.ore).toBe(9900)
    expect(parseReceiptText('VARE 10,00\nIOTAL 99,00', today).total?.ore).toBe(9900)
    expect(parseReceiptText('VARE 10,00\nI AIT 99,00', today).total?.ore).toBe(9900)
  })

  it('"TOTAL 12 STK" og "TOTAL INKL. PANT" er totalen; antal/pant alene er ikke', () => {
    expect(parseReceiptText('MÆLK 10,00\nTOTAL 12 STK 187,85', today).total?.ore).toBe(18785)
    expect(parseReceiptText('MÆLK 10,00\nPANT 3,00\nTOTAL INKL. PANT 13,00', today).total?.ore).toBe(1300)
  })

  it('bonus, saldo og "sparet i år" er aldrig totalen', () => {
    const text = 'COOP 365\nBRØD 20,00\nMÆLK 12,00\nTOTAL 32,00\nMOBILEPAY 32,00\nBonus i alt 0,64\nDu har sparet i år 1.245,50\nBonussaldo 312,40'
    const r = parseReceiptText(text, today)
    expect(r.total).toEqual({ ore: 3200, confidence: 'high' })
    expect(r.alternatives).not.toContain(124550)
  })

  it('kontant: "Givet" og byttepenge er ikke totalen', () => {
    const r = parseReceiptText('VARE 45,00\nI ALT 45,00\nGivet 100,00\nByttepenge 55,00', today)
    expect(r.total).toEqual({ ore: 4500, confidence: 'high' })
  })

  it('totalen kan ikke læses: betalingslinjen bruges', () => {
    const r = parseReceiptText('VARE A 20,00\nVARE B 30,00\nT*T#L\nDankort-Contactless 50,00', today)
    expect(r.total?.ore).toBe(5000)
  })

  it('uden nøgleord: beløbet der står flere gange vinder over det største', () => {
    const r = parseReceiptText('VARE 12,00\nVARE 48,50\n60,50\nKUNDEKLUB 2.000,00\n60,50', today)
    expect(r.total).toEqual({ ore: 6050, confidence: 'medium' })
    expect(r.alternatives).toContain(200000)
  })

  it('summen af varerne bekræfter totalen (også med rabat)', () => {
    const r = parseReceiptText('KAFFE 49,95\nKYLLING 59,00\nRABAT KYLLING -10,00\nTOTAL 98,95', today)
    expect(r.total).toEqual({ ore: 9895, confidence: 'high' })
  })

  it('giver andre sandsynlige beløb at vælge imellem', () => {
    const r = parseReceiptText('VARE 10,00\nSUM 10,00\nTOTAL 120,00\nBELØB 12,00', today)
    expect(r.total?.ore).toBe(12000)
    expect(r.alternatives.length).toBeGreaterThan(0)
    expect(r.alternatives).not.toContain(12000)
  })

  it('semikolon fra OCR i stedet for komma', () => {
    expect(amountsInLine('TOTAL 219;35')).toEqual([21935])
  })

  it('ingen tekst', () => {
    expect(parseReceiptText('', today)).toEqual({ merchant: null, merchantHint: null, date: null, total: null, alternatives: [] })
  })
})

describe('datoer', () => {
  it.each([
    ['04.10.2026', '2026-10-04'],
    ['4/10/2026', '2026-10-04'],
    ['04-10-26', '2026-10-04'],
    ['2026-10-04', '2026-10-04'],
    ['4. okt 2026', '2026-10-04'],
    ['04 OKT. 26', '2026-10-04'],
  ])('%s → %s', (input, iso) => {
    expect(parseReceiptText(input, today).date?.value).toBe(iso)
  })

  it('afviser umulige og fremtidige datoer', () => {
    expect(parseReceiptText('31.02.2026', today).date).toBeNull()
    expect(parseReceiptText('01.12.2026', today).date).toBeNull()
    expect(parseReceiptText('01.01.2019', today).date).toBeNull()
  })

  it('flere forskellige datoer giver mellem sikkerhed', () => {
    const r = parseReceiptText('04.10.2026\nByttes til 04.11.2025\n04.10.2026', today)
    expect(r.date).toEqual({ value: '2026-10-04', confidence: 'medium' })
  })
})

describe('amountsInLine', () => {
  it('finder beløb, men ikke datoer, procenter eller klokkeslæt', () => {
    expect(amountsInLine('04.10.2026 14:32')).toEqual([])
    expect(amountsInLine('MOMS 25,00 %')).toEqual([])
    expect(amountsInLine('2 X 12,95   25,90')).toEqual([1295, 2590])
    expect(amountsInLine('1 499,95')).toEqual([49995])
  })
})

describe('decimaler og komma', () => {
  it('638,75 kr. → 63875 øre (parseKr og parser er enige)', () => {
    expect(parseKr('638,75')).toBe(63875)
    expect(parseKr('638,75 kr.')).toBe(63875)
    expect(amountsInLine('638,75')).toEqual([63875])
  })
  it('heltal og tusinder', () => {
    expect(parseKr('1.000')).toBe(100000)
    expect(amountsInLine('1.000,00')).toEqual([100000])
  })
})

describe('TOTAL fra billeder (OCR-varianter)', () => {
  const items = 'NETTO\nMÆLK 12,95\nBRØD 25,00\n'
  const cases: Array<[string, string]> = [
    ['bred skrift: spredte bogstaver', 'T O T A L 37,95'],
    ['bred skrift: spredte bogstaver og tal', 'T O T A L   3 7 , 9 5'],
    ['komma læst som mellemrum', 'TOTAL 37 95'],
    ['fyldtegn', 'TOTAL..........37,95'],
    ['beløb længere nede', 'TOTAL\nDKK\n37,95'],
    ['S læst for 5', 'TOTAL 37,9S'],
    ['apostrof som komma', "TOTAL 37'95"],
    ['TOTA1 med punktum', 'TOTA1. 37,95'],
    ['DKK efter beløbet', 'TOTAL 37,95 DKK'],
    ['kolon og kr.', 'TOTAL: KR. 37,95'],
  ]
  for (const [name, totalLine] of cases)
    it(name, () => {
      const r = parseReceiptText(items + totalLine, today)
      expect(r.total).toEqual({ ore: 3795, confidence: 'high' })
    })

  it('beløbet på linjen over TOTAL', () => {
    expect(parseReceiptText(items + '37,95\nTOTAL', today).total?.ore).toBe(3795)
  })

  it('et klokkeslæt er ikke et beløb', () => {
    expect(amountsInLine('06.10.26 19:14')).toEqual([])
  })
})

// Rigtigt foto af en Føtex-bon (OCR-output fra appen; kassererens navn fjernet)
const FOTEX_PHOTO = `
VUE
Fi
6
;          å
&   ex             Kr
v
4
HO                               www. føtex.dk                               H
4       Se åbningstider på www.føtex.dk      p
m         MOD FREMVISNING AF KVITTERING        w
|     HAR VI UBEGRÆNSET BYTTERET PÅ DE      i
1       FLESTE VARER (MINUS FØDEVARER), -       +
HM         SÅ LÆNGE VAREN ER I ORIGINAL,         w
Å          UABNET OG INTAKT EMBALLAGE.          |
SE YDERLIGERE UNDTAGELSER PÅ          |
]                    FØTEX..DK.
|        Odense                    07 10 26
4              -yu
|           + MEJERI «
ARLA PRO. CHOK 479M|          19,95
j      RABAT                         5,95-
/      TOTAL                          14,00
/         DANKORT          14,00
7      MOMS UDGØR                    2,80
|           Du blev betjent af:
j             MOMS NR: 35 95 47 16
2103 — 356 701 12        12:01
www. føtex.dk
FØTEX ODENSE — 07 10 2026
T1f. 6558 3300
Se åbningstider på www.føtex.ck
MONE XD
`
// Samme foto, før beskæringen kunne skille papiret fra baggrunden (meget støj)
const FOTEX_PHOTO_NOISY = `
KA AA
SYYNNUN     HON         LE    f
1     HR
NNU    1
SEE
HORSE     HR BE
MUS UD    ) HAND EET       Ar
AO   HAM Mm ENN
AN  SA VDS SEM
i No UN BYS II PT
—            Fo jf 4 HH HI ERR SUM
FR  4 Ce FE
£                                 FR  HVER
jet!                                                          BESSESIITI TOD
få                                                       SFSR ARE) YIN W7
UMM
1             T    t     47                EN
1                           gg      gå X                         KRSESEE uy;       7
8                                            AN
Wa                                            YES
GAB bi)                                                                               BRRFSRE LES
CSERHER                                     Ed KN                                             EET
SE                                                     MU
1                 www. føtex.dk                 BER
Be            i                                                  HS
på ST » 4             Je  dbningst lder på WWW.T øtex.dk          DE
pe                  REN        BI
—         MOD FREMVISNING AF KVITTERING       BR
EN          HAR VI UBEGRÆNSET BYTTERET PÅ Di       KRAGE 1
HA          FLESTE VARER (MINUS FØDEVARER),      GM
gl HE j                  SÅ LÆNGE VAREN  ER I OR IGINAL :           MR q
N)                UÅBNET OG INTAKT EMBALLAGE.         KS
SN       j       SE YDERLIGERE UNDTAGELSER PÅ        US
ANN                                FØTEX . DK                        EM
s          /     Odenst                07 10 26        Wi
Br,          1                                         FM
p         HH        + MEJERI +
;          5    ARLA PRO. CHOK 479Mi        19,95
7       RABAT                          5.95
i       TOTAL                         14,00
/        DANKORT]        14,00
Hr     MOMS UDGØR                2,80
MM feed hl
| NE                Du blev bet jent  af:
1 He NY          MOMS NR: 35 95 47 16
HMM         21092 445882 OT gum         12:01
SYN                                       wuw, føtex.dk
UN           FØTEX ODENSE — 07 10 2026
ss HV                             [1f, 6558 3300
77              Se åbningstider på www.føtex.dk
021032610070120356
`

describe('foto af Føtex-bon: TOTAL 14,00 efter rabat', () => {
  const day = new Date(2026, 9, 7, 12)
  for (const [name, text] of [['beskåret', FOTEX_PHOTO], ['med støj fra baggrunden', FOTEX_PHOTO_NOISY]] as const)
    it(name, () => {
      const r = parseReceiptText(text, day)
      expect(r.total).toEqual({ ore: 1400, confidence: 'high' })
      expect(r.merchant?.value).toBe('Føtex')
      expect(r.date).toEqual({ value: '2026-10-07', confidence: 'high' })
    })

  it('rabat uden minus trækkes stadig fra', () => {
    const r = parseReceiptText('NETTO\nCHOK 19,95\nRABAT 5,95\nTOTAL 14,00\nDANKORT 14,00', day)
    expect(r.total).toEqual({ ore: 1400, confidence: 'high' })
  })

  it('dato med mellemrum: "07 10 26" og "07 10 2026"', () => {
    expect(parseReceiptText('ODENSE 07 10 26', day).date?.value).toBe('2026-10-07')
    expect(parseReceiptText('FØTEX ODENSE 07 10 2026', day).date?.value).toBe('2026-10-07')
    // Momsnummer er ikke en dato
    expect(parseReceiptText('MOMS NR: 35 95 47 16', day).date).toBeNull()
  })
})
