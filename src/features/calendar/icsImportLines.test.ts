import { describe, expect, it } from 'vitest'
import { unfoldIcsContent } from './icsImportLines'

describe('external ICS line unfolding', () => {
  it('unfolds space and tab continuations without dropping content', () => {
    expect(unfoldIcsContent('BEGIN:VCALENDAR\r\nSUMMARY:Night \r\n shift\r\nDESCRIPTION:First\r\n\tsecond\r\nEND:VCALENDAR\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'SUMMARY:Night shift',
      'DESCRIPTION:Firstsecond',
      'END:VCALENDAR',
    ])
  })

  it('preserves escaped newline text inside event values', () => {
    expect(unfoldIcsContent('SUMMARY:Line\\nTwo\r\n')).toEqual(['SUMMARY:Line\\nTwo'])
  })

  it.each([' continuation\r\n', 'SUMMARY:One\nTwo', 'SUMMARY:One\rTwo', 'SUMMARY:One\0Two'])(
    'rejects malformed ICS input',
    (input) => expect(() => unfoldIcsContent(input)).toThrow('Ugyldigt kalenderformat'),
  )

  it('rejects oversized calendar input before processing', () => {
    expect(() => unfoldIcsContent('X'.repeat(2_000_001))).toThrow('Kalenderfilen er for stor')
  })

  it('rejects pathological unfolded logical lines', () => {
    const input = 'SUMMARY:a\r\n' + ' ' + 'x'.repeat(100_000) + '\r\n'
    expect(() => unfoldIcsContent(input)).toThrow('Kalenderfilen er for stor')
  })
})
