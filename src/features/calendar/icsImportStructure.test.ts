import { describe, expect, it } from 'vitest'
import { validateIcsStructure } from './icsImportStructure'

const valid = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:shift-1',
  'SUMMARY:Night shift',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n')

describe('external ICS structural validation', () => {
  it('accepts a simple calendar and a UTF-8 BOM', () => {
    expect(validateIcsStructure(valid)).toContain('UID:shift-1')
    expect(validateIcsStructure('\uFEFF' + valid)[0]).toBe('BEGIN:VCALENDAR')
  })

  it('accepts folded event titles and nested alarm components', () => {
    const input = valid.replace('SUMMARY:Night shift', 'SUMMARY:Night\r\n shift\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nEND:VALARM')
    expect(validateIcsStructure(input)).toContain('SUMMARY:Nightshift')
  })

  it.each([
    valid.replace('END:VEVENT', 'END:VTODO'),
    valid.replace('VERSION:2.0\r\n', ''),
    valid.replace('VERSION:2.0', 'VERSION:3.0'),
    valid.replace('END:VCALENDAR', 'END:VEVENT'),
    valid + 'BEGIN:VCALENDAR\r\n',
    valid.replace('BEGIN:VEVENT', 'BEGIN:VCALENDAR'),
    valid.replace('UID:shift-1', 'NO_COLON'),
    valid.replace('VERSION:2.0', 'VERSION:2.0\r\nVERSION:2.0'),
  ])('rejects invalid or ambiguous ICS structure', (input) => {
    expect(() => validateIcsStructure(input)).toThrow('Ugyldigt kalenderformat')
  })
})
