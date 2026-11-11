/**
 * First, format-only stage of an external ICS import.
 * RFC 5545 folds a logical content line by inserting CRLF + SP/HTAB.
 * This function never fetches, stores or trusts subscription URLs.
 * It intentionally does not parse events or recurrence rules.
 */
export function unfoldIcsContent(input: string): string[] {
  if (new TextEncoder().encode(input).length > 2_000_000) {
    throw new Error('Kalenderfilen er for stor')
  }
  if (input.includes('\0') || /(?<!\r)\n|\r(?!\n)/.test(input)) {
    throw new Error('Ugyldigt kalenderformat')
  }

  const physical = input.split('\r\n')
  if (physical.at(-1) === '') physical.pop()
  const lines: string[] = []
  for (const line of physical) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (!lines.length) throw new Error('Ugyldigt kalenderformat')
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
    if (lines.length > 20_000 || (lines.at(-1)?.length ?? 0) > 100_000) {
      throw new Error('Kalenderfilen er for stor')
    }
  }
  return lines
}
