import { Check, Flag, Repeat } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { useHousehold } from '@/features/household/HouseholdProvider'
import { dueLabel } from '@/features/upcoming/UpcomingPage'
import { cn } from '@/lib/cn'
import { recurrenceLabel } from '@/lib/home'
import { useSetTaskStatus, type Task } from './api'

/** Opgave i en liste: rund knap til at markere udført + titel, frist og ansvarlig. */
export function TaskRow({ task }: { task: Task }) {
  const { members } = useHousehold()
  const setStatus = useSetTaskStatus()
  const done = task.status === 'done'
  const assignee = members.find((m) => m.userId === task.assignee_id)
  const assigneeIndex = members.findIndex((m) => m.userId === task.assignee_id)
  const overdue = !done && task.due_on !== null && dueLabel(task.due_on).startsWith('Forfaldt')
  // Mens kaldet kører vises den nye status, så et dobbelttryk ikke sender to kald
  const pending = setStatus.isPending
  const shownDone = pending ? setStatus.variables?.status === 'done' : done

  const parts = [
    task.status === 'in_progress' ? 'I gang' : null,
    done ? 'Udført' : task.due_on ? dueLabel(task.due_on) : null,
    assignee ? assignee.displayName : null,
    task.reward_status === 'awaiting_approval' ? 'Afventer godkendelse' : task.reward_status === 'paid' ? 'Belønning udbetalt' : null,
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={shownDone}
        aria-label={shownDone ? `Genåbn ${task.title}` : `Markér ${task.title} som udført`}
        disabled={pending}
        onClick={() => setStatus.mutate({ id: task.id, status: done ? 'open' : 'done' })}
        className={cn(
          'pressable flex size-11 shrink-0 items-center justify-center rounded-full',
          // Usynlig 44px trykflade omkring en 28px cirkel
        )}
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2 transition-colors',
            shownDone ? 'border-positive bg-positive text-on-accent' : task.status === 'in_progress' ? 'border-accent bg-surface-accent' : 'border-strong',
          )}
        >
          {shownDone && <Check className="size-4 [animation:pop_300ms_var(--ease-spring)]" strokeWidth={3} />}
        </span>
      </button>
      <Link to={`/hjemmet/opgave/${task.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-1">
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[16px] font-semibold', shownDone && 'text-secondary line-through')}>{task.title}</p>
          {parts.length > 0 && (
            <p className={cn('flex items-center gap-1 truncate text-[13px]', overdue ? 'font-semibold text-notice' : 'text-secondary')}>
              {task.recurrence !== 'none' && <Repeat className="size-3.5 shrink-0" aria-label={recurrenceLabel(task.recurrence, task.recurrence_interval)} />}
              <span className="truncate">{parts.join(' · ')}</span>
            </p>
          )}
        </div>
        {task.priority === 'high' && !done && <Flag className="size-4 shrink-0 text-notice" aria-label="Høj prioritet" strokeWidth={2.4} />}
        {assignee && <Avatar name={assignee.displayName} color={assignee.color} index={assigneeIndex} className="size-7 text-[11px]" />}
      </Link>
    </div>
  )
}
