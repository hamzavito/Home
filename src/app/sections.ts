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
  finance: { path: '/okonomi', title: 'Økonomi', icon: Wallet, color: '#5a3cf0', phase: 2 },
  budgets: { path: '/okonomi/budgetter', title: 'Budgetter', icon: WalletCards, color: '#6d5cff', phase: 2 },
  upcoming: { path: '/okonomi/kommende', title: 'Kommende udgifter', icon: CalendarClock, color: '#3b8fd9', phase: 4 },
  receipts: { path: '/kvitteringer', title: 'Kvitteringer', icon: Receipt, color: '#1aa59a', phase: 3 },
  savings: { path: '/opsparing', title: 'Opsparing', icon: PiggyBank, color: '#0c9467', phase: 4 },
  shopping: { path: '/indkob', title: 'Indkøb', icon: ShoppingCart, color: '#7fa82e', phase: 5 },
  tasks: { path: '/hjemmet', title: 'Opgaver', icon: CheckSquare, color: '#b08a5a', phase: 5 },
  calendar: { path: '/hjemmet/kalender', title: 'Kalender', icon: Calendar, color: '#d65a9c', phase: 5 },
  settings: { path: '/indstillinger', title: 'Indstillinger', icon: Settings, color: '#5f6b7a', phase: 1 },
} satisfies Record<string, Section>

/** Handlinger i den centrale +-menu */
export const addActions: Array<{ key: string; title: string; icon: LucideIcon; color: string; path: string; phase: number }> = [
  { key: 'expense', title: 'Ny udgift', icon: Wallet, color: '#5a3cf0', path: '/okonomi/ny', phase: 2 },
  { key: 'receipt', title: 'Scan kvittering', icon: Camera, color: '#1aa59a', path: '/kvitteringer/scan', phase: 3 },
  { key: 'upcoming', title: 'Kommende udgift', icon: CalendarClock, color: '#3b8fd9', path: '/okonomi/kommende/ny', phase: 4 },
  { key: 'task', title: 'Ny opgave', icon: CheckSquare, color: '#b08a5a', path: '/hjemmet/ny', phase: 5 },
  { key: 'event', title: 'Kalenderaftale', icon: Calendar, color: '#d65a9c', path: '/hjemmet/kalender/ny', phase: 5 },
]

/** Fase der er bygget indtil nu. Hæves når en fase er færdig. */
export const CURRENT_PHASE = 3
