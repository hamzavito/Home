import { describe, expect, it } from 'vitest'
import { extractIcsEventFields } from './icsImportEvents'

const calendar = (body: string) => ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR', ''].join('\r\n')
const event = (body: string) => ['BEGIN:VEVENT', body, 'END:VEVENT'].join('\r\n')

describe('read-only ICS event field extraction', () => {
  it('extracts raw fields without interpreting timezones or recurrence', () => {
    const input = calendar(event([
      'UID:shift-123',
      'DTSTART;TZID=Europe/Copenhagen:20261112T070000',
      'DTEND;TZID=Europe/Copenhagen:20261112T150000',
      'SUMMARY:Morning\r\n shift',
      'RRULE:FREQ=WEEKLY',
      'BEGIN:VALARM',
      'SUMMARY:Ignore alarm title',
      'END:VALARM',
    ].join('\r\n')))
    expect(extractIcsEventFields(input)).toEqual([{
      uid: 'shift-123',
      summary: 'Morningshift',
      dtstart: '20261112T070000',
      dtend: '20261112T150000',
    }])
  })

  it('returns no events for an empty calendar', () => {
    expect(extractIcsEventFields(calendar('PRODID:-//Home Test//EN'))).toEqual([])
  })

  it.each([
    event('UID:one\r\nSUMMARY:Missing start'),
    event('DTSTART:20261112T070000'),
    event('UID:one\r\nUID:two\r\nDTSTART:20261112T070000'),
    event('UID:one\r\nDTSTART:20261112T070000\r\nDTSTART:20261113T070000'),
  ])('rejects incomplete or duplicate required event properties', (body) => {
    expect(() => extractIcsEventFields(calendar(body))).toThrow('Ugyldigt kalenderformat')
  })
})
