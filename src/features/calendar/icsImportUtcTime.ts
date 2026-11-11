/**
 * Strict conversion for RFC 5545 UTC DATE-TIME values only.
 * Floating local times and TZID-based values require separate timezone handling.
 * Never silently interpret a floating calendar time in the viewer's timezone.
 */
export function parseIcsUtcDateTime(value: string): Date {
  if (!/^\d{8}T\d{6}Z$/.test(value)) {
    throw new Error('Kalendertid kræver tidszonebehandling')
  }
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const hour = Number(value.slice(9, 11))
  const minute = Number(value.slice(11, 13))
  const second = Number(value.slice(13, 15))
  if (year < 100 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour > 23 || minute > 59 || second > 59) {
    throw new Error('Ugyldig kalendertid')
  }
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) {
    throw new Error('Ugyldig kalendertid')
  }
  return date
}
