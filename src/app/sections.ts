import {
  Calendar,
  CalendarClock,
  Camera,
  ChefHat,
  CheckSquare,
  PiggyBank,
  Receipt,
  Settings,
  ShoppingCart,
  Wallet,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

/** Alle sektioner i appen. */
export type Section = {
  path: string
  title: string
  icon: LucideIcon
  color: string
}

export const sections = {
  finance: { path: '/okonomi', title: 'Økonomi', icon: Wallet, color: '#5a3cf0' },
  budgets: { path: '/okonomi/budgetter', title: 'Budgetter', icon: WalletCards, color: '#6d5cff' },
  upcoming: { path: '/okonomi/kommende', title: 'Kommende udgifter', icon: CalendarClock, color: '#3b8fd9' },
  receipts: { path: '/kvitteringer', title: 'Kvitteringer', icon: Receipt, color: '#1aa59a' },
  savings: { path: '/opsparing', title: 'Opsparing', icon: PiggyBank, color: '#0c9467' },
  shopping: { path: '/indkob', title: 'Indkøb', icon: ShoppingCart, color: '#7fa82e' },
  tasks: { path: '/hjemmet', title: 'Opgaver', icon: CheckSquare, color: '#b08a5a' },
  calendar: { path: '/hjemmet/kalender', title: 'Kalender', icon: Calendar, color: '#d65a9c' },
  mealplan: { path: '/hjemmet/madplan', title: 'Madplan', icon: ChefHat, color: '#e07b39' },
  settings: { path: '/indstillinger', title: 'Indstillinger', icon: Settings, color: '#5f6b7a' },
} satisfies Record<string, Section>

/** Handlinger i den centrale +-menu */
export const addActions: Array<{ key: string; title: string; icon: LucideIcon; color: string; path: string }> = [
  { key: 'expense', title: 'Ny udgift', icon: Wallet, color: '#5a3cf0', path: '/okonomi/ny' },
  { key: 'receipt', title: 'Scan kvittering', icon: Camera, color: '#1aa59a', path: '/kvitteringer/scan' },
  { key: 'upcoming', title: 'Kommende udgift', icon: CalendarClock, color: '#3b8fd9', path: '/okonomi/kommende/ny' },
  { key: 'task', title: 'Ny opgave', icon: CheckSquare, color: '#b08a5a', path: '/hjemmet/ny' },
  { key: 'event', title: 'Kalenderaftale', icon: Calendar, color: '#d65a9c', path: '/hjemmet/kalender/ny' },
  { key: 'recipe', title: 'Ny opskrift', icon: ChefHat, color: '#e07b39', path: '/hjemmet/madplan/opskrift/ny' },
]
