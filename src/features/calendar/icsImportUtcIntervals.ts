import { extractIcsEventFields } from './icsImportEvents'
import { parseIcsUtcDateTime } from './icsImportUtcTime'

/**
 * Strict, read-only UTC interval projection for a future ICS subscription importer.
 * Unsupported timezone/floating/all-day and recurrence semantics must not be guessed.
 * This does not persist, fetch, or share imported calendar data.
 */
export interface ImportedUtcInterval {
  uid: string
  summary: string | null
  startsAt: string
  endsAt: string
}

export function extractIcsUtcIntervals(content: string): ImportedUtcInterval[] {
  const fields = extractIcsEventFields(content)
  const seen = new Set<string>()
  return fields.map((event) => {
    if (!event.uid.trim() || seen.has(event.uid) || !event.dtend) {
      throw new Error('Ugyldigt kalenderformat')
    }
    seen.add(event.uid)
    const start = parseIcsUtcDateTime(event.dtstart)
    const end = parseIcsUtcDateTime(event.dtend)
    if (end.getTime() <= start.getTime()) {
      throw new Error('Ugyldigt kalenderinterval')
    }
    return {
      uid: event.uid,
      summary: event.summary,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }
  })
}
