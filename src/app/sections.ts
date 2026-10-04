import {
  Calendar,
  CalendarClock,
  Camera,
  CheckSquare,
  PiggyBank,
  Receipt,
  Settings,
  ShoppingCart,
  Wallet,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

/** Alle sektioner i appen. `phase` angiver hvornår sektionen bygges. */
export type Section = {
  path: string
  title: string
  icon: LucideIcon
  color: string
  phase: number
}

export const sections = {
  finance: { path: '/okonomi', title: 'Økonomi', icon: Wallet, color: '#2f7d6d', phase: 2 },
  budgets: { path: '/okonomi/budgetter', title: 'Budgetter', icon: WalletCards, color: '#3a7bd5', phase: 2 },
  upcoming: { path: '/okonomi/kommende', title: 'Kommende udgifter', icon: CalendarClock, color: '#d9822b', phase: 4 },
  receipts: { path: '/kvitteringer', title: 'Kvitteringer', icon: Receipt, color: '#8e6bd8', phase: 3 },
  savings: { path: '/opsparing', title: 'Opsparing', icon: PiggyBank, color: '#d4588a', phase: 4 },
  shopping: { path: '/indkob', title: 'Indkøb', icon: ShoppingCart, color: '#34a35c', phase: 5 },
  tasks: { path: '/hjemmet', title: 'Opgaver', icon: CheckSquare, color: '#e0a100', phase: 5 },
  calendar: { path: '/hjemmet/kalender', title: 'Kalender', icon: Calendar, color: '#e5484d', phase: 5 },
  settings: { path: '/indstillinger', title: 'Indstillinger', icon: Settings, color: '#8e8e93', phase: 1 },
} satisfies Record<string, Section>

/** Handlinger i den centrale +-menu */
export const addActions: Array<{ key: string; title: string; icon: LucideIcon; color: string; path: string; phase: number }> = [
  { key: 'expense', title: 'Ny udgift', icon: Wallet, color: '#2f7d6d', path: '/okonomi/ny', phase: 2 },
  { key: 'receipt', title: 'Scan kvittering', icon: Camera, color: '#8e6bd8', path: '/kvitteringer/scan', phase: 3 },
  { key: 'upcoming', title: 'Kommende udgift', icon: CalendarClock, color: '#d9822b', path: '/okonomi/kommende/ny', phase: 4 },
  { key: 'task', title: 'Ny opgave', icon: CheckSquare, color: '#e0a100', path: '/hjemmet/ny', phase: 5 },
  { key: 'event', title: 'Kalenderaftale', icon: Calendar, color: '#e5484d', path: '/hjemmet/kalender/ny', phase: 5 },
]

/** Fase der er bygget indtil nu. Hæves når en fase er færdig. */
export const CURRENT_PHASE = 1
