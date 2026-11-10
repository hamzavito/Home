import { describe, expect, it } from 'vitest'
import { escapeIcsText, foldIcsLine, serializeIcs, type ExportableEvent } from './icsExport'

const example: ExportableEvent = {
  id: 'a7427618-7867-4d3c-b880-3fb771db761b',
  title: 'Møde, familie; plan\\nplus',
  event_date: '2026-11-10',
  end_date: null,
  all_day: false,
  start_time: '09:30:00',
  end_time: '10:15:00',
  updated_at: '2026-11-01T12:30:00.000Z',
}

describe('iCalendar one-way export', () => {
  it('escapes title punctuation and newline characters', () => {
    expect(escapeIcsText('A\\B,C;D\nE')).toBe('A\\\\B\\,C\\;D\\nE')
  })
  it('keeps Unicode line separators inside the title instead of creating new ICS fields', () => {
    const malicious = 'Familieaftale\u2028BEGIN:VEVENT\u2029ATTENDEE:mailto:outside@example.com'
    const data = serializeIcs([{ ...example, title: malicious }])
    expect(data).toContain('SUMMARY:Familieaftale\\nBEGIN:VEVENT\\nATTENDEE:mailto:outside@example.com')
    expect(data.match(/BEGIN:VEVENT\\r\\n/g)).toHaveLength(1)
    expect(data).not.toContain('\\r\\nATTENDEE:')
  })
  it('uses local Danish times and a stable UID for timed events', () => {
    const data = serializeIcs([example], new Date('2026-11-10T05:00:00Z'))
    expect(data).toContain('UID:a7427618-7867-4d3c-b880-3fb771db761b@home-app\r\n')
    expect(data).toContain('DTSTART;TZID=Europe/Copenhagen:20261110T093000')
    expect(data).toContain('DTEND;TZID=Europe/Copenhagen:20261110T101500')
    expect(data).toContain('DTSTAMP:20261110T050000Z')
    expect(data).not.toContain('DESCRIPTION:')
    expect(data.endsWith('\r\n')).toBe(true)
  })
  it('adds exclusive end to multi-day all-day events', () => {
    const data = serializeIcs([{ ...example, all_day: true, end_date: '2027-01-01', event_date: '2026-12-31' }])
    expect(data).toContain('DTSTART;VALUE=DATE:20261231')
    expect(data).toContain('DTEND;VALUE=DATE:20270102')
  })
  it('folds long unicode lines at 75 UTF-8 octets', () => {
    const folded = foldIcsLine('SUMMARY:' + 'Æ'.repeat(60))
    for (const physical of folded.split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + 'Æ'.repeat(60))
  })
  it('does not invent an end time for a timed event without one', () => {
    const data = serializeIcs([{ ...example, end_time: null }])
    expect(data).not.toContain('DTEND;TZID=Europe/Copenhagen')
  })
})
