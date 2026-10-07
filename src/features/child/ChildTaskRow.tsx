import { Check, Repeat } from 'lucide-react'
import { useSetTaskStatus, type Task } from '@/features/home/api'
import { dueLabel } from '@/features/upcoming/UpcomingPage'
import { cn } from '@/lib/cn'
import { recurrenceLabel } from '@/lib/home'
import { formatAmount } from '@/lib/money'

/** Barnets opgave: kun "I gang" og "Færdig" – ingen redigering. */
export function ChildTaskRow({ task }: { task: Task }) {
  const setStatus = useSetTaskStatus()
  const status = setStatus.isPending && setStatus.variables ? setStatus.variables.status : task.status
  const done = status === 'done'
  const overdue = !done && task.due_on !== null && dueLabel(task.due_on).startsWith('Forfaldt')
  const parts = [done ? 'Færdig' : status === 'in_progress' ? 'I gang' : null, !done && task.due_on ? dueLabel(task.due_on) : null].filter(Boolean)

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('break-words text-[16px] font-semibold leading-snug', done && 'text-secondary line-through')}>{task.title}</p>
          {(parts.length > 0 || task.recurrence !== 'none') && (
            <p className={cn('mt-0.5 flex items-center gap-1 text-[13px]', overdue ? 'font-semibold text-notice' : 'text-secondary')}>
              {task.recurrence !== 'none' && <Repeat className="size-3.5 shrink-0" aria-label={recurrenceLabel(task.recurrence, task.recurrence_interval)} />}
              <span className="truncate">{parts.join(' · ')}</span>
            </p>
          )}
          {task.description && <p className="mt-1 whitespace-pre-line text-[14px] text-secondary">{task.description}</p>}
        </div>
        {task.reward_ore !== null && (
          <span className="tabular shrink-0 rounded-full bg-positive-soft px-2.5 py-1 text-[13px] font-bold text-positive">+{formatAmount(task.reward_ore)} kr.</span>
        )}
      </div>
      <div className="mt-2.5 flex gap-2">
        {done ? (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: task.id, status: 'open' })}
            className="pressable h-10 rounded-full bg-surface-secondary px-4 text-[14px] font-semibold text-primary"
          >
            Ikke færdig alligevel
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-pressed={status === 'in_progress'}
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: task.id, status: status === 'in_progress' ? 'open' : 'in_progress' })}
              className={cn(
                'pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors',
                status === 'in_progress' ? 'bg-surface-accent text-accent-text' : 'bg-surface-secondary text-primary',
              )}
            >
              I gang
            </button>
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: task.id, status: 'done' })}
              aria-label={`Markér ${task.title} som færdig`}
              className="pressable inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
            >
              <Check className="size-4" strokeWidth={3} /> Færdig
            </button>
          </>
        )}
      </div>
      {setStatus.isError && <p className="mt-2 text-[13px] text-danger">Det kunne ikke gemmes. Prøv igen.</p>}
    </div>
  )
}
