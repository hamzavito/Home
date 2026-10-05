# Designsystem

Eget designsystem med en moderne nordisk fintech-følelse:
ca. 70 % Lunar-inspireret (personligt, levende, store tal, kort) og 30 % Nordnet-inspireret
(tættere økonomioversigter, fordelinger, procenter). Ingen kopierede logoer, illustrationer eller layouts.

## Farver (`src/index.css`)

| Token | Brug |
|---|---|
| `--bg` | Varm off-white (lyst) / næsten sort `#09090b` (mørkt) |
| `--surface-1/2/3` | Tre overfladeniveauer: kort, tonede kort, indlejrede elementer |
| `--accent` (iris) | Primær handling, aktiv fane, fokus. Bruges sparsomt |
| `--positive` | Tilbage i budget, opsparing |
| `--notice` / `--warning` / `--danger` | 70–90 % / 90–100 % / over 100 % af budget |
| `--hero-bg` | Mørkt blæk-kort med iris-glød (også i lyst tema) |

Kategorifarver (`src/lib/categories.ts`) er bevidst uden rød/orange, som er forbeholdt advarsler.

## Typografi

Inter (selvhostet, variabel). Beløb bruger `tabular` (tabulære tal). Store beløb (`Money size="hero"`)
er 46 px fed, og "kr." er mindre og dæmpet, så tallet dominerer.

## Komponenter

| Komponent | Fil |
|---|---|
| Card (default / tonal / hero), CardLabel | `components/ui/Card.tsx` |
| PageHeader, SectionHeader | `components/ui/` |
| Money, ProgressBar (statusfarver + tempo-markør) | `components/ui/` |
| BottomSheet, Button, Field/TextInput/AmountInput, SegmentedControl, MonthSwitcher, MonthStepper, EmptyState, Skeleton | `components/ui/` |
| MoneyCard, BudgetCard, BudgetRow, StatCard, SavingsCard, TransactionRow, ShareList, CategoryIcon | `components/finance/` |
| SpendingChart (forbrug gennem måneden vs. jævnt tempo) | `components/charts/` |

## Budgetstatus (`src/lib/budget.ts`)

0–70 % normal (accent) · 70–90 % `notice` · 90–100 % `warning` · over 100 % `danger`.
Kun baren og procent-mærket farves – resten af kortet forbliver roligt.

## Bevægelse

Kort og diskret: sideskift (fade + 6 px), sheets (spring), progress (vokser ind), grafer (tegnes),
tryk på kort (`pressable`, skalerer til 97,5 %). Respekterer "reducer bevægelse".
