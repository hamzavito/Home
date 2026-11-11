import { unfoldIcsContent } from './icsImportLines'

/**
 * Checks the outer structure before an external calendar is parsed.
 * Does not fetch subscriptions or interpret untrusted event properties.
 */
export function validateIcsStructure(content: string): string[] {
  const lines = unfoldIcsContent(content)
  // A UTF-8 BOM is permitted only at the very beginning of the file.
  if (lines[0]?.startsWith('\uFEFF')) lines[0] = lines[0].slice(1)
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR') {
    throw new Error('Ugyldigt kalenderformat')
  }

  const stack: string[] = []
  let hasVersion = false
  for (const line of lines) {
    if (line === 'VERSION:2.0' && stack.length === 1 && stack[0] === 'VCALENDAR') {
      if (hasVersion) throw new Error('Ugyldigt kalenderformat')
      hasVersion = true
    }
    if (line.startsWith('BEGIN:')) {
      const name = line.slice(6)
      if (!/^[A-Z][A-Z0-9-]*$/.test(name) || (stack.length === 0 && name !== 'VCALENDAR')) {
        throw new Error('Ugyldigt kalenderformat')
      }
      if (name === 'VCALENDAR' && stack.length !== 0) throw new Error('Ugyldigt kalenderformat')
      if (stack.length >= 12) throw new Error('Ugyldigt kalenderformat')
      stack.push(name)
    } else if (line.startsWith('END:')) {
      const name = line.slice(4)
      if (stack.pop() !== name) throw new Error('Ugyldigt kalenderformat')
      if (stack.length === 0 && line !== lines.at(-1)) throw new Error('Ugyldigt kalenderformat')
    } else if (stack.length === 0 || !line.includes(':')) {
      throw new Error('Ugyldigt kalenderformat')
    }
  }
  if (stack.length !== 0 || !hasVersion) throw new Error('Ugyldigt kalenderformat')
  return lines
}
