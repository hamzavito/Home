import { Baby, Briefcase, CalendarDays, Stethoscope, TreePalm, Users, type LucideIcon } from 'lucide-react'
import type { EventType, TaskPriority, TaskStatus } from '@/types/database'

/** Aftaletyper. Farven bruges kun til prikker/ikoner – tekst står altid i text-primary. */
export const eventTypes: Record<EventType, { label: string; color: string; icon: LucideIcon }> = {
  family: { label: 'Familie', color: '#6d5cff', icon: Users },
  work: { label: 'Arbejde', color: '#3b8fd9', icon: Briefcase },
  doctor: { label: 'Læge', color: '#d65a9c', icon: Stethoscope },
  vacation: { label: 'Ferie', color: '#0c9467', icon: TreePalm },
  kids: { label: 'Børn', color: '#e0912f', icon: Baby },
  other: { label: 'Andet', color: '#8a94a3', icon: CalendarDays },
}
export const eventTypeOrder: EventType[] = ['family', 'kids', 'doctor', 'work', 'vacation', 'other']

export const priorityLabels: Record<TaskPriority, string> = { low: 'Lav', normal: 'Normal', high: 'Høj' }
export const statusLabels: Record<TaskStatus, string> = { open: 'Åben', in_progress: 'I gang', done: 'Udført' }
