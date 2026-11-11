import { extractIcsEventFields } from './icsImportEvents'
import { validateIcsStructure } from './icsImportStructure'
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

function rejectUnsupportedEventSemantics(content: string): void {
  const lines = validateIcsStructure(content)
  let depth = 0
  let inEvent = false
  for (const line of lines) {
    if (line.startsWith('BEGIN:')) {
      if (line === 'BEGIN:VEVENT' && depth === 1) inEvent = true
      depth++
      continue
    }
    if (line.startsWith('END:')) {
      if (line === 'END:VEVENT' && depth === 2) inEvent = false
      depth--
      continue
    }
    if (!inEvent || depth !== 2) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const property = line.slice(0, colon)
    const name = property.split(';', 1)[0]
    // Do not silently discard recurrence rules or timezone/value parameters.
    if (['RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID', 'DURATION', 'EXRULE'].includes(name) ||
        ((name === 'DTSTART' || name === 'DTEND') && property !== name)) {
      throw new Error('Kalenderbegivenheden kræver særskilt tidszone- eller gentagelsesbehandling')
    }
  }
}

export function extractIcsUtcIntervals(content: string): ImportedUtcInterval[] {
  rejectUnsupportedEventSemantics(content)
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
