import { validateIcsStructure } from './icsImportStructure'

/** Raw, untrusted VEVENT properties for a future read-only subscription importer.
 * No timezone, recurrence, HTML, or sharing semantics are inferred here.
 */
export interface ImportedIcsEventFields {
  uid: string
  summary: string | null
  dtstart: string
  dtend: string | null
}

export function extractIcsEventFields(content: string): ImportedIcsEventFields[] {
  const lines = validateIcsStructure(content)
  const events: ImportedIcsEventFields[] = []
  let depth = 0
  let event: { uid?: string; summary?: string; dtstart?: string; dtend?: string } | null = null

  for (const line of lines) {
    if (line.startsWith('BEGIN:')) {
      if (line === 'BEGIN:VEVENT' && depth === 1) event = {}
      depth++
      continue
    }
    if (line.startsWith('END:')) {
      if (line === 'END:VEVENT' && depth === 2 && event) {
        if (!event.uid || !event.dtstart) throw new Error('Ugyldigt kalenderformat')
        events.push({
          uid: event.uid,
          summary: event.summary ?? null,
          dtstart: event.dtstart,
          dtend: event.dtend ?? null,
        })
        if (events.length > 5000) throw new Error('Kalenderfilen er for stor')
        event = null
      }
      depth--
      continue
    }
    // Ignore VALARM and other nested component properties.
    if (!event || depth !== 2) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const name = line.slice(0, colon).split(';', 1)[0]
    const value = line.slice(colon + 1)
    if (name !== 'UID' && name !== 'SUMMARY' && name !== 'DTSTART' && name !== 'DTEND') continue
    if (Object.prototype.hasOwnProperty.call(event, name.toLowerCase())) {
      throw new Error('Ugyldigt kalenderformat')
    }
    if (name === 'UID') event.uid = value
    if (name === 'SUMMARY') event.summary = value
    if (name === 'DTSTART') event.dtstart = value
    if (name === 'DTEND') event.dtend = value
  }
  return events
}
