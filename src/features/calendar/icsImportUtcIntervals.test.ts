import { describe, expect, it } from 'vitest'
import { extractIcsUtcIntervals } from './icsImportUtcIntervals'

function calendar(events: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', events, 'END:VCALENDAR', ''].join('\r\n')
}
function event(uid: string, start = '20261112T070000Z', end = '20261112T150000Z'): string {
  return ['BEGIN:VEVENT', 'UID:' + uid, 'SUMMARY:Shift', 'DTSTART:' + start, 'DTEND:' + end, 'END:VEVENT'].join('\r\n')
}

describe('UTC ICS interval projection', () => {
  it('returns stable UTC ISO intervals', () => {
    expect(extractIcsUtcIntervals(calendar(event('shift-1')))).toEqual([{
      uid: 'shift-1',
      summary: 'Shift',
      startsAt: '2026-11-12T07:00:00.000Z',
      endsAt: '2026-11-12T15:00:00.000Z',
    }])
  })

  it.each([
    event('one', '20261112T150000Z', '20261112T070000Z'),
    event('one', '20261112T070000Z', '20261112T070000Z'),
    event('one', '20261112T070000', '20261112T150000Z'),
    event('one', '20261112T070000Z', '20261112T150000'),
    event('one', '20261112', '20261113'),
    event('one').replace('DTEND:20261112T150000Z\r\n', ''),
    event(''),
    event('one') + '\r\n' + event('one'),
  ])('rejects ambiguous, invalid or duplicate intervals', (events) => {
    expect(() => extractIcsUtcIntervals(calendar(events))).toThrow()
  })
})
