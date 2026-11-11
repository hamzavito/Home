import { addDaysIso } from '@/lib/home'

export type ExportableEvent = {
  id: string
  title: string
  event_date: string
  end_date: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  updated_at: string
}

/** RFC 5545 text escaping: backslash must be escaped before punctuation. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

/** RFC 5545 requires max 75 octets per physical line, folded with CRLF + space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const n = encoder.encode(char).length
    // Each continuation line begins with one space, which counts as one octet.
    if (bytes + n > (parts.length ? 74 : 75) && current) {
      parts.push(current)
      current = char
      bytes = n
    } else {
      current += char
      bytes += n
    }
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compactDate = (date: string) => date.replace(/-/g, '')
const compactTime = (time: string) => time.replace(/:/g, '').padEnd(6, '0').slice(0, 6)
const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/**
 * Manual one-way export of already-visible household events.
 * No event descriptions, attendees, reminders, account identifiers or banking information.
 * Timed events use Europe/Copenhagen local times with a recurring VTIMEZONE definition.
 */
export function serializeIcs(events: readonly ExportableEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Home App//Family Calendar Export//DA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Home App',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Copenhagen',
    'X-LIC-LOCATION:Europe/Copenhagen',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@home-app`,
      `DTSTAMP:${utcStamp(now)}`,
      `LAST-MODIFIED:${utcStamp(new Date(event.updated_at))}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
    )
    if (event.all_day || !event.start_time) {
      lines.push(
        `DTSTART;VALUE=DATE:${compactDate(event.event_date)}`,
        `DTEND;VALUE=DATE:${compactDate(addDaysIso(event.end_date ?? event.event_date, 1))}`,
      )
    } else {
      const endDate = event.end_date ?? event.event_date
      lines.push(`DTSTART;TZID=Europe/Copenhagen:${compactDate(event.event_date)}T${compactTime(event.start_time)}`)
      if (event.end_time) {
        lines.push(`DTEND;TZID=Europe/Copenhagen:${compactDate(endDate)}T${compactTime(event.end_time)}`)
      }
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/** Only call from a deliberate user action, not while rendering. */
export function downloadIcsFile(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
