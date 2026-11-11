import { describe, expect, it } from 'vitest'
import { parseCalendarSubscriptionUrl } from './subscriptionUrl'

describe('calendar subscription URL preflight', () => {
  it('accepts a private token in a public HTTPS feed URL without logging it', () => {
    const url = parseCalendarSubscriptionUrl('https://calendar.example.org/private/secret-token.ics?key=secret')
    expect(url.hostname).toBe('calendar.example.org')
    expect(url.searchParams.get('key')).toBe('secret')
  })

  it.each([
    'http://calendar.example.org/feed.ics',
    'https://localhost/feed.ics',
    'https://localhost.local/feed.ics',
    'https://calendar.internal/feed.ics',
    'https://127.0.0.1/feed.ics',
    'https://2130706433/feed.ics',
    'https://[::1]/feed.ics',
    'https://user:pass@calendar.example.org/feed.ics',
    'https://calendar.example.org:8443/feed.ics',
    'https://calendar.example.org/feed.ics#fragment',
    'https://calendar.example.org./feed.ics',
    'file:///etc/passwd',
    'https://calendar.example.org/feed.ics ',
    '',
  ])('rejects unsafe or unsupported calendar URL: %s', (input) => {
    expect(() => parseCalendarSubscriptionUrl(input)).toThrow()
  })

  it('does not echo secret URL values in validation errors', () => {
    expect(() => parseCalendarSubscriptionUrl('http://calendar.example.org/feed?token=very-private')).toThrow(
      'Kalenderlinket skal være en offentlig HTTPS-adresse',
    )
  })
})
